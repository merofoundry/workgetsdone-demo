import './stage-guard.mjs';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
// Hosted check of the Task 26 calendar as bob: one login; month, week and list views, request bodies, router click-through, screenshots in both themes.
const root = new URL('../../', import.meta.url);
const evidence = new URL('verification/2026-10-11-full-build/', root);
const base = process.env.WGD_BASE;
mkdirSync(evidence, { recursive: true });
const checks = [];
const check = (name, passed, detail) => { checks.push({ name, passed: !!passed, evidence: detail }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
const line = readFileSync(new URL('.env-bob', root), 'utf8').split('\n').find(l => l.startsWith('BOB_PASSWORD='));
const password = line.slice(line.indexOf('=') + 1).replace(/^['"]|['"]$/g, '').trim();
const agenda = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push('pageerror: ' + error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/inbound')) { try { const body = request.postDataJSON(); if (body && 'windowDays' in body) agenda.push(body); } catch {} } });
  await page.addInitScript(() => { window.wgdCsp = []; document.addEventListener('securitypolicyviolation', event => window.wgdCsp.push(event.violatedDirective)); });
  await page.goto(base + '/sign-in', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill('bob@workgetsdone.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /^Account:/ }).waitFor();
  const settle = async () => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(600); };
  const shot = name => page.screenshot({ path: new URL(`calendar-${name}.png`, evidence).pathname });
  await page.getByRole('navigation', { name: 'Main' }).waitFor();
  await page.goto(base + '/calendar', { waitUntil: 'domcontentloaded' }); await page.locator('.calendar-grid .fc, .calendar-grid [role=grid]').first().waitFor(); await settle();
  check('month view renders a six-week grid and asks for 42 days', agenda.length > 0 && agenda.at(-1).windowDays === 42 && /^\d{4}-\d{2}-\d{2}$/.test(agenda.at(-1).windowStart), agenda.at(-1));
  const events = await page.locator('.calendar-grid [data-record-id]').count();
  check('month view shows events from the agenda (informational)', true, { events });
  await shot('desktop-month-light');
  await page.getByRole('tab', { name: 'Week view' }).click(); await settle();
  check('week view request carries windowDays 7', agenda.at(-1).windowDays === 7, agenda.at(-1)); await shot('desktop-week-light');
  await page.getByRole('tab', { name: 'List view' }).click(); await settle();
  check('list view request carries windowDays 7', agenda.at(-1).windowDays === 7, agenda.at(-1)); await shot('desktop-list-light');
  await page.getByRole('tab', { name: 'Month view' }).click(); await settle();
  await page.getByRole('button', { name: 'Toggle dark mode' }).click(); await settle(); await shot('desktop-month-dark');
  await page.getByRole('tab', { name: 'Week view' }).click(); await settle(); await shot('desktop-week-dark');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await page.getByRole('tab', { name: 'Month view' }).click(); await settle();
  // Click-through without a page load: prefer a call, else any event; step months forward if the current grid is empty.
  const pick = () => page.locator('.calendar-grid [data-record-id]').first();
  let target = pick();
  for (let step = 0; step < 3 && !(await target.count()); step++) { await page.getByRole('button', { name: /Next/ }).first().click(); await settle(); target = pick(); }
  const found = await target.count();
  check('an event exists to click', found > 0, { found });
  if (found) {
    const href = await target.evaluate(el => el.getAttribute('href') || el.querySelector('a')?.getAttribute('href') || el.closest('a')?.getAttribute('href')); await page.evaluate(() => { window.__still = true; }); await target.click();
    await page.waitForURL(u => u.pathname === href, { timeout: 8000 }).catch(() => {});
    check('click-through reaches the record detail without a full page load', new URL(page.url()).pathname === href && await page.evaluate(() => window.__still === true), { href, path: new URL(page.url()).pathname });
  }
  await page.goto(base + '/calendar', { waitUntil: 'domcontentloaded' }); await settle();
  await page.setViewportSize({ width: 375, height: 812 }); await settle(); await shot('mobile-month-light');
  await page.getByRole('tab', { name: 'List view' }).click(); await settle(); await shot('mobile-list-light');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click(); await settle(); await shot('mobile-list-dark');
  await page.getByRole('tab', { name: 'Month view' }).click(); await settle(); await shot('mobile-month-dark');
  check('mobile: no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), {});
  const csp = await page.evaluate(() => window.wgdCsp);
  check('zero console errors and CSP violations', errors.length === 0 && csp.length === 0, { errors, csp });
  await context.close();
} finally {
  await browser.close();
  writeFileSync(new URL('hosted-calendar-task26-results.json', evidence), JSON.stringify({ at: new Date().toISOString(), base, agendaRequests: agenda, checks }, null, 2) + '\n');
}
if (checks.some(c => !c.passed)) process.exit(1);
