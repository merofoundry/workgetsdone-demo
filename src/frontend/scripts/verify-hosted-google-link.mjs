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
let failure; let linked = false; let page;
const janeRow = () => page.locator('.user-table tbody tr').filter({ hasText: 'jane@workgetsdone.test' });
const save = async notice => { await page.getByRole('dialog', { name: 'Edit user' }).getByRole('button', { name: 'Save user' }).click(); await page.getByText(notice).first().waitFor(); await page.getByRole('dialog').waitFor({ state: 'detached' }); };
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill('bob@workgetsdone.test');
  await page.getByLabel('Password', { exact: true }).fill(passwordFor('bob'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Account:/ }).waitFor();
  await page.goto(base + '/admin/users', { waitUntil: 'domcontentloaded' }); await page.getByRole('heading', { name: 'Users', exact: true }).waitFor();
  await janeRow().first().waitFor();
  check('jane starts without a Google tag', (await janeRow().getByText('Google', { exact: true }).count()) === 0, {});
  const sub = `WGD-MATRIX-sub-${Date.now()}`;
  await janeRow().getByRole('button', { name: /^Edit / }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit user' });
  check('the dialog shows the field and its hint', (await dialog.getByLabel('Google account subject').count()) === 1 && (await dialog.innerText()).includes("From the Google account's"), {});
  await dialog.getByLabel('Google account subject').fill(sub); linked = true; await save('User saved.');
  await janeRow().getByText('Google', { exact: true }).waitFor();
  check('after saving a fake subject the table shows the Google tag', (await janeRow().getByText('Google', { exact: true }).count()) === 1, { sub });
  await page.screenshot({ path: new URL('hosted-google-link-linked.png', evidence).pathname, fullPage: true });
  await janeRow().getByRole('button', { name: /^Edit / }).click();
  await page.getByRole('dialog', { name: 'Edit user' }).getByLabel('Unlink the Google account').check(); await save('User saved.'); linked = false;
  await page.waitForFunction(() => ![...document.querySelectorAll('.user-table tbody tr')].some(r => r.innerText.includes('jane@workgetsdone.test') && r.innerText.includes('Google')));
  check('unlinking clears the Google tag', (await janeRow().getByText('Google', { exact: true }).count()) === 0, {});
  check('no script errors', errors.length === 0, { errors });
  await context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  if (linked && page) { try { await janeRow().getByRole('button', { name: /^Edit / }).click(); await page.getByRole('dialog', { name: 'Edit user' }).getByLabel('Unlink the Google account').check(); await save('User saved.'); linked = false; } catch (e) { failure = (failure || '') + ' CLEANUP FAILED: jane may still be linked: ' + e.message; } }
  await browser.close();
  writeFileSync(new URL('hosted-google-link-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} \u2014 Hosted Google link browser verification (Task 21)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed against ${base}. Evidence: verification/2026-10-11-full-build/hosted-google-link-results.json.${failure ? ' FAILED: ' + failure : ''}\n`);
}
if (failure) process.exit(1);
