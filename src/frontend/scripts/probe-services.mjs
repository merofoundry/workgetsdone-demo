import { readFileSync, writeFileSync, mkdirSync, appendFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../../verification/harness/wgd.js');
const root = new URL('../../', import.meta.url);
const recovery = process.argv.includes('--recovery');
const journal = JSON.parse(readFileSync('/tmp/wgd-frontend-journal.json', 'utf8'));
const services = { 'session.current': '54a9f902-ddf5-439f-9a94-910e594e0bf6', ...Object.fromEntries(Object.entries(recovery ? {} : journal).filter(([key, value]) => key.startsWith('service.') && value.ok).map(([key, value]) => [key.slice(8), value.data.id])) };
const secrets = file => Object.fromEntries(readFileSync(new URL(file, root), 'utf8').split('\n').filter(line => line.includes('=')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/g, '')]; }));
async function call(actor, name, body = {}) {
  const response = await fetch(`${W.BASE}/api/v1/services/${services[name]}/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(actor ? { Cookie: Object.entries(actor.jar).map(([key, value]) => `${key}=${value}`).join('; ') } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function actor(name) {
  const path = `/tmp/wgd-byof-${name}.session.json`;
  try { const cached = JSON.parse(readFileSync(path, 'utf8')); if ((await call(cached, 'session.current')).status === 200) return cached; } catch {}
  const password = secrets(`.env-${name}`)[`${name.toUpperCase()}_PASSWORD`];
  const session = await W.login(`${name}@workgetsdone.test`, password);
  writeFileSync(path, JSON.stringify(session), { mode: 0o600 });
  return session;
}
const checks = [];
const check = (name, pass, evidence) => { checks.push({ name, pass: !!pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(evidence)}`); };
for (const name of ['bob', 'jane']) {
  const session = await actor(name);
  const current = await call(session, 'session.current');
  check(`${name}: current session`, current.status === 200 && current.body?.data?.id === session.recordId, { status: current.status, keys: Object.keys(current.body?.data || {}) });
  if (services['dashboard.stats']) {
    const stats = await call(session, 'dashboard.stats');
    check(`${name}: dashboard stats`, stats.status === 200 && typeof stats.body?.data?.openTasks === 'number', stats);
  }
  for (const serviceName of ['dashboard.agenda', 'dashboard.rollup', 'search']) if (services[serviceName]) {
    const result = await call(session, serviceName, serviceName === 'search' ? { query: 'WGD', limit: 8 } : {});
    check(`${name}: ${serviceName}`, result.status === 200 && !!result.body?.data, { status: result.status, keys: Object.keys(result.body?.data || {}) });
  }
}
if (recovery) {
  const response = await fetch(`${W.BASE}/api/v1/services/adb88a4a-48a8-456c-92a0-3d6247952e44/inbound`, { redirect: 'manual' });
  const location = response.headers.get('location');
  const origin = location ? new URL(location, W.BASE).origin : null;
  check('existing Google start still redirects', [302, 303, 307].includes(response.status) && origin === 'https://accounts.google.com', { status: response.status, origin });
  const session = await actor('bob');
  const logout = await fetch(`${W.BASE}/api/v1/models/89063610-1c8a-457f-a7e7-8d6bd0d63c47/records?application_id=${W.APP}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Cookie: Object.entries(session.jar).map(([key, value]) => `${key}=${value}`).join('; ') }, body: JSON.stringify({ data: {} }) });
  check('native logout accepted', logout.ok, { status: logout.status });
  const afterLogout = await call(session, 'session.current');
  check('logout revokes the consumer session', afterLogout.status === 401, { status: afterLogout.status });
  if (logout.ok) unlinkSync('/tmp/wgd-byof-bob.session.json');
}
const anonymousCurrent = await call(null, 'session.current');
check('anonymous: current session refused', anonymousCurrent.status === 401, { status: anonymousCurrent.status });
for (const name of Object.keys(services).filter(name => name !== 'session.current')) {
  const result = await call(null, name);
  check(`anonymous: ${name} refused`, result.status === 404, { status: result.status });
}
const output = new URL('verification/2026-10-08-frontend/', root);
mkdirSync(output, { recursive: true });
const evidenceFile = recovery ? 'recovery-smoke.json' : 'service-smoke.json';
writeFileSync(new URL(evidenceFile, output), JSON.stringify({ at: new Date().toISOString(), checks }, null, 2));
appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Live frontend service smoke\n\n${checks.filter(check => check.pass).length}/${checks.length} checks passed. Evidence: verification/2026-10-08-frontend/${evidenceFile}.\n${checks.filter(check => !check.pass).map(check => `- FAILED ${check.name}: ${JSON.stringify(check.evidence)}\n`).join('')}`);
if (checks.some(check => !check.pass)) process.exit(1);
