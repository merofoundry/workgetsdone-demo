import { describe, expect, it } from 'vitest';
import { handler } from './normalize';
const run = (payload: Record<string, unknown>, name = 'tasks.list') => handler({ input: { payload, name } }) as any;
describe('byof-normalize baseline', () => {
  it('accepts a plain list request and fills the dashboard window', () => {
    const out = run({ includeClosed: true, cursor: 25 });
    expect(out.valid).toBe(true); expect(out.normalized.cursor).toBe(25); expect(out.normalized.includeClosed).toBe(true);
    expect(out.normalized.windowStart < out.normalized.windowEnd).toBe(true);
  });
  it('rejects unknown knobs with 422', () => {
    for (const payload of [{ pageSize: 30 }, { sort: 'name' }, { current_user_id: 'x' }, { id: 'not-a-uuid' }, { cursor: -1 }]) {
      const out = run(payload); expect(out.valid).toBe(false); expect(out.resultStatus).toBe(422);
    }
  });
  it('requires a title on create and bounds it at 255', () => {
    expect(run({ title: '', clientRef: '22222222-2222-4222-8222-222222222222' }, 'tasks.create').valid).toBe(false);
    expect(run({ title: 'x'.repeat(256), clientRef: '22222222-2222-4222-8222-222222222222' }, 'tasks.create').valid).toBe(false);
    expect(run({ title: 'Call Dana', clientRef: '22222222-2222-4222-8222-222222222222' }, 'calls.create').valid).toBe(true);
  });
  it('refuses an end before a start', () => {
    expect(run({ title: 'x', startAt: '2026-10-11T10:00:00Z', endAt: '2026-10-11T09:00:00Z', clientRef: '22222222-2222-4222-8222-222222222222' }, 'calls.create').valid).toBe(false);
  });
});
describe('entity field schemas', () => {
  it('normalizes a company create with a client reference', () => {
    const out = run({ name: ' Northwind ', city: 'Austin', phone1: '+1 (512) 555-0100', clientRef: '22222222-2222-4222-8222-222222222222' }, 'companies.create');
    expect(out.valid).toBe(true); expect(out.normalized.fields).toMatchObject({ name: 'Northwind', city: 'Austin', phone1: '+1 (512) 555-0100', address1: null }); expect(out.normalized.clientRef).toBe('22222222-2222-4222-8222-222222222222');
  });
  it('rejects a company without a name, a bad phone, an over-long state, a missing clientRef', () => {
    expect(run({ clientRef: '22222222-2222-4222-8222-222222222222' }, 'companies.create').valid).toBe(false);
    expect(run({ name: 'x', phone1: 'call me', clientRef: '22222222-2222-4222-8222-222222222222' }, 'companies.create').valid).toBe(false);
    expect(run({ name: 'x', state: 's'.repeat(65), clientRef: '22222222-2222-4222-8222-222222222222' }, 'companies.create').valid).toBe(false);
    expect(run({ name: 'x' }, 'companies.create').valid).toBe(false);
  });
  it('does not accept primaryContactId on company writes (only setPrimaryContact writes it)', () => {
    const ref = '22222222-2222-4222-8222-222222222222'; const id = '11111111-1111-4111-8111-111111111111';
    const create = run({ name: 'x', primaryContactId: id, clientRef: ref }, 'companies.create'); expect(create.valid).toBe(false); expect(create.result.error.fields).toContain('primaryContactId');
    expect(run({ id, version: 1, name: 'x', primaryContactId: id }, 'companies.update').valid).toBe(false);
    const ok = run({ name: 'x', clientRef: ref }, 'companies.create'); expect(ok.valid).toBe(true); expect(ok.normalized.fields).not.toHaveProperty('primary_contact');
    expect(run({ id, contactId: id }, 'companies.setPrimaryContact').valid).toBe(true);
    const cleared = run({ id, contactId: null }, 'companies.setPrimaryContact'); expect(cleared.valid).toBe(true); expect(cleared.normalized.contactId).toBeNull();
    expect(run({ id }, 'companies.setPrimaryContact').valid).toBe(false);
  });
  it('rejects a project that is its own parent on update', () => {
    const id = '11111111-1111-4111-8111-111111111111'; const other = '33333333-3333-4333-8333-333333333333';
    const bad = run({ id, version: 1, name: 'p', description: 'd', parentProjectId: id.toUpperCase() }, 'projects.update');
    expect(bad.valid).toBe(false); expect(bad.resultStatus).toBe(422); expect(bad.result.error.fields).toEqual(['parentProjectId']);
    expect(run({ id, version: 1, name: 'p', description: 'd', parentProjectId: other }, 'projects.update').valid).toBe(true);
  });
  it('requires version on update and computes nextVersion', () => {
    const base = { id: '11111111-1111-4111-8111-111111111111', firstName: 'Dana', lastName: 'W', email1: 'd@x.test' };
    expect(run(base, 'contacts.update').valid).toBe(false);
    const out = run({ ...base, version: 4 }, 'contacts.update'); expect(out.valid).toBe(true); expect(out.normalized.version).toBe(4); expect(out.normalized.nextVersion).toBe(5); expect(out.normalized.fields.email1).toBe('d@x.test');
    expect(out.normalized.id).toBe(base.id); expect(typeof out.normalized.now).toBe('string');
    expect(run({ ...base, version: 0 }, 'contacts.update').valid).toBe(false);
  });
  it('validates contact email, project dates and status, task billing, note targets', () => {
    expect(run({ firstName: 'D', lastName: 'W', email1: 'nope', clientRef: '22222222-2222-4222-8222-222222222222' }, 'contacts.create').valid).toBe(false);
    expect(run({ name: 'P', description: 'd', startDate: '2026-10-11', endDate: '2026-10-01', clientRef: '22222222-2222-4222-8222-222222222222' }, 'projects.create').valid).toBe(false);
    expect(run({ name: 'P', description: 'd', status: 'DONE', clientRef: '22222222-2222-4222-8222-222222222222' }, 'projects.create').valid).toBe(false);
    expect(run({ name: 'P', description: 'd', status: 'ON_SCHEDULE', clientRef: '22222222-2222-4222-8222-222222222222' }, 'projects.create').normalized.fields.status).toBe('ON_SCHEDULE');
    expect(run({ id: '11111111-1111-4111-8111-111111111111', version: 1, title: 'T', billed: true, billable: false }, 'tasks.update').valid).toBe(false);
    expect(run({ id: '11111111-1111-4111-8111-111111111111', version: 1, title: 'N', body: '' }, 'notes.update').valid).toBe(false);
    expect(run({ id: '11111111-1111-4111-8111-111111111111', version: 1, title: 'N', body: '', projectId: '11111111-1111-4111-8111-111111111111', occurredAt: '2026-10-11T10:00:00Z' }, 'notes.update').valid).toBe(true);
  });
  it('rejects an unknown key on a schema service', () => {
    expect(run({ name: 'x', clientRef: '22222222-2222-4222-8222-222222222222', isAdmin: true }, 'companies.create').valid).toBe(false);
  });
  it('exposes every reference key, null when absent', () => {
    const out = run({ title: 'T', clientRef: '22222222-2222-4222-8222-222222222222' }, 'tasks.create');
    for (const key of ['assigneeId', 'contactId', 'projectId', 'companyId']) expect(out.normalized[key]).toBeNull();
    const note = run({ title: 'N', callId: '11111111-1111-4111-8111-111111111111', clientRef: '22222222-2222-4222-8222-222222222222' }, 'notes.create');
    expect(note.normalized.callId).toBe('11111111-1111-4111-8111-111111111111'); expect(note.normalized.taskId).toBeNull(); expect(typeof note.normalized.fields.occurred_at).toBe('string');
  });
  const A = '11111111-1111-4111-8111-111111111111'; const B = '33333333-3333-4333-8333-333333333333'; const C = '22222222-2222-4222-8222-222222222222';
  it('contacts.associate is a create with required contact and company', () => {
    const out = run({ contactId: A, companyId: B, role: 'Buyer', isPrimary: true, clientRef: C }, 'contacts.associate');
    expect(out.valid).toBe(true); expect(out.normalized.contactId).toBe(A); expect(out.normalized.companyId).toBe(B); expect(out.normalized.clientRef).toBe(C); expect(out.normalized.fields).toMatchObject({ role: 'Buyer', is_primary: true });
    expect(run({ contactId: A, companyId: B }, 'contacts.associate').valid).toBe(false);
    expect(run({ companyId: B, clientRef: C }, 'contacts.associate').valid).toBe(false);
    expect(run({ contactId: A, clientRef: C }, 'contacts.associate').valid).toBe(false);
    expect(run({ contactId: A, companyId: B, role: 'r'.repeat(101), clientRef: C }, 'contacts.associate').valid).toBe(false);
  });
  it('contacts.dissociate needs only an association id', () => {
    const out = run({ associationId: A }, 'contacts.dissociate');
    expect(out.valid).toBe(true); expect(out.normalized.associationId).toBe(A);
    expect(run({}, 'contacts.dissociate').valid).toBe(false);
    expect(run({ associationId: 'nope' }, 'contacts.dissociate').valid).toBe(false);
  });
  it('companies.setPrimaryContact needs id and contactId', () => {
    const out = run({ id: A, contactId: B }, 'companies.setPrimaryContact');
    expect(out.valid).toBe(true); expect(out.normalized.id).toBe(A); expect(out.normalized.contactId).toBe(B);
    expect(run({ id: A }, 'companies.setPrimaryContact').valid).toBe(false);
    expect(run({ contactId: B }, 'companies.setPrimaryContact').valid).toBe(false);
  });
  it('projects.archive and projects.unarchive need only an id', () => {
    for (const name of ['projects.archive', 'projects.unarchive']) {
      const out = run({ id: A }, name); expect(out.valid).toBe(true); expect(out.normalized.id).toBe(A);
      expect(run({}, name).valid).toBe(false); expect(run({ id: 'x' }, name).valid).toBe(false);
    }
  });
  it('allow-lists keys per verb', () => {
    expect(run({ id: A, version: 1, name: 'x', clientRef: C }, 'companies.update').valid).toBe(false);
    expect(run({ name: 'x', version: 1, clientRef: C }, 'companies.create').valid).toBe(false);
    expect(run({ name: 'x', id: A, clientRef: C }, 'companies.create').valid).toBe(false);
    expect(run({ id: A, version: 1 }, 'projects.archive').valid).toBe(false);
    expect(run({ id: A, clientRef: C }, 'projects.archive').valid).toBe(false);
    expect(run({ associationId: 'nope' }, 'contacts.dissociate').valid).toBe(false);
    expect(run({ associationId: A, id: A }, 'contacts.dissociate').valid).toBe(false);
    expect(run({ id: A, version: 1, name: 'x' }, 'companies.update').valid).toBe(true);
  });
  it('requires a numeric integer version and a real calendar date', () => {
    for (const version of ['4', true, 1.5]) expect(run({ id: A, version, name: 'x' }, 'companies.update').valid).toBe(false);
    expect(run({ name: 'P', description: 'd', startDate: '2026-02-31', clientRef: C }, 'projects.create').valid).toBe(false);
    expect(run({ name: 'P', description: 'd', startDate: '2026-02-28', clientRef: C }, 'projects.create').valid).toBe(true);
  });
  it('keeps clientRef optional for the three legacy creates only', () => {
    for (const name of ['tasks.create', 'calls.create', 'notes.create']) {
      const base: Record<string, unknown> = { title: 'T', projectId: A };
      const without = run(base, name); expect(without.valid).toBe(true); expect(without.normalized.clientRef).toBeNull(); expect(without.normalized.fields.client_ref).toBeNull();
      const withRef = run({ ...base, clientRef: C }, name); expect(withRef.valid).toBe(true); expect(withRef.normalized.fields.client_ref).toBe(C);
      expect(run({ ...base, clientRef: 'nope' }, name).valid).toBe(false);
    }
    expect(run({ name: 'x' }, 'companies.create').valid).toBe(false);
    expect(run({ contactId: A, companyId: B }, 'contacts.associate').valid).toBe(false);
  });
  it('stores an empty task body as an empty string because the model requires it', () => {
    expect(run({ title: 'T', clientRef: C }, 'tasks.create').normalized.fields.description).toBe('');
    expect(run({ id: A, version: 1, title: 'T', body: 'b' }, 'tasks.update').normalized.fields.description).toBe('b');
    expect(run({ name: 'x', clientRef: C }, 'companies.create').normalized.fields.address1).toBeNull();
  });
  it('requires occurredAt on notes.update because the model requires it', () => {
    const base = { id: A, version: 1, title: 'N', body: '', projectId: A };
    const out = run(base, 'notes.update'); expect(out.valid).toBe(false); expect(out.result.error.fields).toEqual(['occurredAt']);
    expect(run({ ...base, occurredAt: '2026-10-11T10:00:00Z' }, 'notes.update').valid).toBe(true);
    expect(run({ title: 'N', projectId: A }, 'notes.create').valid).toBe(true);
  });
  it('validates the sharing services', () => {
    const ok = run({ objectKind: 'company', objectId: A }, 'grants.list'); expect(ok.valid).toBe(true); expect(ok.normalized.objectKind).toBe('company'); expect(ok.normalized.objectId).toBe(A);
    expect(run({ objectKind: 'contact_company', objectId: A }, 'grants.list').valid).toBe(false);
    expect(run({ objectKind: 'company', objectId: 'nope' }, 'grants.list').valid).toBe(false);
    const g = run({ objectKind: 'contact_company', objectId: A, userId: B, level: 'manager', scope: 'subtree' }, 'grants.grant');
    expect(g.valid).toBe(true); expect(g.normalized.level).toBe('manager'); expect(g.normalized.scope).toBe('subtree'); expect(g.normalized.userId).toBe(B);
    expect(g.normalized.share).toMatchObject({ permBits: 15, canWrite: true, canDelete: true, canShare: true, accessLabel: 'Manager - this record and everything under it', writeTargetKey: A });
    expect(g.normalized.share.grantSource).toMatch(/^share-[0-9]+$/);
    const v = run({ objectKind: 'company', objectId: A, userId: B, level: 'viewer', scope: 'self' }, 'grants.grant').normalized.share;
    expect(v).toMatchObject({ permBits: 1, canWrite: false, canDelete: false, canShare: false, accessLabel: 'Viewer - this record only', writeTargetKey: null });
    expect(run({ objectKind: 'company', objectId: A, userId: B, level: 'owner', scope: 'self' }, 'grants.grant').valid).toBe(false);
    expect(run({ objectKind: 'company', objectId: A, userId: B, level: 'viewer' }, 'grants.grant').valid).toBe(false);
    const r = run({ objectKind: 'task', objectId: A, userId: B, source: 'direct' }, 'grants.revoke'); expect(r.valid).toBe(true); expect(r.normalized.source).toBe('direct');
    expect(run({ objectKind: 'task', objectId: A, userId: B, source: 'x'.repeat(41) }, 'grants.revoke').valid).toBe(false);
    for (const source of ['creator', ' Creator ']) { const c = run({ objectKind: 'task', objectId: A, userId: B, source }, 'grants.revoke'); expect(c.valid).toBe(false); expect(c.resultStatus).toBe(422); expect(c.result.error.message).toBe("The creator's access cannot be removed."); }
  });
});
describe('delete service schemas', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  it('accepts id with optional dryRun on every delete service', () => {
    for (const name of ['companies.delete', 'contacts.delete', 'projects.delete', 'tasks.delete', 'calls.delete', 'notes.delete']) {
      const out = run({ id: ID }, name); expect(out.valid, name).toBe(true); expect(out.normalized.id).toBe(ID); expect(out.normalized.dryRun).toBe(false); expect(out.normalized.strategy).toBe(null);
      expect(run({ id: ID, dryRun: true }, name).normalized.dryRun).toBe(true);
      expect(run({}, name).valid).toBe(false); expect(run({ id: 'nope' }, name).valid).toBe(false);
      expect(run({ id: ID, dryRun: 'yes' }, name).valid).toBe(false); expect(run({ id: ID, extra: 1 }, name).valid).toBe(false);
    }
  });
  it('allows a strategy only on the project services and requires it on deleteChildren', () => {
    expect(run({ id: ID, strategy: 'cascade' }, 'projects.delete').normalized.strategy).toBe('cascade');
    expect(run({ id: ID, strategy: 'reparent', dryRun: true }, 'projects.delete').valid).toBe(true);
    expect(run({ id: ID, strategy: 'burn' }, 'projects.delete').valid).toBe(false);
    expect(run({ id: ID, strategy: 'cascade' }, 'tasks.delete').valid).toBe(false);
    expect(run({ id: ID }, 'projects.deleteChildren').valid).toBe(false);
    const ok = run({ id: ID, strategy: 'reparent' }, 'projects.deleteChildren'); expect(ok.valid).toBe(true); expect(ok.normalized.strategy).toBe('reparent');
    expect(run({ id: ID, strategy: 'cascade', dryRun: true }, 'projects.deleteChildren').valid).toBe(false);
  });
  it('does not apply the note target rule to notes.delete', () => { expect(run({ id: ID }, 'notes.delete').valid).toBe(true); });
  it('requires id and clientRef for notes.convertToTask', () => {
    const REF = '11111111-1111-4111-8111-111111111111';
    const ok = run({ id: ID, clientRef: REF }, 'notes.convertToTask'); expect(ok.valid).toBe(true); expect(ok.normalized.fields.client_ref).toBe(REF); expect(ok.normalized.id).toBe(ID);
    expect(run({ id: ID }, 'notes.convertToTask').valid).toBe(false);
    expect(run({ id: ID, clientRef: 'x' }, 'notes.convertToTask').valid).toBe(false);
    expect(run({ id: ID, clientRef: REF, title: 'a' }, 'notes.convertToTask').valid).toBe(false);
  });
});
describe('files services', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  it('files.delete takes exactly an id', () => {
    const out = run({ id: ID }, 'files.delete'); expect(out.valid).toBe(true); expect(out.normalized.id).toBe(ID);
    expect(run({}, 'files.delete').valid).toBe(false); expect(run({ id: 'nope' }, 'files.delete').valid).toBe(false);
    expect(run({ id: ID, dryRun: true }, 'files.delete').valid).toBe(false); expect(run({ id: ID, extra: 1 }, 'files.delete').valid).toBe(false);
  });
  it('files.read validates the id', () => {
    expect(run({ id: ID }, 'files.read').valid).toBe(true); expect(run({ id: ID }, 'files.read').normalized.id).toBe(ID);
    expect(run({ id: 'nope' }, 'files.read').valid).toBe(false);
  });
});
describe('list filters and sorting (allow-list)', () => {
  const U = '11111111-1111-4111-8111-111111111111';
  it('accepts each list own filters and sorts and echoes them', () => {
    const t = run({ billable: true, billed: false, from: '2026-01-01', to: '2026-12-31', projectId: U, companyId: U, contactId: U, assigneeId: U, sort: 'due', includeClosed: true }, 'tasks.list');
    expect(t.valid).toBe(true); expect(t.normalized.sort).toBe('due'); expect(t.normalized.filter.billable).toBe(true);
    expect(t.normalized.filter.from).toBe('2026-01-01T00:00:00.000Z'); expect(t.normalized.filter.toExclusive).toBe('2027-01-01T00:00:00.000Z');
    expect(run({ status: 'ON_SCHEDULE', ownerId: U, companyId: U, sort: 'start' }, 'projects.list').valid).toBe(true);
    expect(run({ parentKind: 'task', from: '2026-01-01', sort: 'title' }, 'notes.list').valid).toBe(true);
    expect(run({ sort: 'city' }, 'companies.list').valid).toBe(true);
    expect(run({ companyId: U, sort: 'firstName' }, 'contacts.list').valid).toBe(true);
    expect(run({ billable: true }, 'calls.list').valid).toBe(true);
  });
  it('rejects a secret sort, another list filter, bad values and a different page size', () => {
    const bad: [Record<string, unknown>, string][] = [[{ sort: 'secret' }, 'tasks.list'], [{ sort: 'name' }, 'tasks.list'], [{ assigneeId: U }, 'calls.list'], [{ billable: true }, 'projects.list'], [{ status: 'ON_SCHEDULE' }, 'tasks.list'],
      [{ parentKind: 'x' }, 'notes.list'], [{ status: 'NOPE' }, 'projects.list'], [{ from: 'tomorrow' }, 'tasks.list'], [{ from: '2026-02-01', to: '2026-01-01' }, 'tasks.list'], [{ projectId: 'nope' }, 'tasks.list'],
      [{ billable: 'yes' }, 'tasks.list'], [{ pageSize: 50 }, 'tasks.list'], [{ foo: 1 }, 'companies.list'], [{ companyId: U }, 'companies.list'], [{ order: 'asc' }, 'tasks.list']];
    for (const [payload, name] of bad) { const out = run(payload, name); expect(out.valid, JSON.stringify([payload, name])).toBe(false); expect(out.resultStatus).toBe(422); expect(out.result.error.message).toBe('The supplied filter or identifier is not valid.'); }
  });
});

