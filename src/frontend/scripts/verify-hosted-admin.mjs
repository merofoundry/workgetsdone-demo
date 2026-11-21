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
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('link', { name: 'Users' }).click(); await page.getByRole('heading', { name: 'Users', exact: true }).waitFor();
  check('the Users link is visible to bob and opens /admin/users', new URL(page.url()).pathname === '/admin/users', { url: page.url() });
  const rows = page.locator('.user-table tbody tr'); await rows.first().waitFor();
  const jane = rows.filter({ hasText: 'jane@workgetsdone.test' });
  check('the table lists jane (active, not an administrator) and bob (administrator)', (await jane.count()) === 1 && !(await jane.innerText()).includes('Administrator') && (await rows.filter({ hasText: 'bob@workgetsdone.test' }).innerText()).includes('Administrator'), { rows: await rows.count() });
  check('bob has no Deactivate button on his own row', (await rows.filter({ hasText: 'bob@workgetsdone.test' }).getByRole('button', { name: /Deactivate/ }).count()) === 0, {});
  await page.screenshot({ path: new URL('hosted-admin-users-bob.png', evidence).pathname, fullPage: true });
  const test = rows.filter({ hasText: 'WGD-MATRIX user' }).first();
  if ((await test.count()) === 0) { check('SKIPPED Deactivate/Reactivate: no WGD-MATRIX user exists (the hourly demo reset removed the matrix fixture); jane and bob are never deactivated', true, { skipped: true }); }
  else {
    const name = (await test.locator('td').first().innerText()).trim(); const row = () => rows.filter({ hasText: name }).first();
    const wasActive = (await row().innerText()).includes('Active') && !(await row().innerText()).includes('Inactive');
    const settled = (n, inactive) => page.waitForFunction(([n, inactive]) => [...document.querySelectorAll('.user-table tbody tr')].some(r => r.innerText.includes(n) && r.innerText.includes('Inactive') === inactive), [n, inactive]);
    const flip = async (verb, notice) => { await row().getByRole('button', { name: new RegExp(`^${verb} `) }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click(); await page.getByText(notice).waitFor(); };
    if (wasActive) { await flip('Deactivate', 'User deactivated.'); await settled(name, true); check('Deactivate marks the test user inactive', (await row().innerText()).includes('Inactive'), { name }); await flip('Reactivate', 'User reactivated.'); await settled(name, false); check('Reactivate brings it back', !(await row().innerText()).includes('Inactive'), { name }); }
    else { await flip('Reactivate', 'User reactivated.'); await settled(name, false); check('Reactivate brings it back', !(await row().innerText()).includes('Inactive'), { name }); await flip('Deactivate', 'User deactivated.'); await settled(name, true); check('Deactivate leaves the test user inactive', (await row().innerText()).includes('Inactive'), { name }); }
  }
  check('no script errors', errors.length === 0, { errors });
  await context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-admin-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} \u2014 Hosted admin users browser verification (Task 19)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed against ${base}. Evidence: verification/2026-10-11-full-build/hosted-admin-results.json.${failure ? ' FAILED: ' + failure : ''}\n`);
}
if (failure) process.exit(1);
