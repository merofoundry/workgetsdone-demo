import { test, expect, type Page } from '@playwright/test';
import { companyId, contactId, fixtures, registry } from '../fixtures/data';
import { mock } from './helpers';
const NAMES = ['contacts.associate', 'contacts.dissociate', 'companies.setPrimaryContact'];
const assocId = '60000000-0000-4000-8000-000000000009';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function track(page: Page) {
  const calls: { name: string; body: any }[] = [];
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(key => registry.services[key] === id)!;
    if (NAMES.includes(name)) calls.push({ name, body: route.request().postDataJSON() });
    await route.fallback();
  });
  return calls;
}
const company = () => fixtures['companies.read'] as any; const contact = () => fixtures['contacts.read'] as any;
const secondary = (isPrimary: boolean) => ({ ...company(), primaryContactId: isPrimary ? contactId : null, associations: [{ ...company().associations[0], isPrimary }] });
const found = (id: string, label: string, kind: string) => ({ search: { matches: [{ id, kind, label, context: '', href: `/${kind}/${id}` }] } });
const otherId = '50000000-0000-4000-8000-000000000099';
test('links a contact from the company page', async ({ page }) => {
  await mock(page, found(otherId, 'Priya Raman', 'contacts')); const calls = await track(page); await page.goto(`/companies/${companyId}`);
  await page.getByRole('button', { name: 'Link a contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link a contact' });
  await dialog.getByLabel('Contact', { exact: true }).fill('pri'); await dialog.getByRole('button', { name: /Priya Raman/ }).click();
  await dialog.getByLabel('Role').fill('Sponsor'); await dialog.getByLabel('Primary contact').check();
  await dialog.getByRole('button', { name: 'Link contact' }).click();
  await expect.poll(() => calls.find(call => call.name === 'contacts.associate')?.body).toMatchObject({ contactId: otherId, companyId, role: 'Sponsor', isPrimary: true });
  await expect.poll(() => calls.find(call => call.name === 'companies.setPrimaryContact')?.body).toEqual({ id: companyId, contactId: otherId });
  expect(calls[0].body.clientRef).toMatch(uuid); expect(Object.keys(calls[0].body).sort()).toEqual(['clientRef', 'companyId', 'contactId', 'isPrimary', 'role']);
  await expect(page.getByText('Contact linked.')).toBeVisible();
});
test('shows the service error inline when linking fails', async ({ page }) => {
  await mock(page, found(otherId, 'Priya Raman', 'contacts'));
  await page.route('**/api/v1/services/*/inbound', async route => { const id = new URL(route.request().url()).pathname.split('/').at(-2); if (id === registry.services['contacts.associate']) return route.fulfill({ status: 422, json: { error: { message: 'The linked record could not be found.' } } }); await route.fallback(); });
  await page.goto(`/companies/${companyId}`); await page.getByRole('button', { name: 'Link a contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link a contact' });
  await dialog.getByLabel('Contact', { exact: true }).fill('pri'); await dialog.getByRole('button', { name: /Priya Raman/ }).click(); await dialog.getByRole('button', { name: 'Link contact' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The linked record could not be found.');
});
test('sets a non-primary contact as primary', async ({ page }) => {
  await mock(page, { 'companies.read': secondary(false) }); const calls = await track(page); await page.goto(`/companies/${companyId}`);
  await expect(page.getByRole('button', { name: 'Clear primary' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Set as primary' }).click();
  await expect.poll(() => calls.find(call => call.name === 'companies.setPrimaryContact')?.body).toEqual({ id: companyId, contactId });
  await expect(page.getByText('Primary contact updated.')).toBeVisible();
});
test('clears the primary contact', async ({ page }) => {
  await mock(page, { 'companies.read': secondary(true) }); const calls = await track(page); await page.goto(`/companies/${companyId}`);
  await expect(page.getByRole('button', { name: 'Set as primary' })).toHaveCount(0); await expect(page.getByText('Primary', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear primary' }).click();
  await expect.poll(() => calls.find(call => call.name === 'companies.setPrimaryContact')?.body).toEqual({ id: companyId, contactId: null });
});
test('unlinks after confirming', async ({ page }) => {
  await mock(page); const calls = await track(page); await page.goto(`/companies/${companyId}`);
  await page.getByRole('button', { name: 'Unlink' }).click();
  const confirm = page.getByRole('dialog', { name: 'Unlink contact?' }); await expect(confirm).toBeVisible(); expect(calls).toHaveLength(0);
  await confirm.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => calls.find(call => call.name === 'contacts.dissociate')?.body).toEqual({ associationId: assocId });
  await expect(page.getByText('Contact unlinked.')).toBeVisible();
});
test('no controls without write permission', async ({ page }) => {
  await mock(page, { 'companies.read': { ...company(), permissions: { read: true, write: false, delete: false, share: false } }, 'contacts.read': { ...contact(), permissions: { read: true, write: false, delete: false, share: false } } });
  for (const path of [`/companies/${companyId}`, `/contacts/${contactId}`]) {
    await page.goto(path); await expect(page.getByRole('heading', { name: 'Associations' })).toBeVisible(); await expect(page.getByText('Dana Whitfield').or(page.getByText('Northwind Traders')).first()).toBeVisible();
    for (const name of ['Link a contact', 'Link a company', 'Set as primary', 'Clear primary', 'Unlink']) await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
});
test('links a company and unlinks from the contact page', async ({ page }) => {
  await mock(page, found(otherId, 'Contoso Ltd', 'companies')); const calls = await track(page); await page.goto(`/contacts/${contactId}`);
  await expect(page.getByRole('button', { name: 'Set as primary' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Link a company' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link a company' });
  await dialog.getByLabel('Company', { exact: true }).fill('con'); await dialog.getByRole('button', { name: /Contoso Ltd/ }).click();
  await dialog.getByLabel('Role').fill('Buyer'); await dialog.getByRole('button', { name: 'Link company' }).click();
  await expect.poll(() => calls.find(call => call.name === 'contacts.associate')?.body).toMatchObject({ contactId, companyId: otherId, role: 'Buyer', isPrimary: false });
  expect(calls[0].body.clientRef).toMatch(uuid);
  await page.getByRole('button', { name: 'Unlink' }).click(); await page.getByRole('dialog', { name: 'Unlink company?' }).getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => calls.find(call => call.name === 'contacts.dissociate')?.body).toEqual({ associationId: assocId });
});
test('the company page tags the contact the company names as primary, not the stale link flag', async ({ page }) => {
  await mock(page, { 'companies.read': { ...company(), primaryContactId: null, associations: [{ ...company().associations[0], isPrimary: true }] } }); await page.goto(`/companies/${companyId}`);
  await expect(page.getByRole('button', { name: 'Set as primary' })).toBeVisible(); await expect(page.getByText('Primary', { exact: true })).toHaveCount(0);
});