describe('account services', () => {
  it('account.update validates the profile', () => {
    const ok = run({ displayName: ' Jane ', timezone: 'America/New_York', userName: 'jane' }, 'account.update');
    expect(ok.valid).toBe(true); expect(ok.normalized.fields).toEqual({ display_name: 'Jane', timezone: 'America/New_York', user_name: 'jane' });
    expect(run({ displayName: 'J', timezone: 'UTC' }, 'account.update').normalized.fields.user_name).toBeNull();
    for (const payload of [{ displayName: 'J', timezone: 'Mars/Base' }, { displayName: 'J', timezone: 'utc ' + 'x' }, { displayName: '', timezone: 'UTC' }, { displayName: 'J' }, { displayName: 'x'.repeat(256), timezone: 'UTC' }, { displayName: 'J', timezone: 'UTC', userName: 'x'.repeat(65) }, { displayName: 'J', timezone: 'UTC', email: 'a@b.c' }, { displayName: 'J', timezone: 'UTC', isAdmin: true }, { displayName: 'J', timezone: 'UTC', password: 'x' }]) {
      const out = run(payload, 'account.update'); expect(out.valid).toBe(false); expect(out.resultStatus).toBe(422);
    }
  });
  it('account.changePassword bounds the password at 12..128 and keeps it out of fields', () => {
    const ok = run({ newPassword: ' abcdefghijkl ' }, 'account.changePassword');
    expect(ok.valid).toBe(true); expect(JSON.stringify(ok.normalized)).not.toContain('abcdefghijkl'); expect(ok.normalized).not.toHaveProperty('newPassword'); expect(JSON.stringify(ok.normalized.fields)).not.toContain('abcdefghijkl');
    for (const payload of [{ newPassword: 'short' }, { newPassword: 'x'.repeat(11) }, { newPassword: 'x'.repeat(129) }, {}, { newPassword: 'x'.repeat(12), extra: 1 }, { newPassword: 123456789012 }]) expect(run(payload, 'account.changePassword').valid).toBe(false);
    expect(run({ newPassword: 'x'.repeat(12) }, 'account.changePassword').valid).toBe(true); expect(run({ newPassword: 'x'.repeat(128) }, 'account.changePassword').valid).toBe(true);
    const bad = run({ newPassword: 'short' }, 'account.changePassword'); expect(JSON.stringify(bad)).not.toContain('short');
  });
  it('account.read takes no input', () => { expect(run({}, 'account.read').valid).toBe(true); });
});

