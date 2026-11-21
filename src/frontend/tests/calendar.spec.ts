import { test, expect, type Page } from '@playwright/test';
import { agenda, registry } from '../fixtures/data';
import { mock } from './helpers';

type Call = { name: string; body: any };
const callId = '30000000-0000-4000-8000-000000000001';
const taskId = '30000000-0000-4000-8000-000000000002';
const doneId = '30000000-0000-4000-8000-000000000007';
/** The fixture call (09:00 New York on 2026-10-08), a task due the next day and a completed call. */
const items = [
  { ...agenda.items[0], date: '2026-10-08T13:00:00Z', startAt: '2026-10-08T13:00:00Z', endAt: '2026-10-08T13:30:00Z' },
  { ...agenda.items[1], date: '2026-10-09T13:00:00Z', startAt: '2026-10-09T13:00:00Z', dueAt: '2026-10-09T13:00:00Z', endAt: '2026-10-09T13:00:00Z' },
  { id: doneId, kind: 'call', title: 'Finished vendor call', date: '2026-10-07T15:00:00Z', createdAt: null, startAt: '2026-10-07T15:00:00Z', endAt: '2026-10-07T15:30:00Z', completed: true },
];
const calendarMock = async (page: Page, update: { status: number; json: unknown } = { status: 200, json: { data: { ok: true } } }) => {
  const calls: Call[] = [];
  await mock(page);
  await page.route('**/api/v1/services/*/inbound', async route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2);
    const name = Object.keys(registry.services).find(key => registry.services[key] === id)!;
    if (!['dashboard.agenda', 'calls.read', 'calls.update', 'tasks.read', 'tasks.update'].includes(name)) return route.fallback();
    const body = route.request().postDataJSON(); calls.push({ name, body });
    if (name === 'dashboard.agenda') return route.fulfill({ json: { data: { ...agenda, windowStart: body.windowStart, items, overdue: [] } } });
    if (name === 'calls.read') return route.fulfill({ json: { data: { ...items[0], version: 3, billable: true, billed: false, followup: false, projectId: null, companyId: null, contactId: null, calleeId: null, taskId: null } } });
    if (name === 'tasks.read') return route.fulfill({ json: { data: { ...items[1], version: 5, billable: false, billed: false, body: 'Notes', startAt: items[1].startAt, endAt: items[1].dueAt, projectId: null, companyId: null, contactId: null, assigneeId: null } } });
    return route.fulfill(update);
  });
  return calls;
};
const names = (calls: Call[]) => calls.map(call => call.name);
const drag = async (page: Page, from: string, day: string) => {
  const source = (await page.locator(`.calendar-grid [data-record-id="${from}"]`).first().boundingBox())!; const target = (await page.locator(`.calendar-grid [data-date="${day}"]`).first().boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + source.height / 2); await page.mouse.down();
  await page.mouse.move(source.x + 40, source.y + source.height / 2 + 6, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 }); await page.mouse.up();
};

