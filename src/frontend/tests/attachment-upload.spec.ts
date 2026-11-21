import { test, expect } from '@playwright/test';
import { fixtures, noteIdForFile } from '../fixtures/data';
import { mock } from './helpers';

const note = fixtures['notes.read'] as Record<string, any>;
const withNote = (extra: object) => ({ 'notes.read': { ...note, id: noteIdForFile, canWrite: true, ...extra } });
const formRoute = '**/api/v1/public/app/workgetsdone/forms/*/submit';
const listed = [{ id: '70000000-0000-4000-8000-000000000001', originalFilename: 'scope.txt', byteSize: 2048, contentType: 'text/plain' }, { id: '70000000-0000-4000-8000-000000000003', originalFilename: 'tiny.txt', byteSize: 3, contentType: 'text/plain' }];

test('the note page lists attachments and links to each', async ({ page }) => {
  await mock(page, withNote({ attachments: listed }));
  await page.goto('/notes/' + noteIdForFile);
  const panel = page.getByRole('region', { name: 'Attachments' });
  await expect(panel.getByRole('link', { name: 'scope.txt' })).toHaveAttribute('href', '/files/' + listed[0].id);
  await expect(panel.getByText('2 KB')).toBeVisible();
  await expect(panel.getByText('3 bytes')).toBeVisible();
});

test('a writer adds an attachment as multipart with payload and file.blob parts', async ({ page }) => {
  await mock(page, withNote({ attachments: [] }));
  let request: { headers: Record<string, string>; body: string } | null = null;
  await page.route(formRoute, async route => { request = { headers: route.request().headers(), body: route.request().postDataBuffer()!.toString('latin1') }; await route.fulfill({ status: 201, json: { success: true, record_id: '70000000-0000-4000-8000-000000000002' } }); });
  await page.goto('/notes/' + noteIdForFile);
  await expect(page.getByText('No attachments yet.')).toBeVisible();
  await page.getByLabel('Attachment file').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await expect.poll(() => request).not.toBeNull();
  expect(request!.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  expect(request!.headers['x-requested-with']).toBe('XMLHttpRequest');
  expect(request!.body).toContain('name="payload"');
  expect(request!.body).toContain('name="file.blob"; filename="x.txt"');
  const payload = JSON.parse(request!.body.split('name="payload"')[1].split('\r\n\r\n')[1].split('\r\n--')[0]);
  expect(payload).toEqual({ data: { note: noteIdForFile, original_filename: 'x.txt', content_type: 'text/plain', byte_size: 3 } });
});

test('a reader has no Add attachment control', async ({ page }) => {
  await mock(page, withNote({ canWrite: false, attachments: listed }));
  await page.goto('/notes/' + noteIdForFile);
  await expect(page.getByRole('link', { name: 'scope.txt' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add attachment' })).toHaveCount(0);
});

test('a file over 12 MB is refused before any request', async ({ page }) => {
  await mock(page, withNote({ attachments: [] }));
  let posted = false; await page.route(formRoute, route => { posted = true; return route.fulfill({ status: 201, json: {} }); });
  await page.goto('/notes/' + noteIdForFile);
  await page.getByLabel('Attachment file').setInputFiles({ name: 'big.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(12 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toHaveText('This file is larger than the 12 MB limit.');
  expect(posted).toBe(false);
});

test('a refusal shows a clear message', async ({ page }) => {
  await mock(page, withNote({ attachments: [] }));
  await page.route(formRoute, route => route.fulfill({ status: 404, json: { detail: 'not found' } }));
  await page.goto('/notes/' + noteIdForFile);
  await page.getByLabel('Attachment file').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await expect(page.getByRole('alert')).toHaveText('You cannot add attachments to this note.');
});
