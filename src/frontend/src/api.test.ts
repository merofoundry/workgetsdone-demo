import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, submitForm, uploadAttachment, MAX_ATTACHMENT_BYTES, ApiError } from './api';
afterEach(() => vi.unstubAllGlobals());
describe('same-origin API boundary', () => {
  it('sends cookies and CSRF protection on service writes', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetch);
    await apiFetch('/api/v1/services/example/inbound', { method: 'POST', body: '{}' });
    const request = fetch.mock.calls[0][1]; expect(request.credentials).toBe('include'); expect(request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
  });
  it.each(['https://example.com/steal', '//example.com/steal', 'relative'])('refuses non-origin path %s', async path => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(apiFetch(path)).rejects.toThrow('same-origin'); expect(fetch).not.toHaveBeenCalled();
  });
});

describe('submitForm', () => {
  const FORM = '2b149237-3d50-407d-a6b7-e87978ac59e0';
  it('posts {data} to the same-origin form route with CSRF protection', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 201 })); vi.stubGlobal('fetch', fetch);
    await submitForm(FORM, { email: 'a@example.test' });
    expect(fetch.mock.calls[0][0]).toBe(`/api/v1/public/app/workgetsdone/forms/${FORM}/submit`);
    const request = fetch.mock.calls[0][1]; expect(request.method).toBe('POST'); expect(request.headers.get('X-Requested-With')).toBe('XMLHttpRequest'); expect(JSON.parse(request.body)).toEqual({ data: { email: 'a@example.test' } });
  });
  it('rejects a form id that is not a uuid before any request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(submitForm('../x', {})).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it('turns refusals into ApiErrors without echoing the submitted data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Only an administrator may create a user account' } }), { status: 422 })));
    await expect(submitForm(FORM, { password: 'secret-value-123' })).rejects.toMatchObject({ status: 422, message: 'Only an administrator may create a user account' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    const error = await submitForm(FORM, { password: 'secret-value-123' }).catch(e => e); expect(error).toBeInstanceOf(ApiError); expect(error.message).not.toContain('secret');
  });
});
describe('uploadAttachment', () => {
  const NOTE = '40000000-0000-4000-8000-000000000001';
  it('posts multipart with payload and file.blob and returns the record id', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ record_id: 'r1' }), { status: 201 })); vi.stubGlobal('fetch', fetch);
    await expect(uploadAttachment(NOTE, new File(['abc'], 'x.txt', { type: 'text/plain' }))).resolves.toBe('r1');
    const [url, init] = fetch.mock.calls[0]; expect(url).toMatch(/\/forms\/[0-9a-f-]+\/submit$/); expect(init.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(init.body).toBeInstanceOf(FormData); expect(JSON.parse(init.body.get('payload'))).toEqual({ data: { note: NOTE, original_filename: 'x.txt', content_type: 'text/plain', byte_size: 3 } }); expect((init.body.get('file.blob') as File).name).toBe('x.txt');
  });
  it('refuses an oversize or empty file before any request', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(uploadAttachment(NOTE, { size: MAX_ATTACHMENT_BYTES + 1, name: 'a', type: '' } as File)).rejects.toMatchObject({ status: 413 });
    await expect(uploadAttachment(NOTE, new File([], 'a'))).rejects.toMatchObject({ status: 422 });
    await expect(uploadAttachment('x', new File(['a'], 'a'))).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
  });
  it('maps refusals to messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })));
    await expect(uploadAttachment(NOTE, new File(['a'], 'a'))).rejects.toMatchObject({ status: 404, message: 'You cannot add attachments to this note.' });
  });
});
