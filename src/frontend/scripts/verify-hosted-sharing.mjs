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
async function signIn(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); page.errors = []; page.on('pageerror', error => page.errors.push(error.message));
  await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill(`${name}@workgetsdone.test`);
  await page.getByLabel('Password', { exact: true }).fill(passwordFor(name));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Account:/ }).waitFor();
  return { context, page };
}
try {
  const bob = await signIn('bob'); const page = bob.page;
  check('bob: signed in', true, { path: new URL(page.url()).pathname });
  const name = `WGD-MATRIX sharing panel ${new Date().toISOString()}`;
  await page.goto(base + '/companies');
  await page.getByRole('button', { name: 'New company' }).click();
  const create = page.getByRole('dialog', { name: 'New company' });
  await create.getByLabel('Name', { exact: true }).fill(name);
  await create.getByRole('button', { name: 'Create company' }).click();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  const companyPath = new URL(page.url()).pathname;
  check('bob: created a company', /^\/companies\/[0-9a-f-]{36}$/.test(companyPath), { companyPath });
  await page.getByRole('heading', { name: 'Access', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Manage sharing' }).click();
  const dialog = page.getByRole('dialog', { name: 'Company access' });
  await dialog.getByRole('heading', { name: 'Add person' }).waitFor();
  check('bob: creator row has no Revoke', (await dialog.getByRole('button', { name: 'Revoke' }).count()) === 0, {});
  await dialog.getByLabel('Find a colleague').fill('jane');
  await dialog.getByRole('radio').first().check();
  await dialog.getByRole('radio', { name: 'Viewer: can view' }).check();
  await dialog.getByRole('radio', { name: 'This record only' }).check();
  const person = await dialog.locator('label.radio-option').first().innerText();
  await dialog.getByRole('button', { name: 'Add person' }).click();
  await dialog.locator('.sharing-row', { hasText: person.trim() }).waitFor();
  check('bob: shared with Jane as Viewer, this record only', true, { person: person.trim(), rows: await dialog.locator('.sharing-row').allInnerTexts() });
  await page.screenshot({ path: new URL('hosted-sharing-bob.png', evidence).pathname, fullPage: true });
  const jane = await signIn('jane');
  await jane.page.goto(base + companyPath);
  await jane.page.getByRole('heading', { name, exact: true }).waitFor();
  check('jane: sees the shared company', true, { path: companyPath });
  await jane.page.screenshot({ path: new URL('hosted-sharing-jane.png', evidence).pathname, fullPage: true });
  await dialog.locator('.sharing-row', { hasText: person.trim() }).getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('dialog', { name: 'Revoke access?' }).getByRole('button', { name: 'Confirm' }).click();
  await dialog.locator('.sharing-row', { hasText: person.trim() }).waitFor({ state: 'detached' });
  check('bob: revoked Jane', true, { rows: await dialog.locator('.sharing-row').allInnerTexts() });
  await jane.page.reload();
  await jane.page.getByText('This company could not be found.').waitFor();
  check('jane: reload shows "This company could not be found."', true, {});
  check('no script errors', bob.page.errors.length + jane.page.errors.length === 0, { bob: bob.page.errors, jane: jane.page.errors });
  await bob.context.close(); await jane.context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-sharing-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted sharing browser verification (Task 12)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed. Evidence: ${evidence.pathname.slice(root.pathname.length)}hosted-sharing-results.json.\n${failure ? `FAILED: ${failure}\n` : ''}`);
}
if (failure) process.exit(1);
