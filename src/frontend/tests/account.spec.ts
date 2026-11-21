import { test, expect, type Page } from '@playwright/test';
import { registry, adminProfile } from '../fixtures/data';
import { mock } from './helpers';

type Call = { name: string; body: any };
/** Records the account and session service calls in order; `replies` overrides the answer per service. */
async function record(page: Page, replies: Record<string, { status?: number; json: unknown }> = {}) {
  const calls: Call[] = [];
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(key => registry.services[key] === id)!;
    if (!/^(account\.|session\.login)/.test(name) || name === 'account.read') return route.fallback();
    calls.push({ name, body: route.request().postDataJSON() });
    const reply = replies[name] ?? { json: { data: name === 'account.changePassword' ? { ok: true, signedOut: true } : { ok: true } } };
    await route.fulfill({ status: reply.status ?? 200, json: reply.json });
  });
  return calls;
}

test('the profile form saves the display name, time zone and user name', async ({ page }) => {
  await mock(page); const calls = await record(page); await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('rob@example.test'); await expect(page.getByLabel('Email')).not.toBeEditable();
  await expect(page.getByLabel('Display name')).toHaveValue('Rob Mero');
  await page.getByLabel('Display name').fill('Rob M.'); await page.getByLabel('Time zone').selectOption('America/Chicago'); await page.getByLabel('User name').fill('robm');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  expect(calls).toEqual([{ name: 'account.update', body: { displayName: 'Rob M.', timezone: 'America/Chicago', userName: 'robm' } }]);
});

test('password changes are withdrawn: an administrator sentence and no password field or call', async ({ page }) => {
  await mock(page); const calls = await record(page); await page.goto('/account');
  await expect(page.getByText('Password changes are handled by an administrator for now.')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0); await expect(page.getByRole('button', { name: /password/i })).toHaveCount(0);
  expect(calls).toEqual([]);
});

test('/change-password redirects to /account and the menu link follows it', async ({ page }) => {
  await mock(page); await page.goto('/change-password'); await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
});

test('the Google sign-in panel states whether the account is linked and who changes it', async ({ page }) => {
  await mock(page); await page.goto('/account');
  const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Google sign-in' }) });
  await expect(panel).toContainText('not linked'); await expect(panel).toContainText('An administrator links or unlinks Google for your account.');
  await expect(panel.getByRole('button')).toHaveCount(0);
});
test('the Google sign-in panel says linked when the account is linked', async ({ page }) => {
  await mock(page, { 'account.read': { ...adminProfile, oauthProvider: 'google' } }); await page.goto('/account');
  await expect(page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Google sign-in' }) })).toContainText('is linked to this account');
});
