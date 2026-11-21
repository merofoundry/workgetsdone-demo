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
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill('bob@workgetsdone.test');
  await page.getByLabel('Password', { exact: true }).fill(passwordFor('bob'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Account:/ }).waitFor();
  await page.goto(base + '/account'); await page.getByRole('heading', { name: 'Account', exact: true }).waitFor();
  const nameField = page.getByLabel('Display name'); await nameField.waitFor();
  const original = await nameField.inputValue();
  check('the account page shows bob\'s email read-only', (await page.getByLabel('Email', { exact: true }).inputValue()) === 'bob@workgetsdone.test' && !(await page.getByLabel('Email', { exact: true }).isEditable()), { original });
  const changed = 'WGD-MATRIX Bob';
  const save = async name => { await nameField.fill(name); await page.getByRole('button', { name: 'Save profile' }).click(); await page.getByText('Profile saved.').waitFor(); };
  await save(changed);
  await page.locator('.avatar').filter({ hasText: changed.split(/\s+/).slice(0, 2).map(part => part[0]).join('') }).waitFor();
  check('the account menu reflects the new display name', (await page.getByRole('button', { name: `Account: ${changed}` }).count()) === 1, {});
  await page.screenshot({ path: new URL('hosted-account-bob.png', evidence).pathname, fullPage: true });
  await page.reload(); await page.getByLabel('Display name').waitFor();
  check('the change survives a reload', (await page.getByLabel('Display name').inputValue()) === changed, {});
  await save(original); await page.getByRole('button', { name: `Account: ${original}` }).waitFor();
  check('the original display name is back and shown in the menu', (await page.getByRole('button', { name: `Account: ${original}` }).count()) === 1, { original });
  await page.goto(base + '/change-password'); await page.getByRole('heading', { name: 'Account', exact: true }).waitFor();
  check('/change-password lands on /account', new URL(page.url()).pathname === '/account', { url: page.url() });
  check('no script errors', errors.length === 0, { errors });
  await context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-account-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted account browser verification (Task 18)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed against ${base}. Evidence: verification/2026-10-11-full-build/hosted-account-results.json.${failure ? ' FAILED: ' + failure : ''}\n`);
}
if (failure) process.exit(1);
