import './stage-guard.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root);
const base = process.env.WGD_BASE || 'https://workgetsdone.staging.merofoundry.app';
const checks = [];
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, evidence: detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); if (!passed) throw new Error(name); };
const passwordFor = name => {
  const line = readFileSync(new URL(`.env-${name}`, root), 'utf8').split('\n').find(line => line.startsWith(`${name.toUpperCase()}_PASSWORD=`));
  if (!line) throw new Error(`Missing ${name} verification credential`);
  return line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim();
};
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failure;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill('bob@workgetsdone.test');
  await page.getByLabel('Password', { exact: true }).fill(passwordFor('bob'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Account:/ }).waitFor();
  check('bob: signed in', true, { path: new URL(page.url()).pathname });
  const call = (name, input) => page.evaluate(async ([name, input]) => {
    const registry = await (await fetch('/services.json')).json();
    const response = await fetch(`/api/v1/services/${registry.services[name]}/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(input), credentials: 'include' });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, [name, input]);
  const companies = await call('companies.list', { query: '', cursor: 0, pageSize: 25 });
  const contacts = await call('contacts.list', { query: '', cursor: 0, pageSize: 25 });
  const companyId = companies.body.data.items[0].id; const contactId = contacts.body.data.items[0].id;
  const at = new Date(Date.now() + 86400000); at.setSeconds(0, 0); const iso = at.toISOString(); const stamp = Date.now().toString(36);
  const made = await call('tasks.create', { title: `Task10 endAt ${stamp}`, startAt: iso, endAt: iso, contactId, companyId, clientRef: crypto.randomUUID() });
  const id = made.body?.data?.id; check('bob: seeded a task with start == end, a contact and a company', made.status === 200 && id, { status: made.status, id });
  const before = (await call('tasks.read', { id })).body.data;
  check('bob: tasks.read carries endAt, contactId, companyId', before.endAt === iso && before.contactId === contactId && before.companyId === companyId, { endAt: before.endAt, contactId: before.contactId, companyId: before.companyId, version: before.version });
  await page.goto(`${base}/tasks/${id}`);
  await page.getByRole('heading', { name: before.title, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const title = `Task10 renamed ${stamp}`;
  await page.getByRole('dialog', { name: 'Edit task' }).getByLabel('Task name').fill(title);
  await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Save' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const after = (await call('tasks.read', { id })).body.data;
  check('bob: title changed, endAt, contactId and companyId unchanged', after.title === title && after.endAt === before.endAt && after.startAt === before.startAt && after.contactId === contactId && after.companyId === companyId && after.version === before.version + 1, { title: after.title, endAt: after.endAt, startAt: after.startAt, contactId: after.contactId, companyId: after.companyId, version: after.version });
  await page.screenshot({ path: new URL('hosted-task-edit-bob.png', evidence).pathname, fullPage: true });
  check('no script errors', errors.length === 0, { pageErrors: errors });
  await context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-task-edit-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted task edit keeps endAt and links (Task 10 fix round 1)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed. Evidence: ${evidence.pathname.slice(root.pathname.length)}hosted-task-edit-results.json, hosted-task-edit-bob.png.\n${failure ? `FAILED: ${failure}\n` : ''}`);
}
if (failure) process.exit(1);
