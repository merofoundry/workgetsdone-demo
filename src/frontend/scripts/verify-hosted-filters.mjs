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
  await page.goto(base + '/tasks'); await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor();
  await page.locator('.record-entry').first().waitFor();
  const before = await page.locator('.record-entry').count();
  await page.getByLabel('Billable', { exact: true }).check();
  await page.waitForURL(/billable=1/);
  check('URL carries billable=1', new URL(page.url()).searchParams.get('billable') === '1', { url: page.url() });
  await page.getByText(/tasks match these filters/).waitFor();
  const cards = await page.locator('.record-entry').count();
  const tagged = await page.locator('.record-entry', { has: page.getByText('Billable', { exact: true }) }).count();
  check('every listed task shows a Billable tag', cards > 0 && tagged === cards, { before, cards, tagged });
  await page.screenshot({ path: new URL('hosted-filters-bob.png', evidence).pathname, fullPage: true });
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.waitForURL(u => !u.search.includes('billable'));
  check('Clear filters resets the URL', !page.url().includes('billable'), { url: page.url() });
  await page.goto(base + '/tasks?foo=1&sort=secret'); await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor();
  await page.locator('.record-entry').first().waitFor();
  check('unknown URL parameters are ignored', (await page.locator('.record-entry').count()) > 0, {});
  check('no script errors', errors.length === 0, { errors });
  await context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-filters-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted filters browser verification (Task 17)\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed against ${base}. Evidence: verification/2026-10-11-full-build/hosted-filters-results.json.${failure ? ' FAILED: ' + failure : ''}\n`);
}
if (failure) process.exit(1);
