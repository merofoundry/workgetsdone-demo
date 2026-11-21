import { test, expect, type Page } from '@playwright/test';
import { companyId, registry } from '../fixtures/data';
import { mock } from './helpers';
const bodies = (page: Page, service: string) => {
  const seen: Record<string, unknown>[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes(`/services/${registry.services[service]}/inbound`)) seen.push(request.postDataJSON()); });
  return seen;
};
const project = '10000000-0000-4000-8000-000000000001';
test('task filters round-trip in the URL and the request body, and Clear filters resets the URL', async ({ page }) => {
  await mock(page); const seen = bodies(page, 'tasks.list'); await page.goto('/tasks');
  await page.getByLabel('Billable').check(); await expect(page).toHaveURL(/billable=1/);
  await page.getByLabel('From').fill('2026-10-01'); await expect(page).toHaveURL(/from=2026-10-01/);
  await page.getByLabel('Sort by').selectOption('title'); await expect(page).toHaveURL(/sort=title/);
  await expect.poll(() => seen.at(-1)).toMatchObject({ billable: true, from: '2026-10-01', sort: 'title', pageSize: 25 });
  await page.goto(`/tasks?projectId=${project}`);
  await expect.poll(() => seen.at(-1)).toMatchObject({ projectId: project });
  await expect(page.getByLabel('Project')).toHaveValue('Linked record');
  await page.goto('/tasks?billable=1&sort=due');
  await expect(page.getByLabel('Billable')).toBeChecked(); await expect(page.getByLabel('Sort by')).toHaveValue('due');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/tasks$/); await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
});
test('an empty filtered list says no tasks match these filters, an unfiltered one keeps its own message', async ({ page }) => {
  await mock(page, { 'tasks.list': { items: [], total: 0, nextCursor: null } });
  await page.goto('/tasks'); await expect(page.getByText('No tasks in this view yet.')).toBeVisible();
  await page.goto('/tasks?billable=1'); await expect(page.getByText('No tasks match these filters.')).toBeVisible();
});
test('an unknown parameter is ignored by the interface, and a refused request shows the error state', async ({ page }) => {
  await mock(page); const seen = bodies(page, 'tasks.list'); await page.goto('/tasks?foo=1');
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible(); await expect.poll(() => seen.length).toBeGreaterThan(0);
  expect(seen.every(body => !('foo' in body))).toBe(true); await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
  const failing = await page.context().newPage(); await mock(failing);
  await failing.route(`**/api/v1/services/${registry.services['tasks.list']}/inbound`, route => route.fulfill({ status: 422, json: { error: { message: 'The supplied filter or identifier is not valid.' } } }));
  await failing.goto('/tasks?billable=1'); await expect(failing.getByRole('alert')).toContainText('Your tasks could not be loaded.');
});
test('projects status, notes parent kind and contacts company filters reach their services', async ({ page }) => {
  await mock(page); const projects = bodies(page, 'projects.list'), notes = bodies(page, 'notes.list'), contacts = bodies(page, 'contacts.list');
  await page.goto('/projects'); await page.getByLabel('Status').selectOption('ON_SCHEDULE'); await expect(page).toHaveURL(/status=ON_SCHEDULE/);
  await expect.poll(() => projects.at(-1)).toMatchObject({ status: 'ON_SCHEDULE' });
  await page.goto('/notes'); await page.getByLabel('Attached to').selectOption('project'); await expect(page).toHaveURL(/parentKind=project/);
  await expect.poll(() => notes.at(-1)).toMatchObject({ parentKind: 'project' });
  await page.goto(`/contacts?companyId=${companyId}&sort=firstName`);
  await expect.poll(() => contacts.at(-1)).toMatchObject({ companyId, sort: 'firstName' });
  await page.goto('/companies'); await page.getByLabel('Sort by').selectOption('city'); await expect(page).toHaveURL(/sort=city/);
});
