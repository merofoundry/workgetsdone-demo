import { test, expect } from '@playwright/test';
import { companyId, contactId, fixtures, janeId, projectId } from '../fixtures/data';
import { mock } from './helpers';
async function track(page: import('@playwright/test').Page) {
  const calls: { name: string; body: any }[] = [];
  const { registry } = await import('../fixtures/data');
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(key => registry.services[key] === id)!;
    if (name === 'grants.grant' || name === 'grants.revoke' || name === 'grants.list') calls.push({ name, body: route.request().postDataJSON() });
    await route.fallback();
  });
  return calls;
}
const withShare = (key: string, base: unknown, extra: object = {}) => ({ [key]: { ...(base as object), permissions: { read: true, write: true, delete: true, share: true }, ...extra } });
test('adds Jane as Editor over everything under a project', async ({ page }) => {
  await mock(page); const calls = await track(page); await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: 'Access', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manage sharing' }).click();
  const dialog = page.getByRole('dialog', { name: 'Project access' });
  await dialog.getByLabel('Find a colleague').fill('jan');
  await expect(dialog.getByRole('radio', { name: 'Sam Adeyemi' })).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Jane Example' }).check();
  await dialog.getByRole('radio', { name: 'Editor: can view and edit' }).check();
  await dialog.getByRole('radio', { name: 'This record and everything under it' }).check();
  await dialog.getByRole('button', { name: 'Add person' }).click();
  await expect.poll(() => calls.find(call => call.name === 'grants.grant')?.body).toEqual({ objectKind: 'project', objectId: projectId, userId: janeId, level: 'editor', scope: 'subtree' });
  await expect(page.getByText('Access updated.')).toBeVisible();
});
test('revokes a shared row after confirming, and the creator row has no Revoke', async ({ page }) => {
  await mock(page); const calls = await track(page); await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Manage sharing' }).click();
  const dialog = page.getByRole('dialog', { name: 'Project access' });
  await expect(dialog.getByText('Creator')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Revoke' })).toHaveCount(1);
  await expect(dialog.locator('.sharing-row', { hasText: 'Rob Mero' }).getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('dialog', { name: 'Revoke access?' }).getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => calls.find(call => call.name === 'grants.revoke')?.body).toEqual({ objectKind: 'project', objectId: projectId, userId: '20000000-0000-4000-8000-000000000002', source: 'share-1760000000000' });
});
test('shows a service error when granting fails', async ({ page }) => {
  await mock(page); await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    if (id === (await import('../fixtures/data')).registry.services['grants.grant']) return route.fulfill({ status: 422, json: { error: { message: 'Level is not allowed here.' } } });
    await route.fallback();
  });
  await page.goto(`/projects/${projectId}`); await page.getByRole('button', { name: 'Manage sharing' }).click();
  const dialog = page.getByRole('dialog', { name: 'Project access' });
  await dialog.getByRole('radio', { name: 'Jane Example' }).check(); await dialog.getByRole('button', { name: 'Add person' }).click();
  await expect(dialog.getByText('Level is not allowed here.')).toBeVisible();
});
test('no panel without SHARE', async ({ page }) => {
  await mock(page, { 'projects.read': { ...(fixtures['projects.read'] as object), permissions: { read: true, write: true, delete: false, share: false } } }); await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Access', exact: true })).toHaveCount(0);
});
test('the panel renders on a company, a contact and a task', async ({ page }) => {
  await mock(page, { ...withShare('companies.read', fixtures['companies.read']), ...withShare('contacts.read', fixtures['contacts.read']), 'tasks.read': { ...(fixtures['tasks.read'] as object), canShare: true } });
  for (const path of [`/companies/${companyId}`, `/contacts/${contactId}`, `/tasks/${(fixtures['tasks.read'] as any).id}`]) {
    await page.goto(path); await expect(page.getByRole('heading', { name: 'Access', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage sharing' })).toBeVisible();
  }
});
test('no panel on a task without canShare, a company or contact without SHARE', async ({ page }) => {
  await mock(page, { 'companies.read': { ...(fixtures['companies.read'] as object), permissions: { read: true, write: true, delete: false, share: false } }, 'contacts.read': { ...(fixtures['contacts.read'] as object), permissions: { read: true, write: true, delete: false, share: false } } });
  for (const path of [`/companies/${companyId}`, `/contacts/${contactId}`, `/tasks/${(fixtures['tasks.read'] as any).id}`]) {
    await page.goto(path); await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Access', exact: true })).toHaveCount(0);
  }
});
