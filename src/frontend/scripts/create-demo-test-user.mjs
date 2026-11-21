import './stage-guard.mjs';
// Creates the one deactivated demo user the UI-17 proof expects on bob's /admin/users
// ("Edit WGD-MATRIX user # (test)" / "Reactivate WGD-MATRIX user # (test)"). Approved by Rob 2026-10-11.
// Run through verification/harness/run.sh:
//   WGD_BASE=https://workgetsdone.staging.merofoundry.app bash verification/harness/run.sh /repo/frontend/scripts/create-demo-test-user.mjs 1
// Credentials are read at run time; the new user's password is random and discarded. Idempotent: an existing
// user with the same email is only deactivated. Prints the user's id, display name and flags, nothing secret.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), W = require('../../verification/harness/wgd.js');
const root = new URL('../../', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('frontend/public/services.json', root), 'utf8')).services;
const FORM = '2b149237-3d50-407d-a6b7-e87978ac59e0';
const call = async (s, name, input) => {
  const r = await fetch(`${W.BASE}/api/v1/services/${registry[name]}/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Cookie: Object.entries(s.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(input) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const path = new URL('verification/harness/.session-bob.json', root); let bob;
try { const cached = JSON.parse(readFileSync(path, 'utf8')); if ((await call(cached, 'session.current')).status === 200) bob = cached; } catch {}
if (!bob) {
  const line = readFileSync(new URL('.env-bob', root), 'utf8').split('\n').find(s => s.startsWith('BOB_PASSWORD='));
  bob = await W.login('bob@workgetsdone.test', line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim());
  writeFileSync(path, JSON.stringify(bob), { mode: 0o600 });
}
const n = process.argv[2] || '1', displayName = `WGD-MATRIX user ${n} (test)`, email = `wgd-matrix-user-${n}@example.test`;
let users = (await call(bob, 'users.list')).body?.data?.users || [];
let row = users.find(u => u.email === email);
if (!row) {
  const password = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const created = await W.submitForm(bob, FORM, { email, password, display_name: displayName, user_name: `matrixdemo${n}`, timezone: 'UTC' });
  if (created.status < 200 || created.status >= 300) { console.error('create failed', created.status); process.exit(1); }
  users = (await call(bob, 'users.list')).body?.data?.users || []; row = users.find(u => u.email === email);
}
if (!row) { console.error('user not listed after creation'); process.exit(1); }
if (row.isActive) {
  const off = await call(bob, 'users.update', { id: row.id, displayName, timezone: 'UTC', isActive: false });
  if (off.status !== 200) { console.error('deactivate failed', off.status, JSON.stringify(off.body)); process.exit(1); }
}
const final = (await call(bob, 'users.list')).body.data.users.find(u => u.id === row.id);
console.log(JSON.stringify({ id: final.id, displayName: final.displayName, isActive: final.isActive, isAdmin: final.isAdmin, users: users.length }));
