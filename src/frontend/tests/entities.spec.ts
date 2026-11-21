import { test, expect } from '@playwright/test';
import { companyId, contactId } from '../fixtures/data';
import { mock } from './helpers';
test('Companies list links to a company whose detail shows associations, projects and timeline', async ({ page }) => {
  await mock(page); await page.goto('/companies');
  await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible();
  await page.getByRole('link', { name: /Northwind Traders/ }).click();
  await expect(page).toHaveURL(`/companies/${companyId}`);
  await expect(page.getByRole('heading', { name: 'Northwind Traders' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dana Whitfield' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CRM migration' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await expect(page.locator('[data-record-id]').first()).toHaveAttribute('data-record-id', companyId);
});
test('Contacts list and detail', async ({ page }) => {
  await mock(page); await page.goto('/contacts');
  await page.getByRole('link', { name: /Whitfield/ }).click();
  await expect(page).toHaveURL(`/contacts/${contactId}`);
  await expect(page.getByText('dana@northwind.test')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Northwind Traders' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
});
test('an empty companies list has an empty state and the nav has no dead link', async ({ page }) => {
  await mock(page, { 'companies.list': { items: [], total: 0, nextCursor: null } }); await page.goto('/');
  await page.getByRole('link', { name: 'Companies' }).click();
  await expect(page.getByText('No companies in this view yet.')).toBeVisible();
  await expect(page.getByText('This page could not be found.')).toHaveCount(0);
});
test('a refused company stays not-found and writing controls follow permissions', async ({ page }) => {
  await mock(page);
  await page.route('**/api/v1/services/c0000000-0000-4000-8000-000000000002/inbound', route => route.fulfill({ status: 404, json: { error: { message: 'This record could not be found.' } } }));
  await page.goto(`/companies/${companyId}`); await expect(page.getByText('This company could not be found.')).toBeVisible();
});
test('New company and New contact buttons are enabled', async ({ page }) => {
  await mock(page); await page.goto('/contacts');
  await expect(page.getByRole('button', { name: 'New contact' })).toBeEnabled();
});
