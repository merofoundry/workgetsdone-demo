import { describe, expect, it } from 'vitest';
import { handler } from './delete-plan';
const ID = '11111111-1111-4111-8111-111111111111';
const n = (count: number) => [{ n: count }];
const rows = (count: number, extra: Record<string, unknown> = {}, prefix = 'r') => Array.from({ length: count }, (_, i) => ({ key: `${prefix}${i}`, project: null, company: null, ...extra }));
const run = (name: string, state: Record<string, unknown>, normalized: Record<string, unknown> = {}) => handler({ record: { valid: true, normalized: { id: ID, dryRun: false, strategy: null, now: '2026-10-11T12:00:00.000Z', ...normalized }, ...state } as any, input: { name, actor: 'actor-1' } }) as any;
describe('byof-delete-plan', () => {
  it('blocks a company referenced by two projects', () => {
    const out = run('companies.delete', { projectsRows: n(2), tasksRows: n(0), callsRows: n(0), associationsRows: n(0) });
    expect(out.plan.blocked).toBe(true); expect(out.plan.reasons).toEqual([{ kind: 'projects', count: 2 }]);
    expect(out.blockedBody.error.reasons).toEqual([{ kind: 'projects', count: 2 }]); expect(out.blockedBody.error.message).toBe('This record cannot be deleted yet.');
    expect(out.dryRunBody.data.blocked).toBe(true);
  });
  it('lets an unreferenced company go and reports done in one call', () => {
    const out = run('companies.delete', { projectsRows: n(0), tasksRows: n(0), callsRows: n(0), associationsRows: n(0) });
    expect(out.plan.blocked).toBe(false); expect(out.plan.reasons).toEqual([]); expect(out.slotCount).toBe(0); expect(out.last).toBe(true);
    expect(out.doneBody).toEqual({ data: { ok: true, done: true, remaining: 0 } });
  });
  it('blocks a contact that is referenced and counts every kind', () => {
    const out = run('contacts.delete', { projectsRows: n(1), callsRows: n(2), tasksRows: n(0), companiesRows: n(1), associationsRows: [] });
    expect(out.plan.reasons).toEqual([{ kind: 'projects', count: 1 }, { kind: 'calls', count: 2 }, { kind: 'companies', count: 1 }]);
  });
  it('removes the associations of a free contact in slots', () => {
    const out = run('contacts.delete', { projectsRows: n(0), callsRows: n(0), tasksRows: n(0), companiesRows: n(0), associationsRows: rows(5, {}, 'a') });
    expect(out.plan.blocked).toBe(false); expect(out.plan.children.associations).toBe(5);
    expect(out.slotCount).toBe(3); expect(out.last).toBe(false); expect(out.doneBody.data).toEqual({ ok: true, done: false, remaining: 2 });
    expect(out.slots[0]).toEqual({ id: 'a0', data: { mark_deleted: true, deleted_at: '2026-10-11T12:00:00.000Z' } });
  });
  it('blocks a project with children whatever the strategy and still offers both strategies', () => {
    const state = { subprojectsRows: n(0), tasksRows: rows(2, {}, 't'), callsRows: rows(1, {}, 'c'), notesRows: [], filesRows: [] };
    for (const strategy of [null, 'cascade', 'reparent']) {
      const out = run('projects.delete', state, { strategy }); expect(out.plan.blocked).toBe(true); expect(out.plan.reasons).toEqual([{ kind: 'children', count: 3 }]); expect(out.plan.strategies).toEqual(['cascade', 'reparent']); expect(out.plan.children).toMatchObject({ tasks: 2, calls: 1, notes: 0, files: 0, subprojects: 0 });
    }
    const empty = run('projects.delete', { subprojectsRows: n(0), tasksRows: [], callsRows: [], notesRows: [], filesRows: [] }, { strategy: 'cascade' }); expect(empty.plan.blocked).toBe(false); expect(empty.plan.strategies).toEqual([]);
  });
  it('blocks a project with sub-projects whatever the strategy', () => {
    const out = run('projects.delete', { subprojectsRows: n(1), tasksRows: [], callsRows: [], notesRows: [], filesRows: [] }, { strategy: 'cascade' });
    expect(out.plan.blocked).toBe(true); expect(out.plan.reasons).toEqual([{ kind: 'subprojects', count: 1 }]);
  });
  it('cascades leaf first in batches of four and reparents only direct children', () => {
    const state = { subprojectsRows: n(0), tasksRows: rows(2, { project: ID, company: 'co1' }, 't'), callsRows: rows(1, { project: null, company: null }, 'c'), notesRows: rows(1, {}, 'n'), filesRows: rows(2, {}, 'f') };
    const cascade = run('projects.deleteChildren', state, { strategy: 'cascade' });
    expect(cascade.slots.map((s: any) => s.id)).toEqual(['f0', 'f1', 'n0', 'c0']); expect(cascade.slotCount).toBe(4); expect(cascade.last).toBe(false); expect(cascade.doneBody.data.remaining).toBe(2);
    expect(cascade.slots[0].data).toEqual({ mark_deleted: true, deleted_at: '2026-10-11T12:00:00.000Z', deleted_by: 'actor-1', project: null, company: null, contact: null });
    const move = run('projects.deleteChildren', { ...state, targetCompany: 'co9' }, { strategy: 'reparent' });
    expect(move.slots.map((s: any) => s.id)).toEqual(['t0', 't1']); expect(move.last).toBe(true);
    expect(move.slots[0].data).toEqual({ mark_deleted: false, deleted_at: null, deleted_by: null, project: null, company: 'co9', contact: null });
  });
  it('counts a note with two files and plans their removal', () => {
    const out = run('notes.delete', { filesRows: rows(2, {}, 'f') });
    expect(out.plan.blocked).toBe(false); expect(out.plan.children.files).toBe(2); expect(out.slots.map((s: any) => s.id)).toEqual(['f0', 'f1']); expect(out.last).toBe(true);
    expect(out.slots[0].data).toEqual({ mark_deleted: true, deleted_at: '2026-10-11T12:00:00.000Z', deleted_by: 'actor-1' });
  });
  it('moves the calls and notes of a task to the task project and company', () => {
    const out = run('tasks.delete', { callsRows: rows(1, {}, 'c'), notesRows: rows(2, {}, 'n'), targetProject: 'p1', targetCompany: 'co1' });
    expect(out.plan.children).toMatchObject({ calls: 1, notes: 2 }); expect(out.slots.map((s: any) => s.id)).toEqual(['c0', 'n0', 'n1']);
    expect(out.slots[0].data).toEqual({ task: null, project: 'p1', company: 'co1', contact: null });
  });
  it('moves the notes of a call to its task, else project, else company', () => {
    const out = run('calls.delete', { notesRows: rows(1, {}, 'n'), targetTask: 't1', targetProject: 'p1', targetCompany: 'co1' });
    expect(out.slots[0]).toEqual({ id: 'n0', data: { call: null, task: 't1', project: 'p1', company: 'co1', contact: null } });
  });
  it('falls back to the contact and blocks with orphans when nothing can adopt the children', () => {
    const t = run('tasks.delete', { callsRows: rows(1, { contact: 'k0' }, 'c'), notesRows: rows(1, {}, 'n'), targetContact: 'kt' });
    expect(t.plan.blocked).toBe(false); expect(t.slots[0].data).toEqual({ task: null, project: null, company: null, contact: 'kt' });
    const kept = run('tasks.delete', { callsRows: rows(1, { contact: 'k0' }, 'c'), notesRows: [], targetCompany: 'co1' }); expect(kept.slots[0].data.contact).toBe('k0');
    const orphan = run('tasks.delete', { callsRows: rows(1, {}, 'c'), notesRows: rows(2, {}, 'n') });
    expect(orphan.plan.blocked).toBe(true); expect(orphan.plan.reasons).toEqual([{ kind: 'orphans', count: 3 }]); expect(orphan.blockedBody.error.reasons).toEqual([{ kind: 'orphans', count: 3 }]);
    expect(run('tasks.delete', { callsRows: [], notesRows: [] }).plan.blocked).toBe(false);
    const c = run('calls.delete', { notesRows: rows(1, {}, 'n'), targetContact: 'kc' }); expect(c.plan.blocked).toBe(false); expect(c.slots[0].data).toEqual({ call: null, task: null, project: null, company: null, contact: 'kc' });
    expect(run('calls.delete', { notesRows: rows(2, {}, 'n') }).plan.reasons).toEqual([{ kind: 'orphans', count: 2 }]);
    const base = { subprojectsRows: n(0), tasksRows: rows(2, { project: ID }, 't'), callsRows: [], notesRows: [], filesRows: [] };
    const viaContact = run('projects.deleteChildren', { ...base, targetContact: 'kp' }, { strategy: 'reparent' }); expect(viaContact.plan.blocked).toBe(false); expect(viaContact.slots[0].data).toMatchObject({ project: null, company: null, contact: 'kp' });
    const orphans = run('projects.deleteChildren', base, { strategy: 'reparent' }); expect(orphans.plan.blocked).toBe(true); expect(orphans.plan.reasons).toEqual([{ kind: 'orphans', count: 2 }]);
    expect(run('projects.deleteChildren', base, { strategy: 'cascade' }).plan.blocked).toBe(false);
  });
  it('refuses a malformed dataset', () => { expect(() => run('companies.delete', { projectsRows: [], tasksRows: n(0), callsRows: n(0), associationsRows: n(0) })).toThrow(); });
});
