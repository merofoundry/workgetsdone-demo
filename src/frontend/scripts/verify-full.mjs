import './stage-guard.mjs';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), W = require('../../verification/harness/wgd.js');
const root = new URL('../../', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('frontend/public/services.json', root), 'utf8')).services;
const evidence = new URL('verification/2026-10-11-full-build/', root); mkdirSync(evidence, { recursive: true });
export const checks = []; export const cleanup = [];
export const check = (name, pass, ev = {}) => { checks.push({ name, pass: !!pass, evidence: ev }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(ev)}`); if (!pass) throw new Error(name); };
export async function call(actor, name, input = {}) {
  const id = registry[name]; if (!id) throw new Error(`service ${name} missing from services.json`);
  const r = await fetch(`${W.BASE}/api/v1/services/${id}/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(actor ? { Cookie: Object.entries(actor?.jar || {}).map(([k, v]) => `${k}=${v}`).join('; ') } : {}) }, body: JSON.stringify(input) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
export const DENIED = { error: { message: 'This record could not be found.' } };
export async function expectDenied(actor, name, input, label = `${name} denied`) { const r = await call(actor, name, input); check(label, r.status === 404 && JSON.stringify(r.body) === JSON.stringify(DENIED), { status: r.status, body: r.body }); }
export async function expectInvalid(actor, name, input, label = `${name} invalid`) { const r = await call(actor, name, input); check(label, r.status === 422, { status: r.status, body: r.body }); return r; }
export async function expectConflict(actor, name, input, label = `${name} conflict`) { const r = await call(actor, name, input); check(label, r.status === 409, { status: r.status, body: r.body }); return r; }
export const fixtureName = section => `WGD-MATRIX ${section} ${new Date().toISOString()}`;
export async function actor(name) {
  const path = new URL(`verification/harness/.session-${name}.json`, root);
  try { const cached = JSON.parse(readFileSync(path, 'utf8')); if ((await call(cached, 'session.current')).status === 200) return cached; } catch {}
  const line = readFileSync(new URL(`.env-${name}`, root), 'utf8').split('\n').find(s => s.startsWith(`${name.toUpperCase()}_PASSWORD=`));
  const session = await W.login(`${name}@workgetsdone.test`, line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim());
  writeFileSync(path, JSON.stringify(session), { mode: 0o600 }); return session;
}
// Delete helpers: every delete service handles a bounded batch per call and answers {done, remaining}; repeat until done.
export async function deleteAll(actor, name, input) { let last; for (let i = 0; i < 20; i++) { last = await call(actor, name, input); if (last.status !== 200 || last.body?.data?.done !== false) return last; } return last; }
export async function purgeProject(actor, id) { const kids = await deleteAll(actor, 'projects.deleteChildren', { id, strategy: 'cascade' }); const del = await call(actor, 'projects.delete', { id, strategy: 'cascade' }); return { kids, del }; }
const sections = {}; export const section = (name, fn) => { sections[name] = fn; };
export async function main(names) {
  const bob = await actor('bob'), jane = await actor('jane'); let failure = null;
  for (const name of names) {
    if (!sections[name]) throw new Error(`unknown section ${name}`);
    try { await sections[name]({ bob, jane }); } catch (e) { failure = `${name}: ${e.message}`; console.error(failure); break; }
    finally { for (const fn of cleanup.splice(0)) await fn().catch(e => console.error('cleanup', e.message)); }
  }
  const file = `verification/2026-10-11-full-build/matrix-${names.join('+')}.json`;
  writeFileSync(new URL(file, root), JSON.stringify({ at: new Date().toISOString(), base: W.BASE, checks, failure }, null, 2) + '\n');
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Live matrix ${names.join(', ')}\n\n${checks.filter(c => c.pass).length}/${checks.length} checks passed against ${W.BASE}. ${file}.${failure ? ' FAILED: ' + failure : ''}\n`);
  if (failure) process.exit(1);
}
section('smoke', async ({ bob, jane }) => {
  for (const [who, s] of [['bob', bob], ['jane', jane]]) { const r = await call(s, 'session.current'); check(`${who} session.current`, r.status === 200 && r.body?.data?.displayName, { status: r.status }); }
  const anon = await call(null, 'tasks.list'); check('anonymous tasks.list refused', [401, 403, 404].includes(anon.status), { status: anon.status });
});
section('entities-read', async ({ bob, jane }) => {
  for (const collection of ['companies', 'contacts']) {
    const name = collection + '.list'; let bobRows, janeRows;
    for (const [who, s] of [['bob', bob], ['jane', jane]]) {
      const r = await call(s, name, {}); check(`${who}: ${name}`, r.status === 200 && Array.isArray(r.body?.data?.items), { status: r.status, total: r.body?.data?.total });
      if (who === 'bob') bobRows = r.body.data.items; else janeRows = r.body.data.items;
      const search = await call(s, name, { query: '__no_such_record__' }); check(`${who}: ${name} search`, search.status === 200 && search.body.data.total === 0);
    }
    const anon = await call(null, name); check(`anonymous: ${name} refused`, [401, 403, 404].includes(anon.status), { status: anon.status });
    const privateRow = bobRows.find(row => !janeRows.some(o => o.id === row.id)); check(`${collection}: a record only bob sees exists`, !!privateRow);
    const read = await call(bob, collection + '.read', { id: privateRow.id }); check(`bob: ${collection}.read`, read.status === 200 && read.body.data.id === privateRow.id && typeof read.body.data.version === 'number' && read.body.data.permissions.write === true, { permissions: read.body?.data?.permissions });
    await expectDenied(jane, collection + '.read', { id: privateRow.id }, `jane: ${collection}.read denied`);
    await expectDenied(bob, collection + '.read', { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, `${collection}.read unknown`);
    await expectInvalid(bob, collection + '.read', { id: 'nope' }, `${collection}.read invalid id`);
    const tl = await call(bob, collection + '.timeline', { id: privateRow.id }); check(`bob: ${collection}.timeline`, tl.status === 200 && Array.isArray(tl.body.data.entries), { entries: tl.body?.data?.entries?.length });
    await expectDenied(jane, collection + '.timeline', { id: privateRow.id }, `jane: ${collection}.timeline denied`);
  }
});
section('entities-write', async ({ bob, jane }) => {
  const ref = () => crypto.randomUUID();
  const MISSING = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const CONFLICT_MESSAGE = 'Someone else changed this record. Reload and try again.', LINKED_MESSAGE = 'The linked record could not be found.';
  const co = await call(bob, 'companies.create', { name: fixtureName('entities-write'), city: 'Austin', clientRef: ref() });
  check('bob: companies.create', co.status === 200 && co.body.data.ok && typeof co.body.data.id === 'string', co.body);
  const read = await call(bob, 'companies.read', { id: co.body.data.id }); check('bob reads the new company', read.status === 200 && read.body.data.version === 1, read.body);
  await expectDenied(jane, 'companies.read', { id: co.body.data.id }, 'jane cannot read the new company');
  const fields = { id: co.body.data.id, name: read.body.data.name, city: 'Dallas', state: 'TX', address1: null, address2: null, postalCode: null, country: null, phone1: null, phone2: null, fax: null };
  const stale = await expectConflict(bob, 'companies.update', { ...fields, version: 5 }, 'stale version is a conflict');
  check('conflict body carries the reload message', stale.body?.error?.message === CONFLICT_MESSAGE, stale.body);
  const upd = await call(bob, 'companies.update', { ...fields, version: 1 }); check('bob updates with the right version', upd.status === 200 && upd.body.data.ok === true, upd.body);
  const again = await call(bob, 'companies.read', { id: co.body.data.id }); check('version advanced and city changed', again.body.data.version === 2 && again.body.data.city === 'Dallas', { version: again.body?.data?.version, city: again.body?.data?.city });
  await expectDenied(jane, 'companies.update', { ...fields, version: 2 }, 'jane cannot update it');
  await expectInvalid(bob, 'companies.update', { ...fields, version: 2, phone1: 'call me maybe' }, 'bad phone is 422');
  const ct = await call(bob, 'contacts.create', { firstName: 'Matrix', lastName: fixtureName('entities-write'), email1: 'matrix@example.test', clientRef: ref() }); check('bob: contacts.create', ct.status === 200 && ct.body.data.id, ct.body);
  const bad = await expectInvalid(bob, 'contacts.associate', { contactId: ct.body.data.id, companyId: MISSING, clientRef: ref() }, 'association to an unreadable company is 422');
  check('linked-record body message', bad.body?.error?.message === LINKED_MESSAGE, bad.body);
  const link = await call(bob, 'contacts.associate', { contactId: ct.body.data.id, companyId: co.body.data.id, role: 'Sponsor', isPrimary: true, clientRef: ref() }); check('bob associates', link.status === 200, link.body);
  const detail = await call(bob, 'companies.read', { id: co.body.data.id }); check('association appears', detail.body.data.associations.some(a => a.contactId === ct.body.data.id));
  const primary = await call(bob, 'companies.setPrimaryContact', { id: co.body.data.id, contactId: ct.body.data.id }); check('primary contact set', primary.status === 200, primary.body);
  const primaryRead = await call(bob, 'companies.read', { id: co.body.data.id }); check('primary contact is visible on the company', primaryRead.body.data.primaryContactId === ct.body.data.id, primaryRead.body?.data?.primaryContactId);
  const cleared = await call(bob, 'companies.setPrimaryContact', { id: co.body.data.id, contactId: null }); check('companies.setPrimaryContact with null clears it', cleared.status === 200, cleared.body);
  const clearedRead = await call(bob, 'companies.read', { id: co.body.data.id }); check('primary contact is cleared', clearedRead.body.data.primaryContactId === null, clearedRead.body?.data?.primaryContactId);
  await expectInvalid(bob, 'companies.setPrimaryContact', { id: co.body.data.id }, 'setPrimaryContact without a contactId key is 422');
  const pr = await call(bob, 'projects.create', { name: fixtureName('entities-write'), description: 'matrix', status: 'STARTED', companyId: co.body.data.id, clientRef: ref() }); check('bob: projects.create', pr.status === 200 && pr.body.data.id, pr.body);
  const badRef = await expectInvalid(bob, 'projects.create', { name: 'x', description: 'd', companyId: MISSING, clientRef: ref() }, 'unreadable company ref is 422 (AC-09)');
  check('project ref body message', badRef.body?.error?.message === LINKED_MESSAGE, badRef.body);
  const tk = await call(bob, 'tasks.create', { title: fixtureName('entities-write'), projectId: pr.body.data.id, clientRef: ref() }); check('tasks.create still works and returns an id', tk.status === 200 && tk.body.data.id, tk.body);
  const legacy = await call(bob, 'tasks.create', { title: fixtureName('entities-write legacy'), projectId: pr.body.data.id }); check('tasks.create without clientRef answers ok with a null id', legacy.status === 200 && legacy.body.data.ok === true && legacy.body.data.id === null, legacy.body);
  const tread = await call(bob, 'tasks.read', { id: tk.body.data.id });
  const tupd = await call(bob, 'tasks.update', { id: tk.body.data.id, version: 1, title: tread.body.data.title + ' edited', body: '', startAt: null, endAt: null, billable: true, billed: false, assigneeId: null, contactId: null, projectId: pr.body.data.id, companyId: null }); check('tasks.update', tupd.status === 200, tupd.body);
  await expectInvalid(bob, 'tasks.update', { id: tk.body.data.id, version: 2, title: 't', billable: false, billed: true }, 'billed without billable is 422');
  const arch = await call(bob, 'projects.archive', { id: pr.body.data.id }); check('projects.archive', arch.status === 200, arch.body);
  const list = await call(bob, 'projects.list', {}); check('archived project leaves the default list', !list.body.data.items.some(p => p.id === pr.body.data.id));
  await expectDenied(jane, 'projects.archive', { id: pr.body.data.id }, 'jane cannot archive it');
  // Rows that predate the version column have a null stored version and read as version 1; they must stay editable.
  const bobList = await call(bob, 'companies.list', {});
  const legacyRow = bobList.body.data.items.find(row => /^LEGACY-CO/.test(row.name));
  check('a pre-existing LEGACY-CO company is visible to bob (fixture missing otherwise)', !!legacyRow, { total: bobList.body?.data?.items?.length });
  const legacyRead = await call(bob, 'companies.read', { id: legacyRow.id }); const d = legacyRead.body.data; const v0 = d.version;
  const legacyUpdate = await call(bob, 'companies.update', { id: d.id, version: v0, name: d.name, city: d.city, state: d.state, country: d.country, address1: d.address1, address2: d.address2, postalCode: d.postalCode, phone1: d.phone, phone2: d.phone2, fax: d.fax });
  check('pre-existing record updates with its read version', legacyUpdate.status === 200, { v0, body: legacyUpdate.body });
  const legacyAfter = await call(bob, 'companies.read', { id: d.id }); check('next read shows the following version', legacyAfter.body.data.version === v0 + 1, { before: v0, after: legacyAfter.body.data.version });
  // Final fix wave: a parent the caller can only READ (a viewer/subtree grant) must not be linkable from a write.
  const janeMe = await call(jane, 'session.current'); const janeUid = janeMe.body?.data?.id || janeMe.body?.data?.userId; check('jane session exposes an id', typeof janeUid === 'string', janeMe.body);
  const vg = await call(bob, 'grants.grant', { objectKind: 'company', objectId: co.body.data.id, userId: janeUid, level: 'viewer', scope: 'subtree' }); check('bob grants jane viewer/subtree on the company', vg.status === 200 && vg.body.data.ok === true, vg);
  const seenPr = await call(jane, 'projects.read', { id: pr.body.data.id }); check('jane can read the project under the company (read only)', seenPr.status === 200 && seenPr.body.data.permissions.write === false, seenPr.body?.data?.permissions);
  // An unchanged parent reference must not be re-checked: jane edits bob's task (editor on the task) that sits in a project she can only read.
  const tgrant = await call(bob, 'grants.grant', { objectKind: 'task', objectId: tk.body.data.id, userId: janeUid, level: 'editor', scope: 'self' }); check('bob grants jane editor/self on his task', tgrant.status === 200 && tgrant.body.data.ok === true, tgrant);
  const bobTask = (await call(jane, 'tasks.read', { id: tk.body.data.id })).body.data; check('jane can write the task but the project is read only', bobTask.canWrite === true && bobTask.projectId === pr.body.data.id, { canWrite: bobTask.canWrite, projectId: bobTask.projectId });
  const renamed = await call(jane, 'tasks.update', { id: bobTask.id, version: bobTask.version, title: bobTask.title + ' (renamed by jane)', body: bobTask.body ?? '', startAt: bobTask.startAt, endAt: bobTask.endAt, billable: bobTask.billable, billed: bobTask.billed, assigneeId: bobTask.assigneeId, contactId: bobTask.contactId, projectId: bobTask.projectId, companyId: bobTask.companyId });
  check('jane renames a task with an unchanged read-only project (200)', renamed.status === 200 && renamed.body.data.ok === true, renamed.body);
  const afterRename = (await call(bob, 'tasks.read', { id: tk.body.data.id })).body.data; check('the title changed and the project is unchanged', afterRename.title.endsWith('(renamed by jane)') && afterRename.projectId === pr.body.data.id, { title: afterRename.title, projectId: afterRename.projectId });
  const tgl = await call(bob, 'grants.list', { objectKind: 'task', objectId: tk.body.data.id });
  for (const g of tgl.body.data.grants.filter(g => g.userId === janeUid && g.revocable)) { const rv = await call(bob, 'grants.revoke', { objectKind: 'task', objectId: tk.body.data.id, userId: janeUid, source: g.source }); check(`bob revokes jane's task ${g.source}`, rv.status === 200, rv.body); }
  const jtask = await call(jane, 'tasks.create', { title: fixtureName('entities-write jane task'), clientRef: ref() }); check('jane creates her own task', jtask.status === 200 && jtask.body.data.id, jtask.body);
  const jtRead = (await call(jane, 'tasks.read', { id: jtask.body.data.id })).body.data;
  const moved = await call(jane, 'tasks.update', { id: jtRead.id, version: jtRead.version, title: jtRead.title, body: '', startAt: null, endAt: null, billable: false, billed: false, assigneeId: null, contactId: null, projectId: pr.body.data.id, companyId: null });
  check('jane cannot move her task into a project she can only read (422)', moved.status === 422 && moved.body?.error?.message === LINKED_MESSAGE, moved.body);
  const jtAfter = (await call(jane, 'tasks.read', { id: jtask.body.data.id })).body.data; check('the task did not move', !jtAfter.projectId && jtAfter.version === jtRead.version, { projectId: jtAfter.projectId, version: jtAfter.version });
  const jproj = await call(jane, 'projects.create', { name: fixtureName('entities-write jane project'), description: 'matrix', status: 'STARTED', companyId: co.body.data.id, clientRef: ref() });
  check('jane cannot create a project under a company she can only read (422)', jproj.status === 422 && jproj.body?.error?.message === LINKED_MESSAGE, jproj.body);
  const jcontact = await call(jane, 'contacts.create', { firstName: 'Jane', lastName: fixtureName('entities-write'), email1: 'jane-matrix@example.test', clientRef: ref() }); check('jane creates her own contact', jcontact.status === 200 && jcontact.body.data.id, jcontact.body);
  const jlink = await call(jane, 'contacts.associate', { contactId: jcontact.body.data.id, companyId: co.body.data.id, clientRef: ref() });
  check('jane cannot associate her contact to a company she can only read (422)', jlink.status === 422 && jlink.body?.error?.message === LINKED_MESSAGE, jlink.body);
  const vgl = await call(bob, 'grants.list', { objectKind: 'company', objectId: co.body.data.id });
  for (const g of vgl.body.data.grants.filter(g => g.userId === janeUid && g.revocable)) { const rv = await call(bob, 'grants.revoke', { objectKind: 'company', objectId: co.body.data.id, userId: janeUid, source: g.source }); check(`bob revokes jane's ${g.source}`, rv.status === 200, rv.body); }
  await expectDenied(jane, 'companies.read', { id: co.body.data.id }, 'jane companies.read denied after the grant is revoked');
  const jtDel = await deleteAll(jane, 'tasks.delete', { id: jtask.body.data.id }); check('cleanup: jane task deleted', jtDel.status === 200 && jtDel.body.data.done === true, jtDel.body);
  const jcDel = await deleteAll(jane, 'contacts.delete', { id: jcontact.body.data.id }); check('cleanup: jane contact deleted', jcDel.status === 200 && jcDel.body.data.done === true, jcDel.body);
  // Task 13: the fixtures this section created are removed through the real delete services.
  // primaryContactId is written only by companies.setPrimaryContact and cannot be cleared; a primary contact blocks its own delete, so the company goes first.
  const gone = (await call(bob, 'companies.read', { id: co.body.data.id })).body.data;
  const unlink = await call(bob, 'contacts.dissociate', { associationId: gone.associations.find(a => a.contactId === ct.body.data.id).id }); check('cleanup: contacts.dissociate', unlink.status === 200, unlink.body);
  const pp = await purgeProject(bob, pr.body.data.id); check('cleanup: project and its children deleted', pp.kids.status === 200 && pp.kids.body.data.done === true && pp.del.status === 200, { kids: pp.kids.body, del: pp.del.body });
  const codel = await call(bob, 'companies.delete', { id: co.body.data.id }); check('cleanup: companies.delete', codel.status === 200 && codel.body.data.done === true, codel.body);
  const cdel = await deleteAll(bob, 'contacts.delete', { id: ct.body.data.id }); check('cleanup: contacts.delete removes the fixture contact', cdel.status === 200 && cdel.body.data.done === true, cdel.body);
  await expectDenied(bob, 'companies.read', { id: co.body.data.id }, 'cleanup: the deleted fixture company reads as not found');
});
section('sharing', async ({ bob, jane }) => {
  const ref = () => crypto.randomUUID();
  const ME = await call(jane, 'session.current'); const bobMe = await call(bob, 'session.current');
  const janeId = ME.body?.data?.id || ME.body?.data?.userId; check('jane session exposes an id', typeof janeId === 'string', ME.body);
  const bobId = bobMe.body?.data?.id || bobMe.body?.data?.userId;
  const co = await call(bob, 'companies.create', { name: fixtureName('sharing'), city: 'Austin', clientRef: ref() }); check('bob: companies.create fixture', co.status === 200 && co.body.data.id, co.body);
  const C = co.body.data.id;
  await expectDenied(jane, 'companies.read', { id: C }, 'jane cannot read the fixture company');
  const own = await call(bob, 'grants.list', { objectKind: 'company', objectId: C });
  check('bob: grants.list shows only his creator grant', own.status === 200 && own.body.data.grants.length === 1 && own.body.data.grants[0].source === 'creator' && own.body.data.grants[0].revocable === false && own.body.data.grants[0].userId === bobId, own.body);
  check('grants.list carries users, levels and scopes', own.body.data.users.some(u => u.id === janeId && typeof u.displayName === 'string') && JSON.stringify(own.body.data.levels) === '["viewer","editor","manager"]' && JSON.stringify(own.body.data.scopes) === '["self","subtree"]', { users: own.body.data.users.length });
  check('creator grant has a display name', typeof own.body.data.grants[0].displayName === 'string' && own.body.data.grants[0].displayName !== 'Former user', own.body.data.grants[0]);
  await expectDenied(jane, 'grants.list', { objectKind: 'company', objectId: C }, 'jane: grants.list denied without a grant');
  await expectInvalid(bob, 'grants.list', { objectKind: 'bogus', objectId: C }, 'grants.list unknown kind is 422');
  await expectInvalid(bob, 'grants.list', { objectKind: 'contact_company', objectId: C }, 'grants.list contact_company is not listable');
  await expectInvalid(bob, 'grants.list', { objectKind: 'company', objectId: 'nope' }, 'grants.list bad id is 422');
  await expectDenied(bob, 'grants.list', { objectKind: 'company', objectId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, 'grants.list unknown object is denied');
  await expectInvalid(bob, 'grants.grant', { objectKind: 'company', objectId: C, userId: janeId, level: 'owner', scope: 'self' }, 'grants.grant bad level is 422');
  await expectInvalid(bob, 'grants.grant', { objectKind: 'company', objectId: C, userId: janeId, level: 'viewer', scope: 'everywhere' }, 'grants.grant bad scope is 422');
  await expectDenied(jane, 'grants.grant', { objectKind: 'company', objectId: C, userId: janeId, level: 'manager', scope: 'subtree' }, 'jane cannot grant herself access to bob\'s company');
  await expectDenied(jane, 'companies.read', { id: C }, 'still unreadable after the refused self-grant');
  // viewer / self
  const g1 = await call(bob, 'grants.grant', { objectKind: 'company', objectId: C, userId: janeId, level: 'viewer', scope: 'self' }); check('bob grants jane viewer/self', g1.status === 200 && g1.body.data.ok === true, g1);
  const seen = await call(jane, 'companies.read', { id: C }); check('jane reads the company as viewer', seen.status === 200 && seen.body.data.permissions.read === true && seen.body.data.permissions.write === false && seen.body.data.permissions.share === false, seen.body?.data?.permissions);
  const f = seen.body.data;
  await expectDenied(jane, 'companies.update', { id: C, version: f.version, name: f.name, city: 'Hacked', state: f.state, country: f.country, address1: f.address1, address2: f.address2, postalCode: f.postalCode, phone1: f.phone, phone2: f.phone2, fax: f.fax }, 'viewer cannot update (denied)');
  await expectDenied(jane, 'grants.list', { objectKind: 'company', objectId: C }, 'viewer has no SHARE: grants.list denied');
  await expectDenied(jane, 'grants.grant', { objectKind: 'company', objectId: C, userId: bobId, level: 'viewer', scope: 'self' }, 'viewer cannot grant');
  const afterViewer = await call(bob, 'grants.list', { objectKind: 'company', objectId: C });
  const janeRows = () => afterViewer.body.data.grants.filter(g => g.userId === janeId);
  check('bob sees jane\'s viewer grant as revocable', janeRows().length === 1 && janeRows()[0].revocable === true && typeof janeRows()[0].source === 'string' && janeRows()[0].source !== 'creator', afterViewer.body.data.grants);
  // manager / subtree
  const g2 = await call(bob, 'grants.grant', { objectKind: 'company', objectId: C, userId: janeId, level: 'manager', scope: 'subtree' }); check('bob grants jane manager/subtree', g2.status === 200, g2);
  const jl = await call(jane, 'grants.list', { objectKind: 'company', objectId: C });
  check('jane: grants.list is 200 as manager', jl.status === 200 && Array.isArray(jl.body.data.grants), jl);
  check('jane sees bob (creator, not revocable) and herself', jl.body.data.grants.some(g => g.userId === bobId && g.source === 'creator' && g.revocable === false) && jl.body.data.grants.some(g => g.userId === janeId && g.revocable === true), jl.body.data.grants);
  const mgr = await call(jane, 'companies.read', { id: C }); check('manager read reports write and share', mgr.status === 200 && mgr.body.data.permissions.write === true && mgr.body.data.permissions.share === true, mgr.body?.data?.permissions);
  // jane creates a task under the company; bob sees it
  const jt = await call(jane, 'tasks.create', { title: fixtureName('sharing jane task'), companyId: C, clientRef: ref() }); check('jane creates a task under the shared company', jt.status === 200 && jt.body.data.id, jt.body);
  const bt = await call(bob, 'tasks.read', { id: jt.body.data.id }); check('bob sees the task jane created', bt.status === 200 && bt.body.data.id === jt.body.data.id, bt.body);
  check('bob\'s task read carries canShare and canDelete', typeof bt.body.data.canShare === 'boolean' && typeof bt.body.data.canDelete === 'boolean', { canShare: bt.body.data.canShare, canDelete: bt.body.data.canDelete });
  const jr = await call(jane, 'tasks.read', { id: jt.body.data.id }); check('jane reads her own task; canShare is real', jr.status === 200 && typeof jr.body.data.canShare === 'boolean', { canShare: jr.body.data.canShare });
  // bob revokes every non-creator grant jane holds, using the source from grants.list
  const current = await call(bob, 'grants.list', { objectKind: 'company', objectId: C });
  const revocable = current.body.data.grants.filter(g => g.userId === janeId && g.revocable);
  check('jane holds revocable grants to remove', revocable.length >= 1, revocable);
  for (const g of revocable) { const r = await call(bob, 'grants.revoke', { objectKind: 'company', objectId: C, userId: janeId, source: g.source }); check(`bob revokes jane's ${g.source}`, r.status === 200 && r.body.data.ok === true, r); }
  await expectDenied(jane, 'companies.read', { id: C }, 'jane companies.read denied after revoke');
  await expectDenied(jane, 'grants.list', { objectKind: 'company', objectId: C }, 'jane grants.list denied after revoke');
  const fin = await call(bob, 'grants.list', { objectKind: 'company', objectId: C }); check('only the creator grant remains', fin.status === 200 && fin.body.data.grants.length === 1 && fin.body.data.grants[0].source === 'creator', fin.body?.data?.grants);
  const cr = await expectInvalid(bob, 'grants.revoke', { objectKind: 'company', objectId: C, userId: bobId, source: 'creator' }, 'revoking the creator source is 422');
  check('creator revoke message', cr.body?.error?.message === "The creator's access cannot be removed.", cr.body);
  await expectDenied(jane, 'grants.revoke', { objectKind: 'company', objectId: C, userId: bobId, source: 'direct' }, 'jane cannot revoke on bob\'s company');
  // projects.read now answers the exact denied body on a refused gate
  const pr = await call(bob, 'projects.create', { name: fixtureName('sharing'), description: 'matrix', status: 'STARTED', clientRef: ref() }); check('bob: projects.create fixture', pr.status === 200 && pr.body.data.id, pr.body);
  await expectDenied(jane, 'projects.read', { id: pr.body.data.id }, 'jane: projects.read on a bob-only project returns the exact DENIED body');
  await expectDenied(jane, 'projects.timeline', { id: pr.body.data.id }, 'jane: projects.timeline on a bob-only project returns the exact DENIED body');
  const pread = await call(bob, 'projects.read', { id: pr.body.data.id }); check('bob: project permissions.share and delete are real', pread.status === 200 && pread.body.data.permissions.share === true && pread.body.data.permissions.delete === true, pread.body?.data?.permissions);
  const bt2 = await call(bob, 'tasks.create', { title: fixtureName('sharing bob task'), projectId: pr.body.data.id, clientRef: ref() });
  const own2 = await call(bob, 'tasks.read', { id: bt2.body.data.id }); check('bob\'s own task: canShare and canDelete true', own2.status === 200 && own2.body.data.canShare === true && own2.body.data.canDelete === true, { canShare: own2.body?.data?.canShare, canDelete: own2.body?.data?.canDelete });
  const gl = await call(bob, 'grants.list', { objectKind: 'task', objectId: bt2.body.data.id }); check('grants.list works for a task', gl.status === 200 && gl.body.data.grants.some(g => g.source === 'creator'), gl.body);
});
section('delete', async ({ bob, jane }) => {
  const ref = () => crypto.randomUUID();
  const mk = async (name, input) => { const r = await call(bob, name, { ...input, clientRef: ref() }); check(`bob: ${name} fixture`, r.status === 200 && r.body.data.id, r.body); return r.body.data.id; };
  // 1. company blocked by a project; jane cannot touch it
  const C = await mk('companies.create', { name: fixtureName('delete') });
  const P = await mk('projects.create', { name: fixtureName('delete'), description: 'matrix', status: 'STARTED', companyId: C });
  const dry = await call(bob, 'companies.delete', { id: C, dryRun: true });
  check('company dryRun is blocked by its project', dry.status === 200 && dry.body.data.blocked === true && JSON.stringify(dry.body.data.reasons) === JSON.stringify([{ kind: 'projects', count: 1 }]) && Array.isArray(dry.body.data.strategies), dry.body);
  const stillThere = await call(bob, 'companies.read', { id: C }); check('dryRun deletes nothing', stillThere.status === 200, stillThere.body);
  const blocked = await call(bob, 'companies.delete', { id: C });
  check('blocked real delete is 409 with reasons', blocked.status === 409 && blocked.body.error.message === 'This record cannot be deleted yet.' && JSON.stringify(blocked.body.error.reasons) === JSON.stringify([{ kind: 'projects', count: 1 }]), blocked.body);
  await expectDenied(jane, 'companies.delete', { id: C, dryRun: true }, 'jane: companies.delete dryRun on bob\'s company is DENIED');
  await expectDenied(jane, 'companies.delete', { id: C }, 'jane: companies.delete on bob\'s company is DENIED');
  await expectInvalid(bob, 'companies.delete', { id: C, strategy: 'cascade' }, 'companies.delete rejects a strategy');
  await expectInvalid(bob, 'companies.delete', { id: 'nope' }, 'companies.delete rejects a bad id');
  await expectDenied(bob, 'companies.delete', { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, 'companies.delete unknown id is DENIED');
  // 2. project with children: strategies, deleteChildren in batches, then the project and the company
  const T1 = await mk('tasks.create', { title: fixtureName('delete t1'), projectId: P });
  const N1 = await mk('notes.create', { title: fixtureName('delete n1'), taskId: T1 });
  const CL = await mk('calls.create', { title: fixtureName('delete call'), projectId: P });
  const N2 = await mk('notes.create', { title: fixtureName('delete n2'), projectId: P });
  const T2 = await mk('tasks.create', { title: fixtureName('delete t2'), projectId: P });
  const T3 = await mk('tasks.create', { title: fixtureName('delete t3'), projectId: P });
  const pdry = await call(bob, 'projects.delete', { id: P, dryRun: true });
  check('project dryRun without a strategy is blocked by its children and offers both strategies', pdry.status === 200 && pdry.body.data.blocked === true && pdry.body.data.reasons.some(r => r.kind === 'children') && JSON.stringify(pdry.body.data.strategies) === '["cascade","reparent"]', pdry.body);
  check('project dryRun counts the descendants', pdry.body.data.children.tasks === 3 && pdry.body.data.children.calls === 1 && pdry.body.data.children.notes === 2, pdry.body.data.children);
  const pdry2 = await call(bob, 'projects.delete', { id: P, dryRun: true, strategy: 'cascade' }); check('project dryRun with a strategy is still blocked by its children (strategy is ignored)', pdry2.status === 200 && pdry2.body.data.blocked === true && pdry2.body.data.reasons.some(r => r.kind === 'children'), pdry2.body);
  const pstrat = await call(bob, 'projects.delete', { id: P, strategy: 'cascade' }); check('projects.delete with a strategy on a project that still has children is 409 and deletes nothing', pstrat.status === 409 && pstrat.body.error.reasons.some(r => r.kind === 'children'), pstrat.body);
  const stillP = await call(bob, 'projects.read', { id: P }); check('the project is still there after the refused delete', stillP.status === 200, stillP.body);
  const pblocked = await call(bob, 'projects.delete', { id: P }); check('project delete without a strategy and with children is 409', pblocked.status === 409 && pblocked.body.error.reasons.some(r => r.kind === 'children'), pblocked.body);
  await expectDenied(jane, 'projects.deleteChildren', { id: P, strategy: 'cascade' }, 'jane: projects.deleteChildren is DENIED');
  await expectInvalid(bob, 'projects.deleteChildren', { id: P }, 'projects.deleteChildren requires a strategy');
  // reparent first: direct children move to the company in batches of four (6 direct children here -> 2 calls)
  const first = await call(bob, 'projects.deleteChildren', { id: P, strategy: 'reparent' });
  check('first batch moves four and reports remaining', first.status === 200 && first.body.data.ok === true && first.body.data.done === false && first.body.data.remaining >= 1, first.body);
  const rest = await deleteAll(bob, 'projects.deleteChildren', { id: P, strategy: 'reparent' }); check('reparent finishes', rest.status === 200 && rest.body.data.done === true, rest.body);
  const moved = await call(bob, 'tasks.read', { id: T2 }); check('a reparented task has no project and sits under the project company', moved.status === 200 && moved.body.data.projectId === null && moved.body.data.companyId === C, { projectId: moved.body?.data?.projectId, companyId: moved.body?.data?.companyId });
  const movedNote = await call(bob, 'notes.read', { id: N1 }); check('the note under a task stays under its task', movedNote.status === 200 && movedNote.body.data.taskId === T1, movedNote.body?.data);
  const empty = await call(bob, 'projects.delete', { id: P, dryRun: true }); check('project with no children left is not blocked without a strategy', empty.status === 200 && empty.body.data.blocked === false && empty.body.data.children.tasks === 0, empty.body);
  const pdel = await call(bob, 'projects.delete', { id: P }); check('project delete 200', pdel.status === 200 && pdel.body.data.ok === true && pdel.body.data.done === true, pdel.body);
  await expectDenied(bob, 'projects.read', { id: P }, 'the deleted project reads as not found');
  // the company still has the moved children, so it stays blocked until they go
  const cdry = await call(bob, 'companies.delete', { id: C, dryRun: true }); check('company is blocked by the moved tasks and calls', cdry.status === 200 && cdry.body.data.blocked === true && cdry.body.data.reasons.some(r => r.kind === 'tasks') && cdry.body.data.reasons.some(r => r.kind === 'calls'), cdry.body);
  for (const t of [T1, T2, T3]) { const r = await call(bob, 'tasks.delete', { id: t }); check('tasks.delete ' + t.slice(0, 8), r.status === 200 && r.body.data.done === true, r.body); }
  const rc = await call(bob, 'calls.delete', { id: CL }); check('calls.delete', rc.status === 200 && rc.body.data.done === true, rc.body);
  for (const n of [N1, N2]) { const r = await call(bob, 'notes.delete', { id: n }); check('notes.delete ' + n.slice(0, 8), r.status === 200 && r.body.data.done === true, r.body); }
  const cdry2 = await call(bob, 'companies.delete', { id: C, dryRun: true }); check('company is no longer blocked', cdry2.status === 200 && cdry2.body.data.blocked === false, cdry2.body);
  const cdel = await call(bob, 'companies.delete', { id: C }); check('company delete 200', cdel.status === 200 && cdel.body.data.ok === true, cdel.body);
  await expectDenied(bob, 'companies.read', { id: C }, 'companies.read is 404 for bob after the delete');
  await expectDenied(jane, 'companies.read', { id: C }, 'companies.read is 404 for jane too');
  // 3. cascade: deleteChildren soft-deletes tasks, calls, notes in leaf-first order
  const P2 = await mk('projects.create', { name: fixtureName('delete cascade'), description: 'matrix', status: 'STARTED' });
  const ct1 = await mk('tasks.create', { title: fixtureName('delete c1'), projectId: P2 });
  const cn1 = await mk('notes.create', { title: fixtureName('delete cn1'), taskId: ct1 });
  const cc1 = await mk('calls.create', { title: fixtureName('delete cc1'), taskId: ct1 });
  const casc = await deleteAll(bob, 'projects.deleteChildren', { id: P2, strategy: 'cascade' }); check('cascade finishes', casc.status === 200 && casc.body.data.done === true, casc.body);
  await expectDenied(bob, 'tasks.read', { id: ct1 }, 'cascade: the task is gone');
  await expectDenied(bob, 'notes.read', { id: cn1 }, 'cascade: the task note is gone');
  await expectDenied(bob, 'calls.read', { id: cc1 }, 'cascade: the task call is gone');
  const pdel2 = await call(bob, 'projects.delete', { id: P2 }); check('project with nothing left deletes without a strategy', pdel2.status === 200 && pdel2.body.data.done === true, pdel2.body);
  // 4. sub-projects block whatever the strategy
  const P3 = await mk('projects.create', { name: fixtureName('delete parent'), description: 'matrix', status: 'STARTED' });
  const P4 = await mk('projects.create', { name: fixtureName('delete child'), description: 'matrix', status: 'STARTED', parentProjectId: P3 });
  const sdry = await call(bob, 'projects.delete', { id: P3, dryRun: true, strategy: 'cascade' }); check('sub-projects block regardless of strategy', sdry.status === 200 && sdry.body.data.blocked === true && sdry.body.data.reasons.some(r => r.kind === 'subprojects' && r.count === 1), sdry.body);
  const sreal = await call(bob, 'projects.delete', { id: P3, strategy: 'cascade' }); check('real delete with sub-projects is 409', sreal.status === 409, sreal.body);
  await purgeProject(bob, P4); const pd3 = await call(bob, 'projects.delete', { id: P3 }); check('parent deletes once the sub-project is gone', pd3.status === 200, pd3.body);
  // 5. task delete re-parents its call and note to the task project
  const P5 = await mk('projects.create', { name: fixtureName('delete reparent'), description: 'matrix', status: 'STARTED' });
  const rt = await mk('tasks.create', { title: fixtureName('delete rt'), projectId: P5 });
  const rn = await mk('notes.create', { title: fixtureName('delete rn'), taskId: rt });
  const rcall = await mk('calls.create', { title: fixtureName('delete rcall'), taskId: rt });
  const tdry = await call(bob, 'tasks.delete', { id: rt, dryRun: true }); check('task dryRun names the calls and notes that move and is never blocked', tdry.status === 200 && tdry.body.data.blocked === false && tdry.body.data.children.calls === 1 && tdry.body.data.children.notes === 1, tdry.body);
  await expectDenied(jane, 'tasks.delete', { id: rt }, 'jane: tasks.delete is DENIED');
  const tdel = await call(bob, 'tasks.delete', { id: rt }); check('task delete 200', tdel.status === 200 && tdel.body.data.done === true, tdel.body);
  await expectDenied(bob, 'tasks.read', { id: rt }, 'the deleted task reads as not found');
  const nread = await call(bob, 'notes.read', { id: rn }); check('the task note now belongs to the project', nread.status === 200 && nread.body.data.projectId === P5 && nread.body.data.taskId === null, { projectId: nread.body?.data?.projectId, taskId: nread.body?.data?.taskId });
  const cread = await call(bob, 'calls.read', { id: rcall }); check('the task call now belongs to the project', cread.status === 200 && cread.body.data.projectId === P5 && cread.body.data.taskId === null, { projectId: cread.body?.data?.projectId, taskId: cread.body?.data?.taskId });
  // 6. call delete re-parents its note to the call parent
  const kt = await mk('tasks.create', { title: fixtureName('delete kt'), projectId: P5 });
  const kcall = await mk('calls.create', { title: fixtureName('delete kcall'), taskId: kt });
  const kn = await mk('notes.create', { title: fixtureName('delete kn'), callId: kcall });
  const kdel = await call(bob, 'calls.delete', { id: kcall }); check('call delete 200', kdel.status === 200 && kdel.body.data.done === true, kdel.body);
  const kread = await call(bob, 'notes.read', { id: kn }); check('the call note now belongs to the call task', kread.status === 200 && kread.body.data.taskId === kt && kread.body.data.callId === null, { taskId: kread.body?.data?.taskId, callId: kread.body?.data?.callId });
  // 7. note delete (attachments are covered by the live file probe in the task report)
  const ndel = await call(bob, 'notes.delete', { id: kn }); check('note delete 200', ndel.status === 200 && ndel.body.data.done === true, ndel.body);
  await expectDenied(bob, 'notes.read', { id: kn }, 'the deleted note reads as not found');
  await purgeProject(bob, P5);
  // 8. contacts: blocked while referenced, associations go with a free contact
  const CO2 = await mk('companies.create', { name: fixtureName('delete contact co') });
  const K = await mk('contacts.create', { firstName: 'Matrix', lastName: fixtureName('delete'), email1: 'matrix@example.test' });
  const link = await call(bob, 'contacts.associate', { contactId: K, companyId: CO2, role: 'Sponsor', isPrimary: true, clientRef: ref() }); check('contact associated', link.status === 200, link.body);
  const kp = await call(bob, 'companies.setPrimaryContact', { id: CO2, contactId: K }); check('contact is the primary contact', kp.status === 200, kp.body);
  const kdry = await call(bob, 'contacts.delete', { id: K, dryRun: true }); check('contact is blocked as a primary contact', kdry.status === 200 && kdry.body.data.blocked === true && kdry.body.data.reasons.some(r => r.kind === 'companies'), kdry.body);
  const k409 = await call(bob, 'contacts.delete', { id: K }); check('referenced contact delete is 409', k409.status === 409, k409.body);
  await expectDenied(jane, 'contacts.delete', { id: K }, 'jane: contacts.delete is DENIED');
  const cdet = (await call(bob, 'companies.read', { id: CO2 })).body.data;
  const clr = await call(bob, 'companies.update', { id: CO2, version: cdet.version, name: cdet.name, city: cdet.city, state: cdet.state, country: cdet.country, address1: cdet.address1, address2: cdet.address2, postalCode: cdet.postalCode, phone1: cdet.phone, phone2: cdet.phone2, fax: cdet.fax }); check('company update without primaryContactId', clr.status === 200, clr.body);
  const k2 = await call(bob, 'companies.delete', { id: CO2, dryRun: true }); check('company is blocked by its association', k2.status === 200 && k2.body.data.blocked === true && k2.body.data.reasons.some(r => r.kind === 'associations'), k2.body);
  const pre = await call(bob, 'companies.read', { id: CO2 }); check('the association is visible before the contact delete', pre.status === 200 && pre.body.data.associations.length === 1 && pre.body.data.associations[0].contactId === K, pre.body?.data?.associations);
  const kdel2 = await deleteAll(bob, 'contacts.delete', { id: K }); check('free contact delete 200', kdel2.status === 200 && kdel2.body.data.done === true, kdel2.body);
  await expectDenied(bob, 'contacts.read', { id: K }, 'the deleted contact reads as not found');
  const after = await call(bob, 'companies.read', { id: CO2 }); check('its association is gone from the company (one before, none now)', after.status === 200 && after.body.data.associations.length === 0, after.body?.data?.associations);
  // 9. editor-level denial: DELETE needs SHARE, which the editor level lacks
  const janeMe = await call(jane, 'session.current'); const janeId = janeMe.body.data.id;
  const ge = await call(bob, 'grants.grant', { objectKind: 'company', objectId: CO2, userId: janeId, level: 'editor', scope: 'self' }); check('bob grants jane editor on the company', ge.status === 200, ge.body);
  const jr = await call(jane, 'companies.read', { id: CO2 }); check('jane can now read it and write but not share', jr.status === 200 && jr.body.data.permissions.write === true && jr.body.data.permissions.share === false, jr.body?.data?.permissions);
  await expectDenied(jane, 'companies.delete', { id: CO2, dryRun: true }, 'editor: companies.delete dryRun is DENIED');
  await expectDenied(jane, 'companies.delete', { id: CO2 }, 'editor: companies.delete is DENIED');
  const still = await call(bob, 'companies.read', { id: CO2 }); check('the company survives the editor attempt', still.status === 200, still.body);
  const gl = await call(bob, 'grants.list', { objectKind: 'company', objectId: CO2 });
  for (const g of gl.body.data.grants.filter(g => g.userId === janeId && g.revocable)) { const rv = await call(bob, 'grants.revoke', { objectKind: 'company', objectId: CO2, userId: janeId, source: g.source }); check('bob revokes jane\'s editor grant', rv.status === 200, rv.body); }
  // 10. orphans: nothing can adopt the children (task with no project, company or contact)
  const OT = await mk('tasks.create', { title: fixtureName('delete orphan task') });
  const ON = await mk('notes.create', { title: fixtureName('delete orphan note'), taskId: OT });
  const od = await call(bob, 'tasks.delete', { id: OT, dryRun: true }); check('orphan task dryRun is blocked with kind orphans', od.status === 200 && od.body.data.blocked === true && JSON.stringify(od.body.data.reasons) === JSON.stringify([{ kind: 'orphans', count: 1 }]), od.body);
  const o409 = await call(bob, 'tasks.delete', { id: OT }); check('orphan task delete is 409 with the standard message and orphans reason', o409.status === 409 && o409.body.error.message === 'This record cannot be deleted yet.' && JSON.stringify(o409.body.error.reasons) === JSON.stringify([{ kind: 'orphans', count: 1 }]), o409.body);
  const oStill = await call(bob, 'tasks.read', { id: OT }); check('the orphan task survives', oStill.status === 200, oStill.body);
  for (const [svc, id] of [['notes.delete', ON], ['tasks.delete', OT]]) { const r = await call(bob, svc, { id }); check('orphan fixture cleanup ' + svc, r.status === 200 && r.body.data.done === true, r.body); }
  // 11. contact fallback: the deleted task has only a contact, so its note moves to that contact
  const FK = await mk('contacts.create', { firstName: 'Matrix', lastName: fixtureName('delete fallback'), email1: 'matrix@example.test' });
  const FT = await mk('tasks.create', { title: fixtureName('delete fallback task'), contactId: FK });
  const FN = await mk('notes.create', { title: fixtureName('delete fallback note'), taskId: FT });
  const fd = await call(bob, 'tasks.delete', { id: FT }); check('a task with only a contact deletes', fd.status === 200 && fd.body.data.done === true, fd.body);
  const fr = await call(bob, 'notes.read', { id: FN }); check('its note now belongs to the contact', fr.status === 200 && fr.body.data.contactId === FK && fr.body.data.taskId === null, { contactId: fr.body?.data?.contactId, taskId: fr.body?.data?.taskId });
  const fdel = await call(bob, 'notes.delete', { id: FN }); check('fallback note cleanup', fdel.status === 200, fdel.body);
  const fkd = await call(bob, 'contacts.delete', { id: FK }); check('fallback contact cleanup', fkd.status === 200 && fkd.body.data.done === true, fkd.body);
  // 12. reparent orphans: a project with no company and no contact cannot give its children away, but cascade works
  const OP = await mk('projects.create', { name: fixtureName('delete orphan project'), description: 'matrix', status: 'STARTED' });
  const OPT = await mk('tasks.create', { title: fixtureName('delete orphan project task'), projectId: OP });
  const rp = await call(bob, 'projects.deleteChildren', { id: OP, strategy: 'reparent' }); check('reparent with nowhere to go is 409 orphans', rp.status === 409 && rp.body.error.reasons.some(r => r.kind === 'orphans'), rp.body);
  const rpt = await call(bob, 'tasks.read', { id: OPT }); check('the task stays in its project after the refused reparent', rpt.status === 200 && rpt.body.data.projectId === OP, rpt.body?.data?.projectId);
  const op = await purgeProject(bob, OP); check('cascade still works for that project', op.kids.status === 200 && op.del.status === 200, { kids: op.kids.body, del: op.del.body });
  const co2del = await call(bob, 'companies.delete', { id: CO2 }); check('company with no references deletes', co2del.status === 200, co2del.body);
});
section('convert', async ({ bob, jane }) => {
  const ref = () => crypto.randomUUID();
  const pj = await call(bob, 'projects.create', { name: fixtureName('convert'), description: 'convert fixture', clientRef: ref() }); check('bob: projects.create', pj.status === 200 && pj.body.data.id, pj.body);
  cleanup.push(() => purgeProject(bob, pj.body.data.id));
  const title = fixtureName('convert note'), body = 'Body of the note to convert';
  const note = await call(bob, 'notes.create', { title, body, projectId: pj.body.data.id, clientRef: ref() }); check('bob: notes.create', note.status === 200 && note.body.data.id, note.body);
  const before = await call(bob, 'notes.read', { id: note.body.data.id });
  check('fresh note offers conversion and has no converted task', before.status === 200 && before.body.data.canConvertToTask === true && before.body.data.convertedTaskId === null, { canConvertToTask: before.body?.data?.canConvertToTask, convertedTaskId: before.body?.data?.convertedTaskId });
  await expectInvalid(bob, 'notes.convertToTask', { id: note.body.data.id }, 'convert without clientRef is 422');
  await expectDenied(jane, 'notes.convertToTask', { id: note.body.data.id, clientRef: ref() }, 'jane cannot convert bob\'s note');
  const stillOpen = await call(bob, 'notes.read', { id: note.body.data.id }); check('denied conversion left the note untouched', stillOpen.body.data.archived === false && stillOpen.body.data.convertedTaskId === null);
  const conv = await call(bob, 'notes.convertToTask', { id: note.body.data.id, clientRef: ref() });
  check('bob converts the note', conv.status === 200 && conv.body.data.ok === true && typeof conv.body.data.id === 'string', conv.body);
  cleanup.push(() => call(bob, 'tasks.delete', { id: conv.body.data.id }));
  cleanup.push(() => call(bob, 'notes.delete', { id: note.body.data.id }));
  const task = await call(bob, 'tasks.read', { id: conv.body.data.id });
  check('the task carries the note title, body and project', task.status === 200 && task.body.data.title === title && task.body.data.body === body && task.body.data.projectId === pj.body.data.id, { title: task.body?.data?.title, body: task.body?.data?.body, projectId: task.body?.data?.projectId });
  const after = await call(bob, 'notes.read', { id: note.body.data.id });
  check('the note is archived and links to the task', after.status === 200 && after.body.data.archived === true && after.body.data.convertedTaskId === conv.body.data.id && after.body.data.canConvertToTask === false, { archived: after.body?.data?.archived, convertedTaskId: after.body?.data?.convertedTaskId });
  const twice = await expectConflict(bob, 'notes.convertToTask', { id: note.body.data.id, clientRef: ref() }, 'converting again is a conflict');
  check('conflict message', twice.body?.error?.message === 'This note was already converted.', twice.body);
  await expectDenied(jane, 'tasks.read', { id: conv.body.data.id }, 'jane cannot read the converted task');
  await expectDenied(bob, 'notes.convertToTask', { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', clientRef: ref() }, 'unknown note is denied');
  const conv0 = conv; check('conversion no longer returns sharedWith', conv0.body.data.sharedWith === undefined, conv0.body);
  // viewer-level access is not enough to convert
  const viewerNote = await call(bob, 'notes.create', { title: fixtureName('convert viewer'), projectId: pj.body.data.id, clientRef: ref() }); check('bob: viewer fixture note', viewerNote.status === 200, viewerNote.body);
  cleanup.push(() => call(bob, 'notes.delete', { id: viewerNote.body.data.id }));
  const who = await call(jane, 'session.current');
  const vg = await call(bob, 'grants.grant', { objectKind: 'note', objectId: viewerNote.body.data.id, userId: who.body.data.id || who.body.data.userId, level: 'viewer', scope: 'self' }); check('bob gives jane viewer access to the note', vg.status === 200, vg.body);
  await expectDenied(jane, 'notes.convertToTask', { id: viewerNote.body.data.id, clientRef: ref() }, 'a viewer cannot convert the note');
  // archived but unconverted
  const arch = await call(bob, 'notes.create', { title: fixtureName('convert archived'), projectId: pj.body.data.id, clientRef: ref() }); check('bob: archived fixture note', arch.status === 200, arch.body);
  cleanup.push(() => call(bob, 'notes.delete', { id: arch.body.data.id }));
  const archived = await call(bob, 'notes.archive', { id: arch.body.data.id }); check('bob archives the note', archived.status === 200, archived.body);
  const refused = await expectConflict(bob, 'notes.convertToTask', { id: arch.body.data.id, clientRef: ref() }, 'an archived note is refused');
  check('archived refusal message', refused.body?.error?.message === 'This note is archived.', refused.body);
  // one level up: a note on a task inherits the task's project
  const parentTask = await call(bob, 'tasks.create', { title: fixtureName('convert parent task'), projectId: pj.body.data.id, clientRef: ref() }); check('bob: parent task', parentTask.status === 200, parentTask.body);
  cleanup.push(() => call(bob, 'tasks.delete', { id: parentTask.body.data.id }));
  const tnote = await call(bob, 'notes.create', { title: fixtureName('convert task note'), taskId: parentTask.body.data.id, clientRef: ref() }); check('bob: note on the task only', tnote.status === 200, tnote.body);
  cleanup.push(() => call(bob, 'notes.delete', { id: tnote.body.data.id }));
  const tconv = await call(bob, 'notes.convertToTask', { id: tnote.body.data.id, clientRef: ref() }); check('a task-only note converts', tconv.status === 200 && typeof tconv.body.data.id === 'string', tconv.body);
  cleanup.push(() => call(bob, 'tasks.delete', { id: tconv.body.data.id }));
  const tread = await call(bob, 'tasks.read', { id: tconv.body.data.id }); check('the new task carries the parent task\'s project', tread.body?.data?.projectId === pj.body.data.id, { projectId: tread.body?.data?.projectId });
  // a note on a call under a project
  const parentCall = await call(bob, 'calls.create', { title: fixtureName('convert parent call'), projectId: pj.body.data.id, clientRef: ref() }); check('bob: parent call', parentCall.status === 200, parentCall.body);
  cleanup.push(() => call(bob, 'calls.delete', { id: parentCall.body.data.id }));
  const cnote = await call(bob, 'notes.create', { title: fixtureName('convert call note'), callId: parentCall.body.data.id, clientRef: ref() }); check('bob: note on the call only', cnote.status === 200, cnote.body);
  cleanup.push(() => call(bob, 'notes.delete', { id: cnote.body.data.id }));
  const cconv = await call(bob, 'notes.convertToTask', { id: cnote.body.data.id, clientRef: ref() }); check('a call-only note converts', cconv.status === 200 && typeof cconv.body.data.id === 'string', cconv.body);
  cleanup.push(() => call(bob, 'tasks.delete', { id: cconv.body.data.id }));
  const cread = await call(bob, 'tasks.read', { id: cconv.body.data.id }); check('the new task carries the call\'s project', cread.body?.data?.projectId === pj.body.data.id, { projectId: cread.body?.data?.projectId });
  // no parent links at all
  const bare = await call(bob, 'tasks.create', { title: fixtureName('convert bare task'), clientRef: ref() }); check('bob: task without links', bare.status === 200, bare.body);
  cleanup.push(() => call(bob, 'tasks.delete', { id: bare.body.data.id }));
  const bnote = await call(bob, 'notes.create', { title: fixtureName('convert bare note'), taskId: bare.body.data.id, clientRef: ref() }); check('bob: note on the bare task', bnote.status === 200, bnote.body);
  cleanup.push(() => call(bob, 'notes.delete', { id: bnote.body.data.id }));
  const nope = await expectConflict(bob, 'notes.convertToTask', { id: bnote.body.data.id, clientRef: ref() }, 'a note with no project, company or contact is refused');
  check('no-parent refusal message', nope.body?.error?.message === 'This note has no project, company or contact to attach the task to.', nope.body);
  const stillThere = await call(bob, 'notes.read', { id: bnote.body.data.id }); check('the refused note stays unarchived', stillThere.body?.data?.archived === false && stillThere.body?.data?.convertedTaskId === null);
});
section('files', async ({ bob, jane }) => {
  // Task 16. note_file rows cannot be created through any route, so the matrix uses baseline attachments (the hourly reset restores them).
  const found = new Map();
  const projects = await call(bob, 'projects.list', { includeClosed: true }); check('bob: projects.list', projects.status === 200, { status: projects.status });
  for (const project of projects.body.data.items) {
    const t = await call(bob, 'projects.timeline', { id: project.id, kind: 'files', includeClosed: true });
    if (t.status === 200) for (const e of t.body.data.entries) if (e.kind === 'file') found.set(e.id, e);
  }
  check('bob sees baseline attachments in project timelines', found.size > 0, { count: found.size });
  const reads = []; for (const id of found.keys()) { const b = await call(bob, 'files.read', { id }); const j = await call(jane, 'files.read', { id }); reads.push({ id, b, j }); }
  const A = reads.find(r => r.b.status === 200 && r.j.status === 404 && r.b.body.data.permissions.delete) || reads.find(r => r.b.status === 200 && r.j.status === 404);
  check('a baseline attachment bob can read and jane cannot exists', !!A, { ids: reads.map(r => [r.id.slice(0, 8), r.b.status, r.j.status]) });
  const d = A.b.body.data;
  check('bob: files.read 200 with filename, numeric byteSize and permissions', typeof d.originalFilename === 'string' && d.originalFilename.length > 0 && typeof d.byteSize === 'number' && d.permissions.read === true && typeof d.permissions.write === 'boolean' && typeof d.permissions.delete === 'boolean' && d.permissions.share === d.permissions.delete && d.id === A.id, { id: A.id, originalFilename: d.originalFilename, byteSize: d.byteSize, contentType: d.contentType, uploaderName: d.uploaderName, note: d.note, permissions: d.permissions });
  check('files.read carries parent ids and note title', 'projectId' in d && 'companyId' in d && 'contactId' in d && 'taskId' in d && 'callId' in d && (d.note === null || (typeof d.note.id === 'string' && typeof d.note.title === 'string')), { projectId: d.projectId, note: d.note });
  await expectDenied(jane, 'files.read', { id: A.id }, 'jane: files.read of bob\'s attachment is DENIED');
  await expectDenied(bob, 'files.read', { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, 'files.read unknown id is DENIED');
  await expectInvalid(bob, 'files.read', { id: 'nope' }, 'files.read rejects a bad id');
  await expectInvalid(bob, 'files.delete', { id: 'nope' }, 'files.delete rejects a bad id');
  await expectInvalid(bob, 'files.delete', { id: A.id, dryRun: true }, 'files.delete rejects dryRun');
  await expectDenied(jane, 'files.delete', { id: A.id }, 'jane: files.delete of bob\'s attachment is DENIED');
  await expectDenied(bob, 'files.delete', { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, 'files.delete unknown id is DENIED');
  const still = await call(bob, 'files.read', { id: A.id }); check('the attachment survives the refused deletes', still.status === 200, { status: still.status });
  const del = await call(bob, 'files.delete', { id: A.id }); check('bob: files.delete 200 {ok:true}', del.status === 200 && del.body?.data?.ok === true, { id: A.id, filename: d.originalFilename, status: del.status, body: del.body });
  await expectDenied(bob, 'files.read', { id: A.id }, 'files.read is 404 for bob after the delete (baseline row ' + A.id + '; the hourly reset restores it)');
});
section('filters', async ({ bob }) => {
  const ref = () => crypto.randomUUID();
  const list = async (name, input) => { const r = await call(bob, name, input); check(`${name} ${JSON.stringify(input)}`, r.status === 200 && Array.isArray(r.body?.data?.items), { status: r.status, total: r.body?.data?.total }); return r.body.data; };
  const everything = async (name, input) => { const out = []; for (let cursor = 0; cursor < 200; cursor += 25) { const page = await list(name, { ...input, cursor }); out.push(...page.items); if (!page.nextCursor) break; } return out; };
  // Fixtures: a project ON_SCHEDULE (so the status filter is proven on a known row) with one task inside and one outside the date range.
  const project = await call(bob, 'projects.create', { name: fixtureName('filters'), description: 'matrix', status: 'ON_SCHEDULE', clientRef: ref() }); check('fixture project created', project.status === 200 && project.body?.data?.id, project.body);
  const pid = project.body.data.id; cleanup.push(() => purgeProject(bob, pid));
  const inside = await call(bob, 'tasks.create', { title: fixtureName('filters in'), projectId: pid, startAt: '2026-06-30T23:30:00.000Z', billable: true, clientRef: ref() });
  const outside = await call(bob, 'tasks.create', { title: fixtureName('filters out'), projectId: pid, startAt: '2025-03-01T09:00:00.000Z', billable: true, clientRef: ref() });
  check('fixture tasks created', inside.status === 200 && outside.status === 200 && inside.body?.data?.id && outside.body?.data?.id, { inside: inside.body, outside: outside.body });
  const billable = await everything('tasks.list', { billable: true, includeClosed: true });
  check('tasks.list billable: every item billable, fixtures present', billable.length > 0 && billable.every(i => i.billable === true) && billable.some(i => i.id === inside.body.data.id), { items: billable.length });
  await expectInvalid(bob, 'tasks.list', { sort: 'secret' }, 'tasks.list sort secret is 422');
  await expectInvalid(bob, 'tasks.list', { status: 'ON_SCHEDULE' }, 'tasks.list another list filter is 422');
  const from = '2026-01-01', to = '2026-06-30';
  const ranged = await everything('tasks.list', { from, to, includeClosed: true }); const lo = Date.parse(from + 'T00:00:00Z'), hi = Date.parse(to + 'T00:00:00Z') + 86400000;
  check('tasks.list from/to: every item startAt within [from, end of to]', ranged.length > 0 && ranged.every(i => { const t = Date.parse(i.startAt); return t >= lo && t < hi; }), { items: ranged.length, outOfRange: ranged.filter(i => !(Date.parse(i.startAt) >= lo && Date.parse(i.startAt) < hi)).map(i => i.startAt) });
  check('tasks.list from/to: in-range fixture (late on the last day) present, out-of-range fixture absent', ranged.some(i => i.id === inside.body.data.id) && !ranged.some(i => i.id === outside.body.data.id), {});
  const all = await everything('projects.list', { includeClosed: true });
  const status = 'ON_SCHEDULE';
  const byStatus = await everything('projects.list', { status, includeClosed: true });
  check(`projects.list status ${status}: non-empty, every item has it, fixture present`, byStatus.length > 0 && byStatus.every(i => i.status === status) && byStatus.some(i => i.id === pid), { items: byStatus.length, of: all.length });
  check('projects.list status: rows with another status exist and are excluded', all.some(i => i.status !== status) ? !byStatus.some(i => i.status !== status) : true, { statuses: [...new Set(all.map(i => i.status))] });
  const notes = await list('notes.list', { parentKind: 'project' }); check('notes.list parentKind project: every item has a projectId', notes.items.every(i => !!i.projectId), { items: notes.items.length });
  const companies = await everything('companies.list', { sort: 'city' });
  const firstNull = companies.findIndex(c => !c.city);
  check('companies.list sort city: ascending over non-null cities, null cities last', companies.slice(0, firstNull < 0 ? undefined : firstNull).every((c, i, a) => c.city && (i === 0 || a[i - 1].city.toLowerCase() <= c.city.toLowerCase())) && (firstNull < 0 || companies.slice(firstNull).every(c => !c.city)), { cities: companies.map(c => c.city) });
  const allContacts = await everything('contacts.list', {});
  const company = companies.find(c => c.contacts > 0 && allContacts.some(k => k.companyNames.includes(c.name)));
  check('a company with contacts exists', !!company, {});
  const expected = allContacts.filter(k => k.companyNames.includes(company.name)).map(k => k.id).sort();
  const filtered = await everything('contacts.list', { companyId: company.id });
  check('contacts.list companyId: subset of unfiltered rows whose companyNames include the company, non-empty', filtered.length > 0 && filtered.every(k => allContacts.some(a => a.id === k.id) && k.companyNames.includes(company.name)) && JSON.stringify(filtered.map(k => k.id).sort()) === JSON.stringify(expected), { filtered: filtered.length, expected: expected.length });
  await list('contacts.list', { sort: 'firstName' });
});

// Task 18: account services. Self-service password change is withdrawn (deviation H-1); the matrix never changes a demo password.
section('account', async ({ bob, jane }) => {
  const email = 'jane@workgetsdone.test';
  const anon = await call(null, 'account.read'); check('anonymous account.read is refused with no data (404 like every private service; session.current is the public 401)', anon.status === 404 && !anon.body?.data, { status: anon.status });
  const me = await call(jane, 'account.read');
  check('jane account.read: 200 with her email and the profile shape', me.status === 200 && me.body?.data?.email === email && typeof me.body.data.id === 'string' && 'displayName' in me.body.data && 'userName' in me.body.data && typeof me.body.data.timezone === 'string' && me.body.data.isAdmin === false && 'lastLogin' in me.body.data && !('password' in me.body.data), { status: me.status, keys: Object.keys(me.body?.data || {}) });
  const before = me.body.data; const profile = { displayName: before.displayName, timezone: before.timezone, ...(before.userName ? { userName: before.userName } : {}) };
  const set = await call(jane, 'account.update', { ...profile, displayName: 'WGD-MATRIX Jane' });
  check('jane account.update display name', set.status === 200 && set.body?.data?.ok === true, { status: set.status, body: set.body });
  cleanup.push(async () => { await call(jane, 'account.update', profile); });
  const changed = await call(jane, 'account.read'); check('account.read shows the new display name', changed.body?.data?.displayName === 'WGD-MATRIX Jane', { got: changed.body?.data?.displayName });
  const zone = await call(jane, 'account.update', { ...profile, timezone: 'America/Chicago' }); const zoneRead = await call(jane, 'account.read');
  check('time zone change is stored', zone.status === 200 && zoneRead.body?.data?.timezone === 'America/Chicago', { status: zone.status, zone: zoneRead.body?.data?.timezone });
  const back = await call(jane, 'account.update', profile); const backRead = await call(jane, 'account.read');
  check('profile restored', back.status === 200 && backRead.body?.data?.displayName === before.displayName && backRead.body?.data?.timezone === before.timezone, { name: backRead.body?.data?.displayName });
  const withEmail = await expectInvalid(jane, 'account.update', { ...profile, email: 'other@example.com' }, 'account.update with email is 422');
  check('the email key is named in the 422', withEmail.body?.error?.fields?.includes('email'), withEmail.body);
  await expectInvalid(jane, 'account.update', { ...profile, isAdmin: true }, 'account.update with isAdmin is 422');
  await expectInvalid(jane, 'account.update', { ...profile, password: 'x'.repeat(14) }, 'account.update with password is 422');
  await expectInvalid(jane, 'account.update', { ...profile, timezone: 'Mars/Olympus_Mons' }, 'account.update with an unknown time zone is 422');
  await expectInvalid(jane, 'account.update', { ...profile, displayName: '' }, 'account.update with an empty display name is 422');
  const stillMe = await call(jane, 'account.read'); check('the rejected updates changed nothing', stillMe.body?.data?.email === email && stillMe.body?.data?.timezone === before.timezone && stillMe.body?.data?.displayName === before.displayName, {});
  await expectInvalid(jane, 'account.changePassword', { newPassword: 'short' }, 'changePassword shorter than 12 is 422');
  await expectInvalid(jane, 'account.changePassword', { newPassword: 'x'.repeat(129) }, 'changePassword longer than 128 is 422');
  const withdrawn = await call(jane, 'account.changePassword', { newPassword: 'x'.repeat(16) });
  check('account.changePassword answers 503 while withdrawn', withdrawn.status === 503 && !withdrawn.body?.data, { status: withdrawn.status });
  const alive = await call(jane, 'session.current'); check('the withdrawn service did not end jane\'s session', alive.status === 200, { status: alive.status });
});

// Task 19: administrator user management. users.create is the authenticated form (deviation H-2); the password is random, held only in memory and never logged.
section('admin', async ({ bob, jane }) => {
  const FORM = '2b149237-3d50-407d-a6b7-e87978ac59e0'; const stamp = Date.now();
  await expectDenied(jane, 'users.list', {}, 'jane users.list is 404 DENIED');
  await expectDenied(jane, 'users.update', { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', displayName: 'x', timezone: 'UTC', isActive: false }, 'jane users.update is 404 DENIED');
  const anon = await call(null, 'users.list'); check('anonymous users.list refused with no data', anon.status === 404 && !anon.body?.data, { status: anon.status });
  const list = await call(bob, 'users.list'); const users = list.body?.data?.users || [];
  const bobRow = users.find(u => u.email === 'bob@workgetsdone.test'), janeRow = users.find(u => u.email === 'jane@workgetsdone.test');
  check('bob users.list: 200, bob isAdmin true, jane isAdmin false, no credential', list.status === 200 && bobRow?.isAdmin === true && janeRow?.isAdmin === false && !JSON.stringify(list.body).includes('password') && typeof bobRow.timezone === 'string', { status: list.status, count: users.length, keys: Object.keys(bobRow || {}) });
  const meBob = await call(bob, 'account.read'), meJane = await call(jane, 'account.read'); check('account.read isAdmin follows the roster: bob true, jane false', meBob.body?.data?.isAdmin === true && meJane.body?.data?.isAdmin === false, { bob: meBob.body?.data?.isAdmin, jane: meJane.body?.data?.isAdmin });
  const email = `wgd-matrix-user-${stamp}@example.test`, displayName = `WGD-MATRIX user ${stamp}`;
  const password = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const refused = await W.submitForm(jane, FORM, { email: `wgd-matrix-nope-${stamp}@example.test`, password, display_name: 'WGD-MATRIX nope', user_name: `nope${stamp}` });
  check('jane (not an administrator) is refused by the form pre_save rule', refused.status >= 400, { status: refused.status });
  const created = await W.submitForm(bob, FORM, { email, password, display_name: displayName, user_name: `matrix${stamp}`, timezone: 'America/Chicago' });
  check('bob creates a user through the authenticated form', created.status >= 200 && created.status < 300, { status: created.status });
  const after = (await call(bob, 'users.list')).body?.data?.users || []; const row = after.find(u => u.email === email);
  check('the new user is listed, active, not an administrator', !!row && row.isActive === true && row.isAdmin === false && row.displayName === displayName, { found: !!row, isActive: row?.isActive, isAdmin: row?.isAdmin });
  const id = row.id;
  const off = await call(bob, 'users.update', { id, displayName, timezone: 'America/Chicago', isActive: false });
  check('users.update deactivates', off.status === 200 && off.body?.data?.ok === true, { status: off.status, body: off.body });
  const read1 = (await call(bob, 'users.list')).body.data.users.find(u => u.id === id); check('the next list shows isActive false', read1?.isActive === false, { isActive: read1?.isActive });
  const on = await call(bob, 'users.update', { id, displayName, timezone: 'America/Chicago', isActive: true }); check('users.update reactivates', on.status === 200, { status: on.status });
  const read2 = (await call(bob, 'users.list')).body.data.users.find(u => u.id === id); check('the next list shows isActive true', read2?.isActive === true, { isActive: read2?.isActive });
  const rename = await call(bob, 'users.update', { id, displayName: displayName + ' b', timezone: 'UTC', isActive: true }); const read3 = (await call(bob, 'users.list')).body.data.users.find(u => u.id === id);
  check('users.update changes display name and time zone', rename.status === 200 && read3?.displayName === displayName + ' b' && read3?.timezone === 'UTC', { status: rename.status });
  const keep = { id, displayName, timezone: 'UTC', isActive: true };
  for (const extra of [{ isAdmin: true }, { password: 'x'.repeat(14) }, { email: 'other@example.test' }]) await expectInvalid(bob, 'users.update', { ...keep, ...extra }, `users.update with ${Object.keys(extra)[0]} is 422`);
  await expectDenied(bob, 'users.update', { ...keep, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }, 'users.update unknown id is 404 DENIED');
  const self = await call(bob, 'users.update', { id: bobRow.id, displayName: bobRow.displayName, timezone: bobRow.timezone, isActive: false });
  check('bob deactivating bob is 422 with the stated message', self.status === 422 && self.body?.error?.message === 'You cannot deactivate your own account.', { status: self.status, body: self.body });
  const upperSelf = await call(bob, 'users.update', { id: bobRow.id.toUpperCase(), displayName: bobRow.displayName, timezone: bobRow.timezone, isActive: false });
  check('bob deactivating himself with an uppercased id is 422 and refused', upperSelf.status === 422 && upperSelf.body?.error?.message === 'You cannot deactivate your own account.', { status: upperSelf.status });
  const bobStill = (await call(bob, 'users.list')).body.data.users.find(u => u.id === bobRow.id); check('bob is still active', bobStill?.isActive === true, {});
  const afterAll = (await call(bob, 'users.list')).body.data.users.find(u => u.id === bobRow.id); check('bob display name and zone untouched', afterAll.displayName === bobRow.displayName && afterAll.timezone === bobRow.timezone, {});
  // Task 21 (FED-03): bob links jane to a fake Google subject, then unlinks. Jane's other fields are sent unchanged.
  const janeKeep = { id: janeRow.id, displayName: janeRow.displayName, timezone: janeRow.timezone, isActive: janeRow.isActive }; const sub = `WGD-MATRIX-sub-${stamp}`;
  try {
    await expectInvalid(bob, 'users.update', { ...janeKeep, oauthSubject: sub }, 'users.update with oauthSubject but no provider is 422');
    await expectInvalid(bob, 'users.update', { ...janeKeep, oauthProvider: 'google' }, 'users.update with oauthProvider but no subject is 422');
    await expectInvalid(bob, 'users.update', { ...janeKeep, oauthProvider: 'github', oauthSubject: sub }, 'users.update with an unknown provider is 422');
    const notLinked = (await call(bob, 'users.list')).body.data.users.find(u => u.id === janeRow.id); check('before linking, jane has no provider', !notLinked.oauthProvider, { oauthProvider: notLinked.oauthProvider });
    const plain = await call(bob, 'users.update', { ...janeKeep }); const stillNone = (await call(bob, 'users.list')).body.data.users.find(u => u.id === janeRow.id);
    check('an update without the oauth keys leaves the link as it is', plain.status === 200 && !stillNone.oauthProvider, { status: plain.status });
    const link = await call(bob, 'users.update', { ...janeKeep, oauthProvider: 'google', oauthSubject: sub }); const linked = (await call(bob, 'users.list')).body.data.users.find(u => u.id === janeRow.id);
    check('bob links jane with provider google and a fake subject', link.status === 200 && linked.oauthProvider === 'google' && linked.displayName === janeRow.displayName && linked.isActive === janeRow.isActive, { status: link.status, oauthProvider: linked.oauthProvider });
    check('jane account.read now reports provider google', (await call(jane, 'account.read')).body?.data?.oauthProvider === 'google', {});
    const keepLink = await call(bob, 'users.update', { ...janeKeep }); const stillLinked = (await call(bob, 'users.list')).body.data.users.find(u => u.id === janeRow.id);
    check('an update without the oauth keys keeps the link', keepLink.status === 200 && stillLinked.oauthProvider === 'google', { status: keepLink.status });
    await expectDenied(jane, 'users.update', { ...janeKeep, oauthProvider: null, oauthSubject: null }, 'jane cannot unlink or link herself: users.update is 404 DENIED');
  } finally {
    const unlink = await call(bob, 'users.update', { ...janeKeep, oauthProvider: null, oauthSubject: null }); const gone = (await call(bob, 'users.list')).body.data.users.find(u => u.id === janeRow.id);
    check('bob unlinks jane (both null)', unlink.status === 200 && !gone.oauthProvider, { status: unlink.status, oauthProvider: gone.oauthProvider });
    check('jane account.read reports no provider again', !(await call(jane, 'account.read')).body?.data?.oauthProvider, {});
  }
  const fin = await call(bob, 'users.update', { id, displayName: displayName + ' (test)', timezone: 'UTC', isActive: false }); check('the test user is left deactivated', fin.status === 200, { status: fin.status });
  const end = (await call(bob, 'users.list')).body.data.users.find(u => u.id === id); check('final list shows the test user inactive', end?.isActive === false, { isActive: end?.isActive });
});

// Task 20: attachment upload through the authenticated form route (deviation I-1).
const ATTACH_FORM = 'ebb0f9b0-8bc0-4613-b8b2-ed24b152d21f';
async function upload(actor, noteId, bytes, { name = 'x.txt', type = 'text/plain', size = bytes.length, extra = {} } = {}) {
  const fd = new FormData(); fd.append('payload', JSON.stringify({ data: { note: noteId, original_filename: name, content_type: type, byte_size: size, ...extra } })); fd.append('file.blob', new Blob([bytes], { type }), name);
  const res = await fetch(`${W.BASE}/api/v1/public/app/workgetsdone/forms/${ATTACH_FORM}/submit`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: Object.entries(actor?.jar || {}).map(([k, v]) => `${k}=${v}`).join('; ') }, body: fd });
  return { status: res.status, body: await res.json().catch(() => null) };
}
section('attachments', async ({ bob, jane }) => {
  const ref = () => crypto.randomUUID();
  const mk = async (name, input) => { const r = await call(bob, name, { ...input, clientRef: ref() }); check(`bob: ${name} fixture`, r.status === 200 && r.body.data.id, r.body); return r.body.data.id; };
  const P = await mk('projects.create', { name: fixtureName('attachments'), description: 'matrix', status: 'STARTED' });
  cleanup.push(() => purgeProject(bob, P));
  const N = await mk('notes.create', { title: fixtureName('attachments note'), projectId: P });
  const before = (await call(bob, 'notes.read', { id: N })).body.data;
  check('fresh note has no attachments', before.attachments.length === 0 && before.attachmentCount === 0, before.attachments);
  const ok = await upload(bob, N, Buffer.from('abc'));
  check('bob uploads 3 bytes to his note: 201 with a record id', ok.status === 201 && ok.body?.record_id && ok.body.success === true, ok);
  const fr = await call(bob, 'files.read', { id: ok.body.record_id });
  check('files.read returns byteSize 3, text/plain, the filename and the note', fr.status === 200 && fr.body.data.byteSize === 3 && fr.body.data.contentType === 'text/plain' && fr.body.data.originalFilename === 'x.txt' && fr.body.data.note?.id === N && typeof fr.body.data.checksum === 'string', fr.body);
  const after = (await call(bob, 'notes.read', { id: N })).body.data;
  check('notes.read lists the attachment with byteSize 3', after.attachments.length === 1 && after.attachments[0].id === ok.body.record_id && after.attachments[0].byteSize === 3 && after.attachmentCount === 1, after.attachments);
  const clientKey = await upload(bob, N, Buffer.from('abc'), { extra: { storage_key: 'client-chosen-key' } });
  check('a client storage_key is refused (not on the form)', clientKey.status === 422, clientKey);
  const count = async () => (await call(bob, 'notes.read', { id: N })).body.data.attachments.length;
  check('the upload response blob id is the file id the checksum carries', ok.body.record.data.blob === fr.body.data.checksum, { blob: ok.body.record.data.blob, checksum: fr.body.data.checksum });
  const nameResults = [];
  for (const name of ['a:b.txt', 'report..txt', 'a\\b.txt']) {
    const bad = await upload(bob, N, Buffer.from('abc'), { name });
    nameResults.push({ name, status: bad.status, body: bad.body, rule: bad.status === 422 && /path separator, \.\. or a drive letter/.test(JSON.stringify(bad.body)), waf: bad.status === 403 && bad.body === null });
  }
  check('every unsafe display name is refused (rule 422 or WAF 403) and no row exists', nameResults.every(r => r.rule || r.waf) && (await count()) === 1, nameResults);
  check('at least one unsafe display name reaches the display-name rule (422 with its message)', nameResults.some(r => r.rule), nameResults);
  const claimed = await upload(bob, N, Buffer.from('abc'), { size: 26214401, name: 'claimed.txt' });
  check('a small file claiming byte_size 26214401 is refused by the oversize rule (422) and creates no row', claimed.status === 422 && /25 MB/.test(JSON.stringify(claimed.body)) && (await count()) === 1, { status: claimed.status, body: claimed.body });
  const edgeBytes = Buffer.alloc(25 * 1024 * 1024 - 1024, 98);
  const nearCap = await upload(bob, N, edgeBytes, { name: 'near-cap.bin', type: 'application/octet-stream' });
  const nearCount = await count();
  check('a truthful 25 MB minus 1 KB file either succeeds (row exists) or is refused with no row', nearCap.status === 201 ? nearCount === 2 : nearCap.status >= 400 && nearCap.status < 500 && nearCount === 1, { status: nearCap.status, body: nearCap.body && nearCap.body.detail, count: nearCount, outcome: nearCap.status === 201 ? 'accepted' : 'refused' });
  if (nearCap.status === 201) { const d = await call(bob, 'files.delete', { id: nearCap.body.record_id }); check('near-cap attachment deleted', d.status === 200, d.body); }
  const twelve = await upload(bob, N, Buffer.alloc(12 * 1024 * 1024, 99), { name: 'twelve.bin', type: 'application/octet-stream' });
  check('a truthful 12 MB file is accepted (client limit), row exists with byteSize 12582912', twelve.status === 201 && (await call(bob, 'files.read', { id: twelve.body.record_id })).body?.data?.byteSize === 12582912, { status: twelve.status });
  if (twelve.status === 201) await call(bob, 'files.delete', { id: twelve.body.record_id });
  const fd = new FormData(); fd.append('payload', JSON.stringify({ data: { original_filename: 'nonote.txt', content_type: 'text/plain', byte_size: 3 } })); fd.append('file.blob', new Blob(['abc'], { type: 'text/plain' }), 'nonote.txt');
  const noNote = await fetch(`${W.BASE}/api/v1/public/app/workgetsdone/forms/${ATTACH_FORM}/submit`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: Object.entries(bob.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: fd });
  const noNoteBody = await noNote.json().catch(() => null);
  check('an upload without a note is refused (4xx) and creates no row', noNote.status >= 400 && noNote.status < 500 && (await count()) === 1, { status: noNote.status, body: noNoteBody });
  const janeTry = await upload(jane, N, Buffer.from('abc'), { name: 'jane.txt' });
  const afterJane = (await call(bob, 'notes.read', { id: N })).body.data;
  check('jane uploading to bob\'s note is refused and creates no visible row', janeTry.status >= 400 && janeTry.status < 500 && afterJane.attachments.length === 1, { janeTry, count: afterJane.attachments.length });
  const big = Buffer.alloc(26 * 1024 * 1024, 97);
  const over = await upload(bob, N, big, { name: 'big.bin', type: 'application/octet-stream' });
  const afterBig = (await call(bob, 'notes.read', { id: N })).body.data;
  check('a real 26 MB file is refused by the edge cap (413) and creates no row', over.status === 413 && afterBig.attachments.length === 1, { status: over.status, body: over.body, count: afterBig.attachments.length });
  const anon = await upload(null, N, Buffer.from('abc'));
  check('anonymous upload is refused', anon.status === 401 || anon.status === 403 || anon.status === 404, anon);
  const del = await call(bob, 'files.delete', { id: ok.body.record_id }); check('bob deletes the uploaded attachment', del.status === 200, del.body);
});

// Later tasks append `section(...)` registrations above this line.
if (process.argv[1].endsWith('verify-full.mjs')) await main(process.argv.slice(2).length ? process.argv.slice(2) : ['smoke']);
