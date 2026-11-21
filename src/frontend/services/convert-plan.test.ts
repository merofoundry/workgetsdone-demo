import { describe, expect, it } from 'vitest';
import { handler } from './convert-plan';
const run = (note: Record<string, unknown>, extra: Record<string, unknown> = {}) => handler({ record: { normalized: { id: 'n1', fields: { client_ref: 'c1' } }, noteRows: [note], ...extra }, input: { actor: 'me' } }) as any;
const ONLY_PARENT = 'This note has no project, company or contact to attach the task to.';
describe('byof-convert-plan', () => {
  it('maps the note onto the task data', () => {
    const out = run({ key: 'n1', description: 'Call back', body: 'Details', project: 'p1', company: 'co1', contact: null });
    expect(out.taskData).toEqual({ name: 'Call back', description: 'Details', project: 'p1', company: 'co1', contact: null, source_note: 'n1', client_ref: 'c1' });
    expect(out.blocked).toBe(false); expect(out.reuse).toBe(false);
  });
  it('truncates the title and falls back to the title as description', () => {
    const out = run({ key: 'n1', description: 'x'.repeat(300), body: '', project: 'p1' });
    expect(out.taskData.name).toHaveLength(255); expect(out.taskData.description).toHaveLength(300);
  });
  it('refuses an already converted note', () => {
    const out = run({ key: 'n1', description: 'a', project: 'p1', converted_task: 't1' });
    expect(out.blocked).toBe(true); expect(out.blockBody.error.message).toBe('This note was already converted.');
  });
  it('refuses an archived but unconverted note', () => {
    const out = run({ key: 'n1', description: 'a', project: 'p1', archived: true });
    expect(out.blocked).toBe(true); expect(out.blockBody.error.message).toBe('This note is archived.');
  });
  it('takes missing links from the parent task, then the parent call, field by field', () => {
    const out = run({ key: 'n1', description: 'a', task: 't1', call: 'k1', contact: 'ct0' }, { parentTaskRows: [{ key: 't1', project: 'p1', company: null, contact: 'ct1' }], parentCallRows: [{ key: 'k1', project: 'p9', company: 'co9', contact: 'ct9' }] });
    expect(out.taskData.project).toBe('p1'); expect(out.taskData.company).toBe('co9'); expect(out.taskData.contact).toBe('ct0'); expect(out.blocked).toBe(false);
  });
  it('carries the project of a parent call when the note has only a call', () => {
    const out = run({ key: 'n1', description: 'a', call: 'k1' }, { parentCallRows: [{ key: 'k1', project: 'p9' }] });
    expect(out.taskData.project).toBe('p9'); expect(out.blocked).toBe(false);
  });
  it('refuses when no project, company or contact can be found', () => {
    const out = run({ key: 'n1', description: 'a', task: 't1' }, { parentTaskRows: [{ key: 't1', project: null, company: null, contact: null }], parentCallRows: [] });
    expect(out.blocked).toBe(true); expect(out.blockBody.error.message).toBe(ONLY_PARENT);
  });
  it('reuses a task from an earlier half-finished attempt, even without links', () => {
    const out = run({ key: 'n1', description: 'a', task: 't1' }, { existingTaskRows: [{ key: 'tx' }] });
    expect(out.reuse).toBe(true); expect(out.blocked).toBe(false);
  });
  it('throws without the note dataset', () => {
    expect(() => handler({ record: { normalized: {} }, input: {} })).toThrow();
  });
});
