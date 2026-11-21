import { test, expect } from '@playwright/test';
import { projectId, registry, timeline } from '../fixtures/data';
import { mock } from './helpers';

const noteId = '40000000-0000-4000-8000-000000000001';
const taskId = '50000000-0000-4000-8000-0000000000aa';
const convertibleTimeline = { ...timeline, entries: timeline.entries.map(entry => entry.id === noteId ? { ...entry, canWrite: true, canConvertToTask: true } : entry) };

test('Convert to task sends a client reference and opens the new task', async ({ page }) => {
  await mock(page, { 'projects.timeline': convertibleTimeline });
  const bodies: any[] = [];
  await page.route('**/api/v1/services/' + registry.services['notes.convertToTask'] + '/inbound', route => { bodies.push(route.request().postDataJSON()); return route.fulfill({ json: { data: { ok: true, id: taskId, sharedWith: [] } } }); });
  await page.goto('/projects/' + projectId);
  await page.getByRole('button', { name: 'Convert to task' }).click();
  await expect(page).toHaveURL(new RegExp('/tasks/' + taskId + '$'));
  expect(bodies).toHaveLength(1);
  expect(bodies[0].id).toBe(noteId);
  expect(bodies[0].clientRef).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('a converted note links to its task and offers no conversion', async ({ page }) => {
  const note = { ...(convertibleTimeline.entries.find(entry => entry.id === noteId) as object), id: noteId, canWrite: true, canConvertToTask: false, archived: true, convertedTaskId: taskId };
  await mock(page, { 'notes.read': note });
  await page.goto('/notes/' + noteId);
  await expect(page.getByRole('heading', { name: 'Converted to task' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the task' })).toHaveAttribute('href', '/tasks/' + taskId);
  await expect(page.getByRole('button', { name: 'Convert to task' })).toHaveCount(0);
});

test('an unconverted note detail offers the conversion', async ({ page }) => {
  const note = { ...(convertibleTimeline.entries.find(entry => entry.id === noteId) as object), id: noteId, canWrite: true, canConvertToTask: true };
  await mock(page, { 'notes.read': note });
  await page.goto('/notes/' + noteId);
  await expect(page.getByRole('button', { name: 'Convert to task' })).toBeVisible();
});