test('the month view shows the fixture call on its day and asks for the six-week grid', async ({ page }) => {
  const calls = await calendarMock(page); await page.goto('/calendar');
  const event = page.locator('[data-date="2026-10-08"] [data-record-id="' + callId + '"]').first();
  await expect(event).toBeVisible(); await expect(event).toContainText('Homepage wireframe review');
  const request = calls.find(call => call.name === 'dashboard.agenda')!.body;
  expect(request).toEqual({ windowStart: '2026-09-27', windowDays: 42 });
});
test('clicking an event navigates with the router, not a page load', async ({ page }) => {
  await calendarMock(page); await page.goto('/calendar');
  await page.evaluate(() => { (window as any).__stillHere = true; });
  await page.locator(`[data-record-id="${callId}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/calls/${callId}$`));
  expect(await page.evaluate(() => (window as any).__stillHere)).toBe(true);
});
test('the week and day views ask for seven days from the week Sunday', async ({ page }) => {
  const calls = await calendarMock(page); await page.goto('/calendar');
  await expect(page.locator(`[data-record-id="${callId}"]`).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Week view', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Week view', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Month view', exact: true })).toHaveAttribute('aria-selected', 'false');
  await expect.poll(() => calls.filter(call => call.name === 'dashboard.agenda').at(-1)!.body).toEqual({ windowStart: '2026-10-04', windowDays: 7 });
  await page.getByRole('tab', { name: 'Day view', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Day view', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Month view', exact: true })).toHaveAttribute('aria-selected', 'false');
  await expect.poll(() => calls.filter(call => call.name === 'dashboard.agenda').at(-1)!.body).toEqual({ windowStart: '2026-10-04', windowDays: 7 });
  await page.getByRole('tab', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'List view', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Month view', exact: true })).toHaveAttribute('aria-selected', 'false');
  await expect.poll(() => calls.filter(call => call.name === 'dashboard.agenda').at(-1)!.body).toEqual({ windowStart: '2026-10-04', windowDays: 7 });
  await expect(page.getByText('Homepage wireframe review')).toBeVisible();
});
test('completed items render muted', async ({ page }) => {
  await calendarMock(page); await page.goto('/calendar');
  const done = page.locator(`[data-record-id="${doneId}"]`).first(); await expect(done).toBeVisible();
  await expect(done.locator('.line-through')).toHaveCount(1);
  await expect(page.locator(`[data-record-id="${callId}"]`).first().locator('.line-through')).toHaveCount(0);
});
test('dropping a call on another day reads it then updates it with shifted dates', async ({ page }) => {
  const calls = await calendarMock(page); await page.goto('/calendar');
  await expect(page.locator(`[data-record-id="${callId}"]`).first()).toBeVisible();
  await drag(page, callId, '2026-10-14');
  await expect.poll(() => names(calls).filter(name => name.startsWith('calls.'))).toEqual(['calls.read', 'calls.update']);
  const update = calls.find(call => call.name === 'calls.update')!.body;
  expect(calls.find(call => call.name === 'calls.read')!.body).toEqual({ id: callId });
  expect(update).toMatchObject({ id: callId, version: 3, title: 'Homepage wireframe review', startAt: '2026-10-14T13:00:00.000Z', endAt: '2026-10-14T13:30:00.000Z', billable: true, billed: false, followup: false });
  await expect(page.getByText('Saved.')).toBeVisible();
});
test('dropping a task moves its due date', async ({ page }) => {
  const calls = await calendarMock(page); await page.goto('/calendar');
  await expect(page.locator(`[data-record-id="${taskId}"]`).first()).toBeVisible();
  await drag(page, taskId, '2026-10-15');
  await expect.poll(() => names(calls).filter(name => name.startsWith('tasks.'))).toEqual(['tasks.read', 'tasks.update']);
  expect(calls.find(call => call.name === 'tasks.update')!.body).toMatchObject({ id: taskId, version: 5, endAt: '2026-10-15T13:00:00.000Z', startAt: '2026-10-15T13:00:00.000Z' });
});
test('a refused update (409) puts the event back and shows the error toast', async ({ page }) => {
  const calls = await calendarMock(page, { status: 409, json: { error: { message: 'This record was changed by someone else.' } } }); await page.goto('/calendar');
  await expect(page.locator(`[data-record-id="${callId}"]`).first()).toBeVisible();
  await drag(page, callId, '2026-10-14');
  await expect.poll(() => names(calls)).toContain('calls.update');
  await expect(page.locator('.toast-error')).toContainText('changed');
  await expect(page.locator('.toast-region')).toHaveCSS('position', 'fixed');
  await expect(page.getByRole('button', { name: 'Dismiss notification' })).toBeVisible();
  await expect(page.locator(`[data-date="2026-10-08"] [data-record-id="${callId}"]`).first()).toBeVisible();
  await expect(page.locator(`[data-date="2026-10-14"] [data-record-id="${callId}"]`)).toHaveCount(0);
});
