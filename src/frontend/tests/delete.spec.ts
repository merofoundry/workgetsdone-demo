import { test, expect, type Page } from '@playwright/test';
import { companyId, fixtures, projectId, registry } from '../fixtures/data';
import { mock } from './helpers';

type Reply = { status?: number; json: unknown };
type Call = { name: string; body: any };
const ok = (done: boolean, remaining: number): Reply => ({ json: { data: { ok: true, done, remaining } } });
const preview = (data: object): Reply => ({ json: { data: { blocked: false, reasons: [], children: { tasks: 0, calls: 0, notes: 0, files: 0, subprojects: 0, associations: 0 }, strategies: [], ...data } } });
/** Replies to the delete services in order, per service name, and records every body. */
async function deleteMock(page: Page, replies: Record<string, Reply[]>) {
  const calls: Call[] = []; const queues = Object.fromEntries(Object.entries(replies).map(([name, list]) => [name, [...list]]));
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(key => registry.services[key] === id)!;
    if (!(name in queues)) return route.fallback();
    const body = route.request().postDataJSON(); calls.push({ name, body });
    const next = queues[name].length > 1 ? queues[name].shift()! : queues[name][0];
    await route.fulfill({ status: next.status ?? 200, json: next.json });
  });
  return calls;
}
const names = (calls: Call[]) => calls.map(call => call.name);
const withDelete = (key: string, base: unknown) => ({ [key]: { ...(base as object), permissions: { read: true, write: true, delete: true, share: true } } });

test('a blocked company shows the reasons and a disabled Confirm', async ({ page }) => {
  await mock(page, withDelete('companies.read', fixtures['companies.read']));
  const calls = await deleteMock(page, { 'companies.delete': [preview({ blocked: true, reasons: [{ kind: 'projects', count: 2 }, { kind: 'associations', count: 1 }] })] });
  await page.goto(`/companies/${companyId}`); await page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete company?' });
  await expect(dialog.getByText('2 projects still reference this company. Reassign or delete them first.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  expect(calls).toEqual([{ name: 'companies.delete', body: { id: companyId, dryRun: true } }]);
});

test('a project with children offers two strategies and deletes children in batches before the project', async ({ page }) => {
  await mock(page, withDelete('projects.read', fixtures['projects.read']));
  const calls = await deleteMock(page, {
    'projects.delete': [preview({ blocked: true, reasons: [{ kind: 'children', count: 9 }], children: { tasks: 5, calls: 3, notes: 1, files: 0, subprojects: 0, associations: 0 }, strategies: ['cascade', 'reparent'] }), ok(true, 0)],
    'projects.deleteChildren': [ok(false, 2), ok(true, 0)],
  });
  await page.goto(`/projects/${projectId}`); await page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete project?' });
  await expect(dialog.getByRole('radio', { name: 'Delete everything under it' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Move its tasks, calls and notes to the company' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await dialog.getByRole('radio', { name: 'Delete everything under it' }).check();
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(calls.map(call => ({ name: call.name, body: call.body }))).toEqual([
    { name: 'projects.delete', body: { id: projectId, dryRun: true } },
    { name: 'projects.deleteChildren', body: { id: projectId, strategy: 'cascade' } },
    { name: 'projects.deleteChildren', body: { id: projectId, strategy: 'cascade' } },
    { name: 'projects.delete', body: { id: projectId } },
  ]);
  expect(calls[3].body).not.toHaveProperty('strategy');
});

test('a note delete names the attachment count and returns to the notes list', async ({ page }) => {
  const note = fixtures['notes.read'] as { id: string };
  await mock(page, { 'notes.read': { ...note, canDelete: true } });
  const calls = await deleteMock(page, { 'notes.delete': [preview({ children: { tasks: 0, calls: 0, notes: 0, files: 2, subprojects: 0, associations: 0 } }), ok(false, 1), ok(true, 0)] });
  await page.goto(`/notes/${note.id}`); await page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete note?' });
  await expect(dialog.getByText('2 attachments will be deleted.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page).toHaveURL(/\/notes$/);
  expect(names(calls)).toEqual(['notes.delete', 'notes.delete', 'notes.delete']);
  expect(calls.map(call => call.body)).toEqual([{ id: note.id, dryRun: true }, { id: note.id }, { id: note.id }]);
  await expect(page.getByText('Note deleted.')).toBeVisible();
});

test('a 409 after confirming shows the reasons and keeps the dialog open', async ({ page }) => {
  await mock(page, withDelete('companies.read', fixtures['companies.read']));
  const calls = await deleteMock(page, { 'companies.delete': [preview({}), { status: 409, json: { error: { message: 'This record cannot be deleted yet.', reasons: [{ kind: 'tasks', count: 3 }] } } }] });
  await page.goto(`/companies/${companyId}`); await page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete company?' });
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog.getByText('3 tasks still reference this company. Reassign or delete them first.')).toBeVisible();
  await expect(dialog).toBeVisible(); await expect(page).toHaveURL(new RegExp(`/companies/${companyId}$`));
  expect(calls[1].body).toEqual({ id: companyId });
});

test('Delete is hidden without the delete flag', async ({ page }) => {
  await mock(page, { 'companies.read': { ...(fixtures['companies.read'] as object), permissions: { read: true, write: true, delete: false, share: false } } });
  await page.goto(`/companies/${companyId}`);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.locator('.page-header').getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
});

test('timeline entries show Delete for notes with canDelete and open the dialog', async ({ page }) => {
  const entries = (fixtures['projects.timeline'] as { entries: any[] }).entries.map(entry => entry.kind === 'note' ? { ...entry, canDelete: true } : entry);
  await mock(page, { 'projects.timeline': { ...(fixtures['projects.timeline'] as object), entries, nextCursor: null } });
  const calls = await deleteMock(page, { 'notes.delete': [preview({ children: { tasks: 0, calls: 0, notes: 0, files: 2, subprojects: 0, associations: 0 } })] });
  await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Delete note?' }).getByText('2 attachments will be deleted.')).toBeVisible();
  expect(calls[0].body.dryRun).toBe(true);
});
