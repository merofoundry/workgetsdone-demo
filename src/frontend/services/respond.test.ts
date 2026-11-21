import { describe, expect, it } from 'vitest';
import { handler } from './respond';
export const state = (name: string, datasets: Record<string, any[]>, normalized: Record<string, unknown> = {}, expected?: { key: string; count: boolean }[]) => ({
  record: { valid: true, normalized: { cursor: 0, includeClosed: false, query: '', kinds: [], limit: 6, ...normalized }, ...Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key + 'Rows', rows])) },
  input: { name, expected: expected ?? Object.keys(datasets).map(key => ({ key, count: false })) },
});
const task = (key: string, extra: Record<string, unknown> = {}) => ({ key, name: 'Task ' + key, start_date: '2026-10-10T09:00:00Z', end_date: '2026-10-12T09:00:00Z', completed: false, billable: false, project: 'p1', ...extra });
describe('byof-respond baseline', () => {
  it('maps a task list with pagination and search', () => {
    const rows = Array.from({ length: 30 }, (_, i) => task(String(i).padStart(2, '0')));
    const out = handler(state('tasks.list', { tasks: rows, companies: [], contacts: [], projects: [{ key: 'p1', name: 'CRM' }], taskWritable: [{ key: '00' }] })) as any;
    expect(out.resultStatus).toBe(200); expect(out.result.data.total).toBe(30); expect(out.result.data.items).toHaveLength(25); expect(out.result.data.nextCursor).toBe('25');
    expect(out.result.data.items.find((i: any) => i.id === '00').canWrite).toBe(true);
    expect(out.result.data.items.find((i: any) => i.id === '01').canWrite).toBe(false);
  });
  it('answers 404 for a read that found no row', () => {
    const out = handler(state('tasks.read', { tasks: [], companies: [], contacts: [], projects: [], taskWritable: [] }, { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })) as any;
    expect(out.resultStatus).toBe(404); expect(out.result.error.message).toBe('This record could not be found.');
  });
  it('answers 503 when an expected dataset is missing', () => {
    const out = handler({ record: { valid: true, normalized: {} }, input: { name: 'tasks.list', expected: [{ key: 'tasks', count: false }] } }) as any;
    expect(out.resultStatus).toBe(503);
  });
});
interface CompanySummary { id: string; name: string; city: string | null; state: string | null; country: string | null; phone: string | null; primaryContactName: string | null; projects: number; contacts: number }
interface Association { id: string; contactId: string; contactName: string | null; companyId: string; companyName: string | null; role: string | null; isPrimary: boolean }
interface Company extends CompanySummary { address1: string | null; address2: string | null; postalCode: string | null; phone2: string | null; fax: string | null; primaryContactId: string | null; associations: Association[]; projectList: { id: string; name: string; status: string }[]; version: number; permissions: { read: true; write: boolean; delete: boolean; share: boolean } }
interface ContactSummary { id: string; firstName: string; lastName: string; name: string; title: string | null; email: string | null; phone: string | null; companyNames: string[] }
interface Contact extends ContactSummary { email2: string | null; workPhone: string | null; homePhone: string | null; cellPhone: string | null; fax: string | null; address1: string | null; address2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null; associations: Association[]; version: number; permissions: { read: true; write: boolean; delete: boolean; share: boolean } }
const company = (key: string, extra: Record<string, unknown> = {}) => ({ key, name: 'Company ' + key, city: 'Austin', state: 'TX', country: null, phone1: '512', primary_contact: 'c1', version: 3, ...extra });
const contact = (key: string, extra: Record<string, unknown> = {}) => ({ key, first_name: 'Dana', last_name: key, email1: `${key}@example.test`, cell_phone: '555', title: 'CTO', version: 1, ...extra });
const assoc = (key: string, contactKey: string, companyKey: string, isPrimary = false) => ({ key, contact: contactKey, company: companyKey, role: 'sponsor', is_primary: isPrimary });
describe('companies and contacts', () => {
  it('lists companies with primary contact and counts', () => {
    const out = handler(state('companies.list', { companies: [company('co1'), company('co2', { name: 'Alpha' })], contacts: [contact('c1')], projects: [{ key: 'p1', name: 'P', company: 'co1', status: 'STARTED' }], associations: [assoc('a1', 'c1', 'co1', true)] })) as any;
    expect(out.resultStatus).toBe(200); expect(out.result.data.total).toBe(2);
    expect(out.result.data.items[0].name).toBe('Alpha');
    const co1 = out.result.data.items.find((i: any) => i.id === 'co1'); expect(co1.primaryContactName).toBe('Dana c1'); expect(co1.projects).toBe(1); expect(co1.contacts).toBe(1);
  });
  it('reads a company with associations, projects, version and permissions', () => {
    const out = handler(state('companies.read', { company: [company('co1')], contacts: [contact('c1')], projects: [{ key: 'p1', name: 'P', company: 'co1', status: 'STARTED', archived: false }], associations: [assoc('a1', 'c1', 'co1', true)], companyWritable: [{ n: 1 }], companyShareable: [{ n: 0 }] }, { id: 'co1' }, [{ key: 'company', count: false }, { key: 'contacts', count: false }, { key: 'projects', count: false }, { key: 'associations', count: false }, { key: 'companyWritable', count: true }, { key: 'companyShareable', count: true }])) as any;
    expect(out.resultStatus).toBe(200); const d = out.result.data;
    expect(d.version).toBe(3); expect(d.associations[0]).toEqual({ id: 'a1', contactId: 'c1', contactName: 'Dana c1', companyId: 'co1', companyName: 'Company co1', role: 'sponsor', isPrimary: true });
    expect(d.projectList).toEqual([{ id: 'p1', name: 'P', status: 'STARTED' }]); expect(d.permissions).toEqual({ read: true, write: true, delete: false, share: false });
  });
  it('answers 404 for a company the caller cannot see', () => {
    const out = handler(state('companies.read', { company: [], contacts: [], projects: [], associations: [], companyWritable: [], companyShareable: [] }, { id: 'nope' })) as any;
    expect(out.resultStatus).toBe(404); expect(out.result).toEqual({ error: { message: 'This record could not be found.' } });
  });
  it('lists contacts with company names and sorts by last name', () => {
    const out = handler(state('contacts.list', { contacts: [contact('zed'), contact('abe')], companies: [company('co1')], associations: [assoc('a1', 'zed', 'co1')] })) as any;
    expect(out.result.data.items.map((i: any) => i.lastName)).toEqual(['abe', 'zed']); expect(out.result.data.items[1].companyNames).toEqual(['Company co1']); expect(out.result.data.items[1].email).toBe('zed@example.test');
  });
  it('builds a company timeline from the four kinds', () => {
    const out = handler(state('companies.timeline', { tasks: [task('t1', { company: 'co1' })], calls: [], notes: [], files: [], companies: [company('co1')], contacts: [], projects: [], taskWritable: [], callWritable: [], noteWritable: [] }, { id: 'co1', kind: 'everything', cursor: 0 })) as any;
    expect(out.resultStatus).toBe(200); expect(out.result.data.entries[0].kind).toBe('task'); expect(out.result.data.entries[0].companyName).toBe('Company co1');
  });
});
describe('contacts read and timeline', () => {
  it('reads a contact with resolved association names, fields, version and permissions', () => {
    const out = handler(state('contacts.read', { contact: [contact('c1', { email2: 'b@example.test', work_phone: '777', city: 'Austin', version: 5 })], companies: [company('co1')], associations: [assoc('a1', 'c1', 'co1', true)], contactWritable: [{ n: 1 }], contactShareable: [{ n: 0 }] }, { id: 'c1' }, [{ key: 'contact', count: false }, { key: 'companies', count: false }, { key: 'associations', count: false }, { key: 'contactWritable', count: true }, { key: 'contactShareable', count: true }])) as any;
    expect(out.resultStatus).toBe(200); const d = out.result.data;
    expect(d.associations[0].contactName).toBe('Dana c1'); expect(d.associations[0].companyName).toBe('Company co1');
    expect(d.email2).toBe('b@example.test'); expect(d.workPhone).toBe('777'); expect(d.city).toBe('Austin'); expect(d.version).toBe(5); expect(d.permissions).toEqual({ read: true, write: true, delete: false, share: false });
  });
  it('builds a contact timeline', () => {
    const out = handler(state('contacts.timeline', { tasks: [], calls: [{ key: 'k1', subject: 'Hi', callee: 'c1', start_date: '2026-10-10T09:00:00Z', completed: false }], notes: [], files: [], companies: [], contacts: [contact('c1')], projects: [], taskWritable: [], callWritable: [], noteWritable: [] }, { id: 'c1', kind: 'everything', cursor: 0 })) as any;
    expect(out.resultStatus).toBe(200); expect(out.result.data.entries[0].kind).toBe('call'); expect(out.result.data.entries[0].personName).toBe('Dana c1');
  });
});
describe('projects.read version and permissions', () => {
  it('returns version and share false without a projectShareable dataset', () => {
    const counts = ['openTasks', 'overdue', 'openCalls', 'notes', 'files', 'unbilledCalls', 'projectWritable'];
    const out = handler(state('projects.read', { project: [{ key: 'p1', name: 'P', company: 'co1', version: 4 }], companies: [company('co1')], contacts: [], projects: [], ...Object.fromEntries(counts.map(k => [k, [{ n: 1 }]])) }, { id: 'p1' }, [{ key: 'project', count: false }, { key: 'companies', count: false }, { key: 'contacts', count: false }, { key: 'projects', count: false }, ...counts.map(key => ({ key, count: true }))])) as any;
    expect(out.resultStatus).toBe(200); expect(out.result.data.version).toBe(4); expect(out.result.data.permissions.share).toBe(false); expect(out.result.data.permissions.write).toBe(true);
    expect(out.result.data.companyId).toBe('co1'); expect(out.result.data.contactId).toBeNull(); expect(out.result.data.parentProjectId).toBeNull(); expect(out.result.data.archived).toBe(false);
  });
});
describe('entry reads carry version and link ids for full-field updates', () => {
  const counts = [{ key: 'taskWritable', count: true }];
  it('maps version, link ids and flags from a task row', () => {
    const row = task('t1', { version: 4, contact: 'c1', company: 'co1', assignee: 'u1', billed: true, billable: true, start_date: '2026-10-10T09:00:00Z', end_date: '2026-10-10T09:00:00Z' });
    const out = handler(state('tasks.read', { tasks: [row], companies: [], contacts: [], projects: [], taskWritable: [{ n: 1 }] }, { id: 't1' }, [{ key: 'tasks', count: false }, { key: 'companies', count: false }, { key: 'contacts', count: false }, { key: 'projects', count: false }, ...counts])) as any;
    const d = out.result.data; expect(out.resultStatus).toBe(200);
    expect(d.version).toBe(4); expect(d.contactId).toBe('c1'); expect(d.companyId).toBe('co1'); expect(d.assigneeId).toBe('u1'); expect(d.billed).toBe(true); expect(d.endAt).toBe('2026-10-10T09:00:00Z'); expect(d.startAt).toBe(d.endAt); expect(d.dueAt).toBe(d.endAt);
  });
  it('defaults version to 1 and maps call and note link ids', () => {
    const call = { key: 'k1', subject: 'Ring', start_date: '2026-10-10T09:00:00Z', callee: 'c2', task: 't1', followup: 'false', billable: true };
    const outCall = handler(state('calls.read', { calls: [call], companies: [], contacts: [], projects: [], callWritable: [{ n: 1 }] }, { id: 'k1' }, [{ key: 'calls', count: false }, { key: 'companies', count: false }, { key: 'contacts', count: false }, { key: 'projects', count: false }, { key: 'callWritable', count: true }])) as any;
    expect(outCall.result.data.version).toBe(1); expect(outCall.result.data.calleeId).toBe('c2'); expect(outCall.result.data.taskId).toBe('t1'); expect(outCall.result.data.followup).toBe(false); expect(outCall.result.data.endAt).toBeNull();
    const note = { key: 'n1', description: 'Hi', occurred_at: '2026-10-07T13:00:00Z', call: 'k1', version: 2 };
    const outNote = handler(state('notes.read', { notes: [note], companies: [], contacts: [], projects: [], noteWritable: [{ n: 1 }] }, { id: 'n1' }, [{ key: 'notes', count: false }, { key: 'companies', count: false }, { key: 'contacts', count: false }, { key: 'projects', count: false }, { key: 'noteWritable', count: true }])) as any;
    expect(outNote.result.data.occurredAt).toBe('2026-10-07T13:00:00Z'); expect(outNote.result.data.callId).toBe('k1'); expect(outNote.result.data.version).toBe(2);
  });
});
describe('notes.read attachments', () => {
  it('lists the visible attachments of the note with metadata', () => {
    const note = { key: 'n1', description: 'Hi', occurred_at: '2026-10-07T13:00:00Z' };
    const files = [{ key: 'f1', note: 'n1', original_filename: 'a.txt', byte_size: 3, content_type: 'text/plain' }, { key: 'f2', note: 'n2', original_filename: 'other.txt' }, { key: 'f3', note: 'n1', original_filename: 'gone.txt', deleted_at: '2026-10-01T00:00:00Z' }, { key: 'f4', note: 'n1', original_filename: 'b.bin' }];
    const out = handler({ record: { valid: true, normalized: { id: 'n1' }, notesRows: [note], companiesRows: [], contactsRows: [], projectsRows: [], noteWritableRows: [{ n: 1 }], noteShareableRows: [{ n: 0 }], filesRows: files }, input: { name: 'notes.read', expected: [{ key: 'notes', count: false }, { key: 'noteWritable', count: true }] } }) as any;
    expect(out.resultStatus).toBe(200);
    expect(out.result.data.attachments).toEqual([{ id: 'f1', originalFilename: 'a.txt', byteSize: 3, contentType: 'text/plain' }, { id: 'f4', originalFilename: 'b.bin', byteSize: null, contentType: null }]);
    expect(out.result.data.attachmentCount).toBe(2);
  });
  it('still answers when the files dataset is absent', () => {
    const out = handler({ record: { valid: true, normalized: { id: 'n1' }, notesRows: [{ key: 'n1', description: 'Hi' }], companiesRows: [], contactsRows: [], projectsRows: [], noteWritableRows: [{ n: 1 }] }, input: { name: 'notes.read', expected: [{ key: 'notes', count: false }, { key: 'noteWritable', count: true }] } }) as any;
    expect(out.result.data.attachments).toEqual([]);
  });
});
describe('sharing', () => {
  const users = [{ key: 'u-bob', display_name: 'Bob' }, { key: 'u-jane', display_name: 'Jane' }];
  const expected = [{ key: 'grants', count: false }, { key: 'users', count: false }];
  const run = (grants: any[]) => handler({ record: { valid: true, normalized: { objectKind: 'company' }, grantsRows: grants, usersRows: users }, input: { name: 'grants.list', expected } }) as any;
  it('maps grants with display names and marks the creator irrevocable', () => {
    const out = run([
      { key: 'co', user_id: 'u-jane', source: 'direct', access_label: 'Manager', granted_at: '2026-10-11T10:00:00Z' },
      { key: 'co', user_id: 'u-bob', source: 'creator', access_label: 'Owner', granted_at: '2026-10-11T09:00:00Z' },
      { key: 'co', user_id: 'u-bob', source: 'creator', access_label: 'Owner', granted_at: '2026-10-11T09:00:00Z' },
      { key: 'co', user_id: 'u-gone', source: 'direct', access_label: 'Viewer', granted_at: '2026-10-11T11:00:00Z' },
    ]);
    expect(out.resultStatus).toBe(200);
    const d = out.result.data;
    expect(d.grants.map((g: any) => [g.userId, g.displayName, g.revocable])).toEqual([['u-bob', 'Bob', false], ['u-jane', 'Jane', true], ['u-gone', 'Former user', true]]);
    expect(d.grants[0]).toEqual({ userId: 'u-bob', displayName: 'Bob', source: 'creator', accessLabel: 'Owner', grantedAt: '2026-10-11T09:00:00Z', revocable: false });
    expect(d.users).toEqual([{ id: 'u-bob', displayName: 'Bob' }, { id: 'u-jane', displayName: 'Jane' }]);
    expect(d.levels).toEqual(['viewer', 'editor', 'manager']); expect(d.scopes).toEqual(['self', 'subtree']);
  });
  it('answers 404 when the caller holds no share (empty grants)', () => {
    const out = run([]); expect(out.resultStatus).toBe(404); expect(out.result.error.message).toBe('This record could not be found.');
  });
  it('sets canShare and canDelete on a task read from the shareable count', () => {
    const read = (n: number) => (handler(state('tasks.read', { tasks: [task('t1')], companies: [], contacts: [], projects: [], taskWritable: [], taskShareable: [{ n }] }, { id: 't1' }, [{ key: 'tasks', count: false }, { key: 'companies', count: false }, { key: 'contacts', count: false }, { key: 'projects', count: false }, { key: 'taskWritable', count: false }, { key: 'taskShareable', count: true }])) as any).result.data;
    expect(read(1).canShare).toBe(true); expect(read(1).canDelete).toBe(true);
    expect(read(0).canShare).toBe(false); expect(read(0).canDelete).toBe(false);
  });
  it('maps convertedTaskId and canConvertToTask on notes', () => {
    const note = (key: string, extra: Record<string, unknown> = {}) => ({ key, description: 'N' + key, occurred_at: '2026-10-10T09:00:00Z', archived: false, ...extra });
    const out = (handler(state('notes.list', { notes: [note('a'), note('b', { converted_task: 't9', archived: true }), note('c'), note('d', { archived: true })], companies: [], contacts: [], projects: [], noteWritable: [{ key: 'a' }, { key: 'b' }, { key: 'd' }] }, { includeClosed: true })) as any).result.data.items;
    const by = (id: string) => out.find((i: any) => i.id === id);
    expect(by('a').canConvertToTask).toBe(true); expect(by('a').convertedTaskId).toBeNull();
    expect(by('b').canConvertToTask).toBe(false); expect(by('b').convertedTaskId).toBe('t9');
    expect(by('c').canConvertToTask).toBe(false); expect(by('d').canConvertToTask).toBe(false);
  });
});
describe('files.read', () => {
  const file = (extra: Record<string, unknown> = {}) => ({ key: 'f1', original_filename: 'plan.pdf', content_type: 'application/pdf', byte_size: 2048, checksum: 'abc', creation_date: '2026-10-01T10:00:00Z', creator: 'u1', unavailable_reason: null, note: 'n1', project: 'p1', company: 'co1', contact: 'c1', task: null, call: null, version: 2, ...extra });
  const datasets = (rows: any[], extra: Record<string, any[]> = {}) => ({ file: rows, notes: [{ key: 'n1', description: 'Kickoff notes' }], users: [{ key: 'u1', display_name: 'Bob Builder' }], companies: [{ key: 'co1', name: 'Acme' }], contacts: [{ key: 'c1', first_name: 'Dana', last_name: 'Fox' }], projects: [{ key: 'p1', name: 'CRM' }], note_fileWritable: [{ n: 1 }], note_fileShareable: [{ n: 0 }], ...extra });
  const exp = [{ key: 'file', count: false }, { key: 'notes', count: false }, { key: 'users', count: false }, { key: 'companies', count: false }, { key: 'contacts', count: false }, { key: 'projects', count: false }, { key: 'note_fileWritable', count: true }, { key: 'note_fileShareable', count: true }];
  it('maps the attachment with note, uploader, parents and permissions', () => {
    const out = handler(state('files.read', datasets([file()]), { id: 'f1' }, exp)) as any;
    expect(out.resultStatus).toBe(200); const d = out.result.data;
    expect(d).toMatchObject({ id: 'f1', originalFilename: 'plan.pdf', contentType: 'application/pdf', byteSize: 2048, checksum: 'abc', createdAt: '2026-10-01T10:00:00Z', uploaderName: 'Bob Builder', unavailableReason: null, note: { id: 'n1', title: 'Kickoff notes' }, projectId: 'p1', companyId: 'co1', contactId: 'c1', taskId: null, callId: null, version: 2 });
    expect(d.projectName).toBe('CRM'); expect(d.companyName).toBe('Acme'); expect(d.contactName).toBe('Dana Fox');
    expect(d.permissions).toEqual({ read: true, write: true, delete: false, share: false });
  });
  it('grants delete and share when the shareable count is positive', () => {
    const out = handler(state('files.read', datasets([file()], { note_fileShareable: [{ n: 1 }] }), { id: 'f1' }, exp)) as any;
    expect(out.result.data.permissions).toEqual({ read: true, write: true, delete: true, share: true });
  });
  it('tolerates an unknown uploader and a missing note', () => {
    const out = handler(state('files.read', datasets([file({ creator: 'zz', note: null })]), { id: 'f1' }, exp)) as any;
    expect(out.result.data.uploaderName).toBeNull(); expect(out.result.data.note).toBeNull();
  });
  it('answers 404 when the gate returned no row', () => {
    const out = handler(state('files.read', datasets([]), { id: 'f1' }, exp)) as any;
    expect(out.resultStatus).toBe(404); expect(out.result.error.message).toBe('This record could not be found.');
  });
});
describe('list filters and sorting', () => {
  const base = { companies: [], contacts: [], projects: [{ key: 'p1', name: 'CRM' }], taskWritable: [] };
  const ids = (out: any) => out.result.data.items.map((i: any) => i.id);
  const tasks = [task('a', { name: 'Zeta', billable: true, start_date: '2026-03-01T09:00:00Z', end_date: '2026-03-09T00:00:00Z', project: 'p1', contact: 'c1' }), task('b', { name: 'Alpha', project: 'p2', start_date: '2026-05-01T09:00:00Z', end_date: null }), task('c', { name: 'Mid', project: 'p2', billable: true, billed: true, start_date: '2026-04-01T09:00:00Z', end_date: null, company: 'co1', assignee: 'u1' })];
  const run = (name: string, datasets: Record<string, any[]>, normalized: Record<string, unknown>) => handler(state(name, datasets, normalized)) as any;
  it('filters tasks by flags, dates, references and counts the filtered total', () => {
    expect(ids(run('tasks.list', { ...base, tasks }, { filter: { billable: true } })).sort()).toEqual(['a', 'c']);
    const out = run('tasks.list', { ...base, tasks }, { filter: { billable: true, billed: true } }); expect(ids(out)).toEqual(['c']); expect(out.result.data.total).toBe(1);
    expect(ids(run('tasks.list', { ...base, tasks }, { filter: { from: '2026-03-15T00:00:00.000Z', toExclusive: '2026-05-01T00:00:00.000Z' } }))).toEqual(['c']);
    expect(ids(run('tasks.list', { ...base, tasks }, { filter: { projectId: 'p1' } }))).toEqual(['a']);
    expect(ids(run('tasks.list', { ...base, tasks }, { filter: { contactId: 'c1' } }))).toEqual(['a']);
    expect(ids(run('tasks.list', { ...base, tasks }, { filter: { companyId: 'co1' } }))).toEqual(['c']);
    expect(ids(run('tasks.list', { ...base, tasks }, { filter: { assigneeId: 'u1' } }))).toEqual(['c']);
  });
  it('sorts tasks by date desc, title asc and due asc with empty due last', () => {
    expect(ids(run('tasks.list', { ...base, tasks }, {}))).toEqual(['b', 'c', 'a']);
    expect(ids(run('tasks.list', { ...base, tasks }, { sort: 'title' }))).toEqual(['b', 'c', 'a']);
    expect(ids(run('tasks.list', { ...base, tasks }, { sort: 'due' }))[0]).toBe('a');
  });
  it('filters and sorts projects', () => {
    const projects = [{ key: 'p1', name: 'Bravo', status: 'ON_SCHEDULE', company: 'co1', owner: 'u1', start_date: '2026-02-01' }, { key: 'p2', name: 'Alpha', status: 'STARTED', start_date: '2026-01-01' }, { key: 'p3', name: 'Old', status: 'ON_SCHEDULE', archived: true }];
    const ds = { projects, companies: [], taskRollups: [], callRollups: [], noteRollups: [] };
    expect(ids(run('projects.list', ds, { filter: { status: 'ON_SCHEDULE' } }))).toEqual(['p1']);
    expect(ids(run('projects.list', ds, { includeClosed: true, filter: { status: 'ON_SCHEDULE' } })).sort()).toEqual(['p1', 'p3']);
    expect(ids(run('projects.list', ds, { filter: { ownerId: 'u1' } }))).toEqual(['p1']);
    expect(ids(run('projects.list', ds, { filter: { companyId: 'co1' } }))).toEqual(['p1']);
    expect(ids(run('projects.list', ds, { sort: 'name' }))).toEqual(['p2', 'p1']);
    expect(ids(run('projects.list', ds, { sort: 'start' }))).toEqual(['p2', 'p1']);
  });
  it('filters notes by effective parent kind and occurred_at', () => {
    const notes = [{ key: 'n1', description: 'B', occurred_at: '2026-02-01T00:00:00Z', project: 'p1' }, { key: 'n2', description: 'A', occurred_at: '2026-03-01T00:00:00Z', task: 't1', project: 'p1' }, { key: 'n3', description: 'C', occurred_at: '2026-04-01T00:00:00Z', company: 'co1' }];
    const ds = { ...base, notes, noteWritable: [] };
    expect(ids(run('notes.list', ds, { filter: { parentKind: 'project' } }))).toEqual(['n1']);
    expect(ids(run('notes.list', ds, { filter: { parentKind: 'task' } }))).toEqual(['n2']);
    expect(ids(run('notes.list', ds, { filter: { parentKind: 'company' } }))).toEqual(['n3']);
    expect(ids(run('notes.list', ds, { filter: { from: '2026-02-15T00:00:00.000Z', toExclusive: '2026-03-02T00:00:00.000Z' } }))).toEqual(['n2']);
    expect(ids(run('notes.list', ds, { sort: 'title' }))).toEqual(['n2', 'n1', 'n3']);
  });
  it('sorts companies by city with empty cities last and filters contacts by company', () => {
    const companies = [company('x', { name: 'A', city: 'Waco' }), company('y', { name: 'B', city: 'Austin' }), company('z', { name: 'C', city: null })];
    expect(ids(run('companies.list', { companies, contacts: [], projects: [], associations: [] }, { sort: 'city' }))).toEqual(['y', 'x', 'z']);
    const contacts = [contact('Lee', { key: 'k1', first_name: 'Zed' }), contact('Kim', { key: 'k2', first_name: 'Amy' })];
    const ds = { contacts, companies: [company('x')], associations: [assoc('a1', 'k1', 'x')] };
    expect(ids(run('contacts.list', ds, { filter: { companyId: 'x' } }))).toEqual(['k1']);
    expect(ids(run('contacts.list', ds, { sort: 'firstName' }))).toEqual(['k2', 'k1']);
    expect(run('contacts.list', ds, {}).result.data.total).toBe(2);
  });
  it('compares date bounds as epoch times across stored formats and excludes undated rows only when a bound is set', () => {
    const rows = [task('d1', { start_date: '2026-03-10' }), task('d2', { start_date: '2026-03-10T23:30:00-05:00' }), task('d3', { start_date: '2026-03-10T09:00:00Z' }), task('d4', { start_date: '2026-03-10T09:00:00.000Z' }), task('d5', { start_date: '2026-03-11T00:00:00Z' }), task('d6', { start_date: '2026-03-09T23:59:59Z' }), task('d7', { start_date: null })];
    const ds = { ...base, tasks: rows };
    const window = { from: '2026-03-10T00:00:00.000Z', toExclusive: '2026-03-11T00:00:00.000Z' };
    expect(ids(run('tasks.list', ds, { filter: window })).sort()).toEqual(['d1', 'd3', 'd4']);
    expect(ids(run('tasks.list', ds, { filter: { from: window.from } })).sort()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
    expect(ids(run('tasks.list', ds, { filter: { toExclusive: window.toExclusive } })).sort()).toEqual(['d1', 'd3', 'd4', 'd6']);
    expect(ids(run('tasks.list', ds, { filter: {} })).sort()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']);
  });
});

describe('dashboard.agenda window', () => {
  const agenda = (windowDays: number) => {
    const start = new Date('2026-10-04T00:00:00Z'); const end = new Date(start); end.setUTCDate(start.getUTCDate() + windowDays);
    return handler(state('dashboard.agenda', { tasks: [], calls: [], overdue: [] }, { windowStart: start.toISOString(), windowEnd: end.toISOString() })) as any;
  };
  it('reports an inclusive last day for each supported window length', () => {
    expect(agenda(7).result.data).toMatchObject({ windowStart: '2026-10-04', windowEnd: '2026-10-10' });
    expect(agenda(14).result.data.windowEnd).toBe('2026-10-17');
    expect(agenda(42).result.data.windowEnd).toBe('2026-11-14');
  });
});