describe('time zone list', () => {
  it('accepts every zone the host Intl knows and rejects lookalikes', () => {
    const known: string[] = (Intl as any).supportedValuesOf('timeZone').concat('UTC');
    for (const zone of known) expect(run({ displayName: 'J', timezone: zone }, 'account.update').valid, zone).toBe(true);
    for (const zone of ['Mars/Base', 'america/new_york', 'Europe/Nowhere', 'utc', '+01:00', 'Etc/GMT+99', 'America']) expect(run({ displayName: 'J', timezone: zone }, 'account.update').valid, zone).toBe(false);
  });
});

describe('users.update', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  it('accepts exactly id, displayName, timezone, isActive', () => {
    const ok = run({ id, displayName: ' Ann ', timezone: 'UTC', isActive: false }, 'users.update');
    expect(ok.valid).toBe(true); expect(ok.normalized.id).toBe(id); expect(ok.normalized.fields).toEqual({ id, display_name: 'Ann', timezone: 'UTC', is_active: false, oauth_provider: null, oauth_subject: null }); expect(ok.normalized.oauthTouched).toBe(false);
  });
  it('links and unlinks Google: provider and subject travel together', () => {
    const base = { id, displayName: 'A', timezone: 'UTC', isActive: true };
    const link = run({ ...base, oauthProvider: 'google', oauthSubject: ' 1234567890 ' }, 'users.update');
    expect(link.valid).toBe(true); expect(link.normalized.oauthTouched).toBe(true); expect(link.normalized.fields).toMatchObject({ oauth_provider: 'google', oauth_subject: '1234567890' });
    const unlink = run({ ...base, oauthProvider: null, oauthSubject: null }, 'users.update');
    expect(unlink.valid).toBe(true); expect(unlink.normalized.oauthTouched).toBe(true); expect(unlink.normalized.fields).toMatchObject({ oauth_provider: null, oauth_subject: null });
    for (const bad of [{ ...base, oauthSubject: 'abc' }, { ...base, oauthProvider: 'google' }, { ...base, oauthProvider: 'github', oauthSubject: 'abc' }, { ...base, oauthProvider: 'google', oauthSubject: 'x'.repeat(256) }, { ...base, oauthProvider: null, oauthSubject: 'abc' }]) expect(run(bad, 'users.update').valid).toBe(false);
  });
  it('rejects missing, extra and malformed keys', () => {
    const good = { id, displayName: 'A', timezone: 'UTC', isActive: true };
    for (const bad of [{ ...good, isAdmin: true }, { ...good, email: 'a@b.c' }, { ...good, password: 'x' }, { ...good, id: 'nope' }, { ...good, isActive: 'yes' }, { ...good, timezone: 'Mars/Base' }, { ...good, displayName: '' }, { displayName: 'A', timezone: 'UTC', isActive: true }, { id, displayName: 'A', timezone: 'UTC' }]) expect(run(bad, 'users.update').valid).toBe(false);
  });
  it('users.list takes no input', () => { expect(run({}, 'users.list').valid).toBe(true); });
});

