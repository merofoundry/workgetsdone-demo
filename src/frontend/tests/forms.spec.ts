import { test, expect, type Page } from '@playwright/test';
import { companyId, contactId, projectId, registry, timeline } from '../fixtures/data';
import { mock } from './helpers';

const taskId = '30000000-0000-4000-8000-000000000002';
const serviceUrl = (name: string) => `**/api/v1/services/${registry.services[name]}/inbound`;
function record(page: Page) {
  const bodies: Record<string, any[]> = {};
  page.on('request', request => {
    if (request.method() !== 'POST' || !request.url().includes('/inbound')) return;
    const name = Object.keys(registry.services).find(key => request.url().includes(registry.services[key]));
    if (name) (bodies[name] ||= []).push(request.postDataJSON());
  });
  return bodies;
}
const task = { ...timeline.entries[0], version: 3, canWrite: true, body: 'Check grants', billable: true };

test('editing a company posts the full field set with the read version', async ({ page }) => {
  const bodies = record(page); await mock(page); await page.goto(`/companies/${companyId}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit company' })).toBeVisible();
  await page.getByLabel('City').fill('Dallas');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => bodies['companies.update']?.length).toBe(1);
  expect(bodies['companies.update'][0]).toMatchObject({ id: companyId, version: 2, name: 'Northwind Traders', city: 'Dallas', address1: '1 Main St' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('a 409 keeps the typed value, shows the server message and Reload resets the form', async ({ page }) => {
  await mock(page); await page.goto(`/companies/${companyId}`);
  await page.route(serviceUrl('companies.update'), route => route.fulfill({ status: 409, json: { error: { message: 'Someone else changed this record. Reload and try again.' } } }));
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('City').fill('Dallas');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Someone else changed this record. Reload and try again.')).toBeVisible();
  await expect(page.getByLabel('City')).toHaveValue('Dallas');
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByLabel('City')).toHaveValue('Austin');
  await expect(page.getByText('Someone else changed this record.')).toHaveCount(0);
});
test('a 422 marks the named field and keeps every typed value', async ({ page }) => {
  await mock(page); await page.goto(`/companies/${companyId}`);
  await page.route(serviceUrl('companies.update'), route => route.fulfill({ status: 422, json: { error: { message: 'Some fields are missing or invalid.', fields: ['phone1'] } } }));
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('City').fill('Dallas');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Check this value')).toHaveCount(1);
  await expect(page.getByLabel('City')).toHaveValue('Dallas');
});
test('New task from a company page locks the company and posts companyId', async ({ page }) => {
  const bodies = record(page); await mock(page, { 'tasks.create': { ok: true, id: '99999999-0000-4000-8000-000000000001' } }); await page.goto(`/companies/${companyId}`);
  await page.getByRole('button', { name: /^New task/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New task' });
  await expect(dialog.getByText('Company: Northwind Traders')).toBeVisible();
  await expect(dialog.getByLabel('Project')).toHaveCount(0);
  await dialog.getByLabel('Task name').fill('Send proposal');
  await dialog.getByRole('button', { name: 'Create task' }).click();
  await expect.poll(() => bodies['tasks.create']?.length).toBe(1);
  expect(bodies['tasks.create'][0]).toMatchObject({ title: 'Send proposal', companyId });
  expect(bodies['tasks.create'][0].clientRef).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(`/companies/${companyId}`);
});
test('New contact from the list creates and navigates to the new contact', async ({ page }) => {
  const bodies = record(page); const id = '99999999-0000-4000-8000-000000000002';
  await mock(page, { 'contacts.create': { ok: true, id } }); await page.goto('/contacts');
  await page.getByRole('button', { name: 'New contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'New contact' });
  await dialog.getByLabel('First name').fill('Ada'); await dialog.getByLabel('Last name').fill('Lovelace'); await dialog.getByLabel('Email').first().fill('ada@example.test');
  await dialog.getByRole('button', { name: 'Create contact' }).click();
  await expect(page).toHaveURL(`/contacts/${id}`);
  expect(bodies['contacts.create'][0]).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace', email1: 'ada@example.test' });
});
test('New call from a task shows the locked task and offers no New task', async ({ page }) => {
  await mock(page, { 'tasks.read': task }); await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('button', { name: /^New task/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^New call/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New call' });
  await expect(dialog.getByText('Task: Map legacy permissions to grants')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Task' })).toHaveCount(0);
  await expect(dialog.getByRole('radio', { name: 'Note' })).toBeVisible();
});
const ids = { assigneeId: '70000000-0000-4000-8000-000000000001', calleeId: '70000000-0000-4000-8000-000000000002', taskId: '70000000-0000-4000-8000-000000000003', callId: '70000000-0000-4000-8000-000000000004' };
test('editing a task keeps endAt (equal to start), assigneeId, contactId, companyId and billed', async ({ page }) => {
  const bodies = record(page); const at = '2026-10-08T13:00:00.000Z';
  await mock(page, { 'tasks.read': { ...task, startAt: at, dueAt: at, endAt: at, contactId, companyId, assigneeId: ids.assigneeId, billed: true, billable: true } }); await page.goto(`/tasks/${taskId}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Task name').fill('Renamed task');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => bodies['tasks.update']?.length).toBe(1);
  expect(bodies['tasks.update'][0]).toMatchObject({ id: taskId, version: 3, title: 'Renamed task', startAt: at, endAt: at, assigneeId: ids.assigneeId, contactId, companyId, billable: true, billed: true });
});
test('editing a call keeps calleeId, taskId, followup and endAt', async ({ page }) => {
  const bodies = record(page); const callId = '30000000-0000-4000-8000-000000000003';
  const call = { ...timeline.entries[1], version: 5, canWrite: true, startAt: '2026-10-08T16:30:00.000Z', endAt: '2026-10-08T17:15:00.000Z', durationMinutes: 45, calleeId: ids.calleeId, taskId: ids.taskId, followup: true, billable: true, billed: false, contactId };
  await mock(page, { 'calls.read': call }); await page.goto(`/calls/${callId}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Subject').fill('Renamed call');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => bodies['calls.update']?.length).toBe(1);
  expect(bodies['calls.update'][0]).toMatchObject({ id: callId, version: 5, title: 'Renamed call', startAt: call.startAt, endAt: call.endAt, calleeId: ids.calleeId, taskId: ids.taskId, followup: true, contactId });
});
test('editing a note keeps callId, taskId and occurredAt', async ({ page }) => {
  const bodies = record(page); const noteId = '40000000-0000-4000-8000-000000000001';
  const note = { ...timeline.entries[2], version: 2, canWrite: true, occurredAt: '2026-10-07T13:00:00.000Z', callId: ids.callId, taskId: ids.taskId, projectId };
  await mock(page, { 'notes.read': note }); await page.goto(`/notes/${noteId}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Title').fill('Renamed note');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => bodies['notes.update']?.length).toBe(1);
  expect(bodies['notes.update'][0]).toMatchObject({ id: noteId, version: 2, title: 'Renamed note', occurredAt: note.occurredAt, callId: ids.callId, taskId: ids.taskId, projectId });
});
test('the project page edits and archives with confirmation', async ({ page }) => {
  const bodies = record(page); await mock(page); await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Name').fill('CRM migration v2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect.poll(() => bodies['projects.update']?.length).toBe(1);
  expect(bodies['projects.update'][0]).toMatchObject({ id: projectId, name: 'CRM migration v2' });
  await page.locator('.page-header').getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('dialog', { name: 'Archive this project?' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => bodies['projects.archive']?.length).toBe(1);
});
test('quick add on a company page creates a note linked to the company', async ({ page }) => {
  const bodies = record(page); await mock(page); await page.goto(`/companies/${companyId}`);
  await page.getByLabel('Add a note, or start with /task or /call').fill('Spoke with finance');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => bodies['notes.create']?.length).toBe(1);
  expect(bodies['notes.create'][0]).toMatchObject({ title: 'Spoke with finance', companyId });
});
