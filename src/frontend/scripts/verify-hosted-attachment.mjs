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
const registry = JSON.parse(readFileSync(new URL('frontend/public/services.json', root), 'utf8')).services;
const browser = await chromium.launch({ headless: true });
let failure;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill('bob@workgetsdone.test');
  await page.getByLabel('Password', { exact: true }).fill(passwordFor('bob'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Account:/ }).waitFor();
  check('bob: signed in', true, { path: new URL(page.url()).pathname });
  const post = async (name, input) => { const r = await context.request.post(`${base}/api/v1/services/${registry[name]}/inbound`, { data: input, headers: { 'X-Requested-With': 'XMLHttpRequest' } }); return { status: r.status(), body: await r.json().catch(() => null) }; };
  const projects = await post('projects.list', { includeClosed: true });
  let target = null;
  for (const project of projects.body.data.items) {
    const t = await post('projects.timeline', { id: project.id, kind: 'files', includeClosed: true });
    const entry = t.body?.data?.entries?.find(e => e.kind === 'file');
    if (entry) { target = { projectId: project.id, entry }; break; }
  }
  check('bob: found a project whose timeline has an attachment', !!target, { projectId: target?.projectId, filename: target?.entry.title });
  await page.goto(base + '/projects/' + target.projectId);
  await page.locator('.page-header h1').waitFor();
  await page.getByRole('radio', { name: /^Files/ }).click();
  const link = page.locator('.timeline-entry').getByRole('link', { name: target.entry.title, exact: true }).first();
  await link.waitFor({ timeout: 60000 });
  await link.click();
  await page.waitForURL(url => url.pathname === '/files/' + target.entry.id, { timeout: 30000 });
  check('bob: clicking the file entry opens /files/<id>', true, { path: new URL(page.url()).pathname });
  await page.locator('.page-header').getByRole('heading', { name: target.entry.title, exact: true }).waitFor();
  const recordId = await page.locator('.page-header').getAttribute('data-record-id');
  check('attachment header carries the record id', recordId === target.entry.id, { recordId });
  const text = (await page.locator('main, .page').first().innerText()).replace(/\s+/g, ' ');
  check('attachment page shows size, type and the download notice', /KB/.test(text) && text.includes('Downloads are not available on this platform yet.'), { text: text.slice(0, 400) });
  check('no Download button or link', (await page.getByRole('button', { name: /download/i }).count()) === 0 && (await page.getByRole('link', { name: /download/i }).count()) === 0, {});
  const read = await post('files.read', { id: target.entry.id });
  const canDelete = read.body?.data?.permissions?.delete === true;
  check('the Delete button is present exactly when files.read says delete is allowed', (await page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true }).count()) === (canDelete ? 1 : 0), { canDelete, permissions: read.body?.data?.permissions });
  await page.screenshot({ path: new URL('hosted-attachment-bob.png', evidence).pathname, fullPage: true });
  await page.reload(); await page.locator('.page-header').getByRole('heading', { name: target.entry.title, exact: true }).waitFor();
  check('the attachment page survives a reload', true, {});
  check('no script errors', errors.length === 0, { errors });
  await context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-attachment-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted attachment page browser verification (Task 16)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed. Evidence: verification/2026-10-11-full-build/hosted-attachment-results.json.${failure ? ' FAILED: ' + failure : ''}\n`);
}
if (failure) process.exit(1);
