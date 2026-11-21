import { test, expect } from '@playwright/test';
import { registry } from '../fixtures/data';
import { mock } from './helpers';

const sentence = 'Google sign-in works for accounts an administrator has linked. It does not create accounts.';
test('the sign-in page offers Continue with Google when the registry has session.googleStart', async ({ page }) => {
  await mock(page); await page.goto('/sign-in?returnTo=/projects');
  const link = page.getByRole('link', { name: 'Continue with Google' });
  await expect(link).toBeVisible(); await expect(link).toHaveAttribute('href', `/api/v1/services/${registry.services['session.googleStart']}/inbound`);
  await expect(page.getByText(sentence)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
test('without session.googleStart neither the link nor the sentence renders', async ({ page }) => {
  await mock(page);
  const { 'session.googleStart': _omit, ...services } = registry.services;
  await page.route('**/services.json', route => route.fulfill({ json: { ...registry, services } }));
  await page.goto('/sign-in'); await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0); await expect(page.getByText('Google sign-in works')).toHaveCount(0);
});
test('the password-changed notice still shows with the Google link present', async ({ page }) => {
  await mock(page); await page.goto('/sign-in?changed=1');
  await expect(page.getByText('Your password was changed. Sign in again.')).toBeVisible(); await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
});
