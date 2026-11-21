import { test, expect } from '@playwright/test';
import { fileId, fixtures, noteIdForFile, projectId, registry } from '../fixtures/data';
import { mock } from './helpers';

const file = fixtures['files.read'] as Record<string, any>;
const withPermissions = (permissions: object) => ({ 'files.read': { ...file, permissions: { read: true, write: false, delete: false, share: false, ...permissions } } });

test('the attachment page shows details, parent links and the download notice', async ({ page }) => {
  await mock(page);
  await page.goto('/files/' + fileId);
  const header = page.locator('.page-header');
  await expect(header.getByRole('heading', { name: 'contacts-export.csv' })).toBeVisible();
  await expect(header).toHaveAttribute('data-record-id', fileId);
  const details = page.getByRole('region', { name: 'Details' }).or(page.locator('.panel', { hasText: 'Details' }));
  await expect(details.getByText('text/csv')).toBeVisible();
  await expect(details.getByText('125.4 KB')).toBeVisible();
  await expect(details.getByText('sha256:9f2c')).toBeVisible();
  await expect(details.getByText('Rob Mero')).toBeVisible();
  await expect(page.locator('.breadcrumbs').getByRole('link', { name: 'Notes' })).toHaveAttribute('href', '/notes');
  await expect(page.locator('.breadcrumbs').getByRole('link', { name: 'Migration decisions from the kickoff' })).toHaveAttribute('href', '/notes/' + noteIdForFile);
  await expect(page.getByRole('link', { name: 'CRM migration' })).toHaveAttribute('href', '/projects/' + projectId);
  await expect(page.getByRole('link', { name: 'Northwind Traders' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dana Whitfield' })).toBeVisible();
  await expect(page.getByText('Downloads are not available on this platform yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: /download/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /download/i })).toHaveCount(0);
});

test('Delete confirms, sends files.delete with only the id and returns to the notes list', async ({ page }) => {
  await mock(page);
  const calls: { name: string; body: any }[] = [];
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(key => registry.services[key] === id)!;
    if (name !== 'files.delete') return route.fallback();
    calls.push({ name, body: route.request().postDataJSON() });
    await route.fulfill({ json: { data: { ok: true } } });
  });
  await page.goto('/files/' + fileId);
  await page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete file?' });
  await expect(dialog.getByText('contacts-export.csv will be deleted.')).toBeVisible();
  expect(calls).toEqual([]);
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/\/notes$/);
  expect(calls).toEqual([{ name: 'files.delete', body: { id: fileId } }]);
});

test('Delete is hidden without the delete permission', async ({ page }) => {
  await mock(page, withPermissions({ delete: false }));
  await page.goto('/files/' + fileId);
  await expect(page.getByRole('heading', { name: 'contacts-export.csv' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
});

test('an unknown attachment says it could not be found', async ({ page }) => {
  await mock(page);
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    if (registry.services['files.read'] !== id) return route.fallback();
    await route.fulfill({ status: 404, json: { error: { message: 'This record could not be found.' } } });
  });
  await page.goto('/files/' + fileId);
  await expect(page.getByText('This attachment could not be found.')).toBeVisible();
});
