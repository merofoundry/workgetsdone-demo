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
  for (const [collection, shot] of [['companies', 'hosted-company-bob.png'], ['contacts', 'hosted-contact-bob.png']]) {
    await page.goto(`${base}/${collection}`);
    await page.getByRole('heading', { name: collection[0].toUpperCase() + collection.slice(1), exact: true }).waitFor();
    const first = page.locator(`a[href^="/${collection}/"]`).first();
    await first.waitFor();
    const name = (await first.locator('strong').innerText()).trim();
    check(`bob: ${collection} list shows a row`, name, { name });
    await first.click();
    await page.getByRole('heading', { name, exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Timeline', exact: true }).waitFor();
    check(`bob: ${collection} detail shows heading and Timeline`, new URL(page.url()).pathname.startsWith(`/${collection}/`) && await page.locator('[data-record-id]').count() > 0, { path: new URL(page.url()).pathname, name });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: new URL(shot, evidence).pathname, fullPage: true });
  }
  check('no script errors', errors.length === 0, { pageErrors: errors });
  await context.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-entities-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted companies and contacts check as bob\n\n${checks.filter(item => item.passed).length}/${checks.length} checks passed. Evidence: ${evidence.pathname.slice(root.pathname.length)}hosted-entities-results.json, hosted-company-bob.png, hosted-contact-bob.png.\n${failure ? `FAILED: ${failure}\n` : ''}`);
}
if (failure) process.exit(1);
