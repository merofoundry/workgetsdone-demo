import { test, expect, type Page } from '@playwright/test';
import { registry, adminProfile } from '../fixtures/data';
import { mock } from './helpers';

type Call = { name: string; body: any };
async function record(page: Page) {
  const calls: Call[] = [];
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(key => registry.services[key] === id)!;
    if (name !== 'users.update') return route.fallback();
    calls.push({ name, body: route.request().postDataJSON() }); await route.fulfill({ json: { data: { ok: true } } });
  });
  return calls;
}
const formRoute = '**/api/v1/public/app/workgetsdone/forms/*/submit';

test('a non-administrator sees no Users link and the not-found state', async ({ page }) => {
  await mock(page); await page.goto('/');
  await page.getByRole('button', { name: /^Account:/ }).click();
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await page.goto('/admin/users'); await expect(page.getByText('This page could not be found.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Users' })).toHaveCount(0);
});

test('an administrator sees the table, tags and the account menu link', async ({ page }) => {
  await mock(page, { 'account.read': adminProfile }); await page.goto('/');
  await page.getByRole('button', { name: /^Account:/ }).click(); await page.getByRole('link', { name: 'Users' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/); await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  const rows = page.locator('.user-table tbody tr'); await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('jane@example.test'); await expect(rows.nth(0)).toContainText('Administrator'); await expect(rows.nth(2)).toContainText('Inactive');
  await expect(page.getByRole('button', { name: 'Deactivate Rob Mero' })).toHaveCount(0);
});

test('New user posts the form body to the form route and refreshes the list', async ({ page }) => {
  await mock(page, { 'account.read': adminProfile }); let body: any = null, headers: Record<string, string> = {};
  await page.route(formRoute, async route => { body = route.request().postDataJSON(); headers = route.request().headers(); await route.fulfill({ status: 201, json: { id: 'x' } }); });
  await page.goto('/admin/users'); await page.getByRole('button', { name: 'New user' }).click();
  const dialog = page.getByRole('dialog', { name: 'New user' });
  await dialog.getByLabel('Email').fill('new@example.test'); await dialog.getByLabel('Display name').fill('New Person'); await dialog.getByLabel('Time zone').selectOption('America/Chicago');
  await dialog.getByLabel('Initial password').fill('short'); await expect(dialog.getByText('Use at least 12 characters.')).toBeVisible();
  await dialog.getByLabel('Initial password').fill('correct-horse-battery');
  await dialog.getByRole('button', { name: 'Create user' }).click();
  await expect(page.getByText('User created.')).toBeVisible();
  expect(body).toEqual({ data: { email: 'new@example.test', password: 'correct-horse-battery', display_name: 'New Person', user_name: 'new@example.test', timezone: 'America/Chicago' } });
  expect(headers['x-requested-with']).toBe('XMLHttpRequest');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a refused creation shows the service message and keeps the dialog open', async ({ page }) => {
  await mock(page, { 'account.read': adminProfile });
  await page.route(formRoute, route => route.fulfill({ status: 422, json: { error: { message: 'Only an administrator may create a user account' } } }));
  await page.goto('/admin/users'); await page.getByRole('button', { name: 'New user' }).click();
  const dialog = page.getByRole('dialog', { name: 'New user' });
  await dialog.getByLabel('Email').fill('n@example.test'); await dialog.getByLabel('Display name').fill('N'); await dialog.getByLabel('Initial password').fill('correct-horse-battery');
  await dialog.getByRole('button', { name: 'Create user' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Only an administrator may create a user account');
});

test('Deactivate confirms and sends users.update with isActive false; Reactivate sends true; Edit sends the new name', async ({ page }) => {
  await mock(page, { 'account.read': adminProfile }); const calls = await record(page);
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Deactivate Jane Doe' }).click();
  await expect(page.getByRole('dialog', { name: 'Deactivate user' })).toBeVisible(); expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Confirm' }).click(); await expect(page.getByText('User deactivated.')).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate Old Account' }).click(); await page.getByRole('button', { name: 'Confirm' }).click(); await expect(page.getByText('User reactivated.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Jane Doe' }).click(); const dialog = page.getByRole('dialog', { name: 'Edit user' });
  await dialog.getByLabel('Display name').fill('Jane D.'); await dialog.getByLabel('Time zone').selectOption('America/Chicago'); await dialog.getByRole('button', { name: 'Save user' }).click(); await expect(page.getByText('User saved.')).toBeVisible();
  expect(calls).toEqual([
    { name: 'users.update', body: { id: '70000000-0000-4000-8000-000000000002', displayName: 'Jane Doe', timezone: 'UTC', isActive: false } },
    { name: 'users.update', body: { id: '70000000-0000-4000-8000-000000000003', displayName: 'Old Account', timezone: 'UTC', isActive: true } },
    { name: 'users.update', body: { id: '70000000-0000-4000-8000-000000000002', displayName: 'Jane D.', timezone: 'America/Chicago', isActive: true } }]);
});

test('Google link: the table tags linked accounts; Edit links with a subject, leaves the link alone when empty, and unlinks with the checkbox', async ({ page }) => {
  await mock(page, { 'account.read': adminProfile }); const calls = await record(page);
  await page.goto('/admin/users');
  const rows = page.locator('.user-table tbody tr');
  await expect(rows.nth(1).getByText('Google', { exact: true })).toBeVisible(); await expect(rows.nth(0).getByText('Google', { exact: true })).toHaveCount(0);
  const jane = '70000000-0000-4000-8000-000000000002', rob = rows.nth(0);
  await rob.getByRole('button', { name: /^Edit / }).click(); let dialog = page.getByRole('dialog', { name: 'Edit user' });
  await expect(dialog.getByText("From the Google account's")).toBeVisible(); await expect(dialog.getByLabel('Unlink the Google account')).toHaveCount(0);
  await dialog.getByLabel('Google account subject').fill(' 1234567890 '); await dialog.getByRole('button', { name: 'Save user' }).click(); await expect(page.getByText('User saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Jane Doe' }).click(); dialog = page.getByRole('dialog', { name: 'Edit user' });
  await dialog.getByRole('button', { name: 'Save user' }).click(); await expect(page.getByText('User saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Jane Doe' }).click(); dialog = page.getByRole('dialog', { name: 'Edit user' });
  await dialog.getByLabel('Unlink the Google account').check(); await dialog.getByRole('button', { name: 'Save user' }).click();
  await expect.poll(() => calls.length).toBe(3);
  expect(calls.map(call => call.body)).toEqual([
    { id: expect.any(String), displayName: 'Rob Mero', timezone: 'America/New_York', isActive: true, oauthProvider: 'google', oauthSubject: '1234567890' },
    { id: jane, displayName: 'Jane Doe', timezone: 'UTC', isActive: true },
    { id: jane, displayName: 'Jane Doe', timezone: 'UTC', isActive: true, oauthProvider: null, oauthSubject: null }]);
});
