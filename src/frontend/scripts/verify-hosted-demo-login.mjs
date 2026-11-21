// Hosted check that the public demo accounts are shown on the sign-in page and work end to end.
// Run from frontend/ inside the Playwright image with WGD_BASE set to the stage site (stage-guard refuses production).
import { guardedBase as base } from './stage-guard.mjs';
import { chromium, expect } from '@playwright/test';
import { appendFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root);
const checks = [];
const check = (name, pass) => { checks.push({ name, pass: !!pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) throw new Error(name); };
const accounts = ['bob', 'jane'].map(name => {
  const line = readFileSync(new URL(`.env-${name}`, root), 'utf8').split('\n').find(line => line.startsWith(`${name.toUpperCase()}_PASSWORD=`));
  return { name, label: name[0].toUpperCase() + name.slice(1), username: `${name}@workgetsdone.test`, password: line.split('=').slice(1).join('=').replace(/^['"]|['"]$/g, '').trim() };
});
const browser = await chromium.launch(); let failure;
try {
  for (const { name, label, username, password } of accounts) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } }), page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.wgdCsp = []; document.addEventListener('securitypolicyviolation', e => window.wgdCsp.push(e.violatedDirective)); });
    await page.goto(base + '/sign-in'); await expect(page.getByRole('heading', { name: 'Sign in to your work' })).toBeVisible();
    check(`${label}: public demo credentials displayed`, await page.getByRole('heading', { name: 'Try the demo' }).count() === 1 && await page.locator('.demo-account').count() === accounts.length && await page.locator('.demo-account', { hasText: username }).getByText(password, { exact: true }).count() === 1);
    check(`${label}: credentials not prefilled`, await page.getByLabel('Email', { exact: true }).inputValue() === '' && await page.getByLabel('Password', { exact: true }).inputValue() === '');
    await page.getByRole('button', { name: `Use ${label}'s login`, exact: true }).click();
    check(`${label}: fill button uses displayed credentials`, await page.getByLabel('Email', { exact: true }).inputValue() === username && await page.getByLabel('Password', { exact: true }).inputValue() === password);
    check(`${label}: login fits mobile`, await page.evaluate(() => document.documentElement.scrollWidth <= 375));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('button', { name: /^Account:/ }).waitFor();
    check(`${label}: displayed credentials log in`, new URL(page.url()).pathname === '/');
    await page.getByRole('button', { name: /^Account:/ }).click(); await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
    check(`${label}: logout works`, new URL(page.url()).pathname === '/sign-in');
    check(`${label}: no script or CSP errors`, errors.length === 0 && (await page.evaluate(() => window.wgdCsp)).length === 0);
    await context.close();
  }
} catch (e) { failure = e.message; console.error(failure); }
finally {
  await browser.close(); mkdirSync(evidence, { recursive: true });
  const file = 'verification/2026-10-11-full-build/hosted-demo-login-results.json';
  writeFileSync(new URL(file, root), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2) + '\n');
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted demo login verification\n\n${checks.filter(x => x.pass).length}/${checks.length} checks passed against ${base}. Evidence: ${file}.${failure ? `\nFAILED: ${failure}` : ''}\n`);
}
if (failure) process.exit(1);