describe('canonical uuids', () => {
  const upper = '11111111-AAAA-4BBB-8CCC-DDDDDDDDDDDD'; const lower = upper.toLowerCase();
  it('users.update lowercases id', () => {
    const out = run({ id: upper, displayName: 'A', timezone: 'UTC', isActive: false }, 'users.update');
    expect(out.valid).toBe(true); expect(out.normalized.id).toBe(lower); expect(out.normalized.fields.id).toBe(lower);
  });
  it('reference keys, objectId and clientRef come out lowercase', () => {
    const task = run({ title: 'T', projectId: upper, clientRef: upper }, 'tasks.create');
    expect(task.normalized.projectId).toBe(lower); expect(task.normalized.fields.project).toBe(lower); expect(task.normalized.clientRef).toBe(lower); expect(task.normalized.fields.client_ref).toBe(lower);
    const grant = run({ objectKind: 'project', objectId: upper, userId: upper, level: 'editor', scope: 'self' }, 'grants.grant');
    expect(grant.normalized.objectId).toBe(lower); expect(grant.normalized.userId).toBe(lower); expect(grant.normalized.share.writeTargetKey).toBe(lower);
    expect(run({ id: upper }, 'projects.read').normalized.id).toBe(lower);
  });
});

describe('dashboard.agenda windowDays', () => {
  const days = (payload: Record<string, unknown>) => { const out = run({ windowStart: '2026-10-04', ...payload }, 'dashboard.agenda'); return out.valid ? (new Date(out.normalized.windowEnd).getTime() - new Date(out.normalized.windowStart).getTime()) / 86400000 : out; };
  it('defaults to 14 days when absent or null', () => {
    expect(days({})).toBe(14); expect(days({ windowDays: null })).toBe(14);
  });
  it('accepts integers from 7 to 42', () => {
    for (const value of [7, 14, 28, 35, 42]) expect(days({ windowDays: value })).toBe(value);
  });
  it('rejects anything else with the standard 422', () => {
    for (const value of ['14', 14.5, 6, 43, 0, -7, true, false, {}, [], NaN]) {
      const out = days({ windowDays: value }) as any;
      expect(out.valid, String(value)).toBe(false); expect(out.resultStatus).toBe(422); expect(out.result).toEqual({ error: { message: 'The supplied filter or identifier is not valid.' } });
    }
  });
  it('leaves other services unchanged', () => {
    expect(run({ windowDays: 14 }, 'tasks.list').valid).toBe(false);
    const stats = run({ windowDays: 6 }, 'dashboard.stats'); expect(stats.valid).toBe(true); expect(stats.normalized.windowEnd).toBe(run({}, 'dashboard.stats').normalized.windowEnd);
  });
});
