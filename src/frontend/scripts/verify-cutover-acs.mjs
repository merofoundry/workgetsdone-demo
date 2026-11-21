import './stage-guard.mjs';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { actor, call } from './verify-full.mjs';
// AC-34 to AC-37 re-check against the stage site as bob (one fresh login, so cookie flags can be read from Set-Cookie).
const require = createRequire(import.meta.url), W = require('../../verification/harness/wgd.js');
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root); mkdirSync(evidence, { recursive: true });
const registry = JSON.parse(readFileSync(new URL('frontend/public/services.json', root), 'utf8')).services;
const TASK_MODEL = 'dda81674-76dc-4790-b885-ac8b5d691068';
const checks = [];
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, evidence: detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); if (!passed) throw new Error(name); };
const envValue = (file, key) => { const line = readFileSync(new URL(file, root), 'utf8').split('\n').find(l => l.startsWith(key + '=')); if (!line) throw new Error(`${key} missing in ${file}`); return line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim(); };
let failure;
try {
  // Fresh bob login, keeping the raw Set-Cookie headers.
  const login = await fetch(`${W.BASE}/api/v1/models/42069a61-6c5c-4a70-8f44-5c9ead67c867/records?application_id=${W.APP}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ data: { email: 'bob@workgetsdone.test', password: envValue('.env-bob', 'BOB_PASSWORD') } }) });
  check('bob logs in', login.status === 200, { status: login.status });
  const raw = login.headers.getSetCookie();
  const jar = {}; for (const c of raw) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
  const bob = { jar };
  const cookieHeader = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  // (a) generic record route with cookies
  const listUrl = `${W.BASE}/api/v1/public/apps/${W.APP}/models/${TASK_MODEL}/records`;
  const a = await fetch(listUrl, { headers: { Cookie: cookieHeader, 'X-Requested-With': 'XMLHttpRequest' } });
  check('AC-34 (a): generic record route with bob cookies is 404', a.status === 404, { status: a.status });
  // (b) same with the API key (status only)
  const b = await fetch(listUrl, { headers: { 'X-API-Key': envValue('.env-api-key', 'API_KEY') } });
  check('AC-35 (b): generic record route with the API key is refused (404/403)', [404, 403].includes(b.status), { status: b.status });
  // (c) cookies
  const sessionCookies = raw.map(c => { const parts = c.split(';').map(s => s.trim()); const [name] = parts[0].split('='); return { name, httpOnly: parts.some(p => /^httponly$/i.test(p)), secure: parts.some(p => /^secure$/i.test(p)), sameSite: (parts.find(p => /^samesite=/i.test(p)) || '').split('=')[1] }; });
  const named = sessionCookies.filter(c => /^__Host-mf_app_(access|refresh)$/.test(c.name));
  check('AC-36 (c): both session cookies are __Host- prefixed, HttpOnly, Secure', named.length === 2 && named.every(c => c.httpOnly && c.secure), { cookies: sessionCookies });
  // (d) POST without X-Requested-With
  const d = await fetch(`${W.BASE}/api/v1/services/${registry['tasks.list']}/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader }, body: '{}' });
  const dText = await d.text(); let dBody = null; try { dBody = JSON.parse(dText); } catch {}
  check('AC-37 (d): inbound POST without X-Requested-With is rejected, no data', d.status !== 200 && !(dBody && dBody.data), { status: d.status });
  const dOk = await call(bob, 'tasks.list', {});
  check('(d) control: same call with X-Requested-With succeeds', dOk.status === 200, { status: dOk.status });
  // (e) refusal bodies byte-identical
  const jane = await actor('jane');
  const bobList = await call(bob, 'companies.list', {}), janeList = await call(jane, 'companies.list', {});
  const bobOnly = bobList.body.data.items.find(r => !janeList.body.data.items.some(o => o.id === r.id));
  check('(e) a bob-only company exists', !!bobOnly, {});
  const denied = await fetch(`${W.BASE}/api/v1/services/${registry['companies.read']}/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Cookie: Object.entries(jane.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify({ id: bobOnly.id }) });
  const unknown = await fetch(`${W.BASE}/api/v1/services/${registry['companies.read']}/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Cookie: Object.entries(jane.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }) });
  const deniedText = await denied.text(), unknownText = await unknown.text();
  check('AC-37 (e): refusal for a bob-only id is byte-identical to the unknown id', denied.status === 404 && unknown.status === 404 && deniedText === unknownText, { deniedStatus: denied.status, unknownStatus: unknown.status, body: deniedText });
} catch (error) { failure = error.message; console.error(failure); }
finally {
  writeFileSync(new URL('cutover-acs-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base: W.BASE, checks, failure: failure || null }, null, 2) + '\n');
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — AC-34 to AC-37 re-check on stage\n\n${checks.filter(c => c.passed).length}/${checks.length} checks passed against ${W.BASE}. Evidence: verification/2026-10-11-full-build/cutover-acs-results.json.\n${failure ? `FAILED: ${failure}\n` : ''}`);
}
if (failure) process.exit(1);
