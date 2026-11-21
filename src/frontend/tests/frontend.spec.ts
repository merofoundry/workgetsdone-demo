import { test, expect } from '@playwright/test';
import { fixtures, projectId, registry } from '../fixtures/data';
import { demoAccounts } from '../src/demo-accounts';
import { mock } from './helpers';
test('Overview matches its panels, keeps independent failures, and uses explicit CSP', async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => { (window as any).cspErrors = []; document.addEventListener('securitypolicyviolation', event => (window as any).cspErrors.push(event.violatedDirective)); });
  page.on('pageerror', error => violations.push(error.message));
  await mock(page); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Thursday, Oct 8' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next 14 days' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Map legacy permissions/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CRM migration' })).toBeVisible();
  await page.screenshot({ path: '../verification/2026-10-08-frontend/overview-desktop.png', fullPage: true });
  expect(await page.evaluate(() => (window as any).cspErrors)).toEqual([]); expect(violations).toEqual([]);
});
test('a failed agenda leaves stats and project cards usable', async ({ page }) => {
  await mock(page, { 'dashboard.agenda': 'error' }); await page.goto('/');
  await expect(page.getByText('Your agenda could not be loaded.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CRM migration' })).toBeVisible();
  await expect(page.getByText('open tasks across projects')).toBeVisible();
});
test('project filters round-trip in the URL, QuickAdd opens a prefilled dialog, and pages append', async ({ page }) => {
  await mock(page); await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: 'CRM migration', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Tasks 4' }).click(); await expect(page).toHaveURL(/kind=tasks/);
  await page.getByLabel('Include completed and archived').check(); await expect(page).toHaveURL(/closed=1/);
  await page.getByLabel('Add a note, or start with /task or /call').fill('/task Check the import'); await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible(); await expect(page.getByLabel('Task name')).toHaveValue('Check the import'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Show 8 earlier entries' }).click(); await expect(page.getByRole('link', { name: 'Earlier timeline entry' })).toBeVisible();
  await page.screenshot({ path: '../verification/2026-10-08-frontend/project-desktop.png', fullPage: true });
});
test('keyboard shortcuts respect text focus and project context; palette supports keyboard choice', async ({ page }) => {
  await mock(page); await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await page.getByLabel('Add a note, or start with /task or /call').focus(); await page.keyboard.type('t'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('heading', { name: 'Timeline' }).click(); await page.keyboard.press('t'); await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible(); await expect(page.getByRole('dialog', { name: 'New task' }).getByText('Project: CRM migration')).toBeVisible(); await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k'); await page.getByRole('combobox').fill('CRM'); await expect(page.getByRole('option').filter({ hasText: 'CRM migration' })).toBeVisible(); await page.keyboard.press('Enter'); await expect(page).toHaveURL(`/projects/${projectId}`);
});
test('SHARE controls stay absent for a reader', async ({ page }) => {
  const project = fixtures['projects.read'] as any;
  await mock(page, { 'projects.read': { ...project, permissions: { read: true, write: false, delete: false, share: false } } }); await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Access', exact: true })).toHaveCount(0); await expect(page.getByLabel('Add a note, or start with /task or /call')).toHaveCount(0);
});
test('Overview and Project fit a 375px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await mock(page);
  for (const [name, path] of [['overview', '/'], ['project', `/projects/${projectId}`]]) {
    await page.goto(path); await expect(page.getByRole('heading', { name: name === 'overview' ? 'Next 14 days' : 'Timeline' })).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    if (width > 375) console.log(await page.evaluate(() => Array.from(document.querySelectorAll('body *')).map(element => ({ cls: element.className, tag: element.tagName, rect: element.getBoundingClientRect().toJSON() })).filter(item => item.rect.right > 375)));
    expect(width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: `../verification/2026-10-08-frontend/${name}-mobile.png`, fullPage: true });
  }
});

test('four navigation links open lists and details survive reload on mobile', async ({ page }) => {
  await mock(page); await page.goto('/');
  for (const [collection, label] of [['projects', 'Projects'], ['tasks', 'Tasks'], ['calls', 'Calls'], ['notes', 'Notes']]) {
    if ((page.viewportSize()?.width ?? 1280) < 1280) await page.getByRole('button', { name: 'Toggle sidebar' }).click(); // the sidebar is off-canvas below 1280 px
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(`/${collection}`); await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await page.locator(collection === 'projects' ? '.record-project' : '.entry-title').first().click();
    await expect(page).toHaveURL(new RegExp(`/${collection}/[a-f0-9-]+$`));
    await page.reload(); await expect(page.getByRole('heading', { name: collection === 'projects' ? 'Timeline' : 'Details', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 }); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  }
});
test('list filters preserve URLs and a denied detail stays not-found', async ({ page }) => {
  await mock(page);
  await page.route('**/api/v1/services/' + registry.services['tasks.read'] + '/inbound', route => route.fulfill({ status: 404, json: { error: { message: 'Not found.' } } }));
  await page.goto('/tasks'); await page.getByLabel('Include completed', { exact: true }).check(); await page.getByLabel('Search tasks', { exact: true }).fill('migration');
  await expect(page).toHaveURL(/closed=1.*q=migration/); await page.locator('.entry-title').first().click();
  await expect(page.getByText('This task could not be found.')).toBeVisible(); await page.getByRole('link', { name: 'Back to Tasks' }).click(); await expect(page).toHaveURL('/tasks');
});

test('login shows the demo accounts and the fill buttons complete the form', async ({ page }) => {
  await mock(page); await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to your work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Try the demo' })).toBeVisible();
  await expect(page.locator('.demo-account')).toHaveCount(demoAccounts.length);
  for (const account of demoAccounts) {
    await expect(page.locator('.demo-account', { hasText: account.email })).toContainText(account.password);
  }
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: "Use Jane's login", exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(demoAccounts[1].email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(demoAccounts[1].password);
  await page.getByRole('button', { name: "Use Bob's login", exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(demoAccounts[0].email);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(demoAccounts[0].password);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
test('project timeline is requested while projects.read is still pending', async ({ page }) => {
  await mock(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let timelineSeen = false; let readPending = false;
  const readUrl = '**/api/v1/services/' + registry.services['projects.read'] + '/inbound';
  await page.route('**/api/v1/services/' + registry.services['projects.timeline'] + '/inbound', async route => { timelineSeen = readPending; await route.fallback(); });
  await page.route(readUrl, async route => { readPending = true; await gate; readPending = false; await route.fallback(); });
  await page.goto(`/projects/${projectId}`);
  await expect.poll(() => timelineSeen).toBe(true);
  release();
  await expect(page.getByRole('heading', { name: 'CRM migration', exact: true })).toBeVisible();
});
