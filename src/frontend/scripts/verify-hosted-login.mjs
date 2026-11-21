import { chromium } from '@playwright/test';
import { readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root);
const base = process.env.WGD_BASE || 'https://workgetsdone.merofoundry.app';
const loginModel = '42069a61-6c5c-4a70-8f44-5c9ead67c867';
const checks = [];
const check = (name, passed, evidence) => {
  checks.push({ name, passed: !!passed, evidence });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(evidence)}`);
  if (!passed) throw new Error(name);
};
const passwordFor = name => {
  const line = readFileSync(new URL(`.env-${name}`, root), 'utf8').split('\n').find(line => line.startsWith(`${name.toUpperCase()}_PASSWORD=`));
  if (!line) throw new Error(`Missing ${name} verification credential`);
  return line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim();
};
mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
let failure;
try {
  for (const name of ['bob', 'jane']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.wgdCspViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.wgdCspViolations.push(event.violatedDirective));
    });
    const response = await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
    check(`${name}: anonymous root reaches new login`, page.url().includes('/sign-in'), { status: response.status(), path: new URL(page.url()).pathname });
    await page.screenshot({ path: new URL(`hosted-login-${name}.png`, evidence).pathname, fullPage: true });
    const email = page.getByLabel('Email', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await email.fill(`${name}@workgetsdone.test`);
    if (name === 'bob' && !process.argv.includes('--skip-invalid')) {
      await password.fill('verification-invalid-password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('alert').waitFor();
      check('invalid password stays on login with an error', new URL(page.url()).pathname === '/sign-in', { path: new URL(page.url()).pathname });
    }
    await password.fill(passwordFor(name));
    const loginResponse = page.waitForResponse(response => response.url().includes(`/models/${loginModel}/records`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const result = await loginResponse;
    check(`${name}: native login succeeds`, result.ok(), { status: result.status() });
    await page.getByRole('button', { name: /^Account:/ }).waitFor();
    check(`${name}: authenticated shell loads`, new URL(page.url()).pathname === '/', { path: new URL(page.url()).pathname });
    const cookies = await context.cookies();
    const sessionCookies = cookies.filter(cookie => /^(__Host-)?mf_app_(access|refresh)$/.test(cookie.name));
    check(`${name}: session cookie is HttpOnly and Secure`, sessionCookies.length === 2 && sessionCookies.every(cookie => cookie.httpOnly && cookie.secure), { sessionCookieCount: sessionCookies.length, flags: sessionCookies.map(({name, httpOnly, secure, sameSite, path}) => ({name, httpOnly, secure, sameSite, path})) });
    const visibleCookieNames = await page.evaluate(() => document.cookie.split(';').map(cookie => cookie.trim().split('=')[0]).filter(Boolean));
    check(`${name}: script cannot read session tokens`, visibleCookieNames.every(cookie => cookie === 'session_present'), { visibleCookieNames });
    check(`${name}: no CSP violations or script errors`, errors.length === 0 && (await page.evaluate(() => window.wgdCspViolations)).length === 0, { pageErrors: errors, csp: await page.evaluate(() => window.wgdCspViolations) });
    await page.screenshot({ path: new URL(`hosted-shell-${name}.png`, evidence).pathname, fullPage: true });
    await page.getByRole('button', { name: /^Account:/ }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
    await page.goto(base + '/');
    await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
    check(`${name}: logout survives a reload`, new URL(page.url()).pathname === '/sign-in', { path: new URL(page.url()).pathname });
    await context.close();
  }
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await mobile.newPage();
  await page.goto(base + '/login');
  await page.getByRole('heading', { name: 'Sign in to your work' }).waitFor();
  check('mobile login fits 375px', await page.evaluate(() => document.documentElement.scrollWidth <= 375), {});
  await page.screenshot({ path: new URL('hosted-login-mobile.png', evidence).pathname, fullPage: true });
  await mobile.close();
} catch (error) { failure = error.message; console.error(failure); }
finally {
  await browser.close();
  writeFileSync(new URL('hosted-login-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, checks, failure: failure || null }, null, 2));
  appendFileSync(new URL('BUILD_LOG.md', root), `\n\n### ${new Date().toISOString()} — Hosted login browser verification\n\n${checks.filter(check => check.passed).length}/${checks.length} checks passed. Evidence: ${evidence.pathname.slice(root.pathname.length)}hosted-login-results.json.\n${failure ? `FAILED: ${failure}\n` : ''}`);
}
if (failure) process.exit(1);
