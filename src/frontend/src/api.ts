import type { ServiceRegistry } from './contracts';
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: string[], public reasons?: { kind: string; count: number }[]) { super(message); }
}
export async function apiFetch(path: string, options: RequestInit = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('API paths must be same-origin');
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (method !== 'GET' && method !== 'HEAD') headers.set('X-Requested-With', 'XMLHttpRequest');
  return fetch(path, { ...options, method, headers, credentials: 'include' });
}
let registryPromise: Promise<ServiceRegistry> | undefined;
function registry() {
  return registryPromise ??= apiFetch('/services.json').then(async response => {
    if (!response.ok) throw new ApiError(response.status, 'Application configuration could not be loaded.');
    const data = await response.json() as ServiceRegistry;
    if (!data.services || typeof data.applicationId !== 'string') throw new ApiError(502, 'Application configuration is invalid.');
    return data;
  }).catch(error => { registryPromise = undefined; throw error; });
}
/** The Google sign-in start link, or null when the registry has no session.googleStart (no dead control). */
export async function googleStartHref(): Promise<string | null> {
  const config = await registry(); const id = config.services['session.googleStart'];
  return id ? `/api/v1/services/${encodeURIComponent(id)}/inbound` : null;
}
export async function service<T>(name: string, input: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const config = await registry();
  const id = config.services[name];
  if (name === 'session.googleStart' && id) return { href: `/api/v1/services/${encodeURIComponent(id)}/inbound` } as T;
  // MeroFoundry's identity submission routes set and clear HttpOnly cookies.
  // They remain available when a site is closed; no token is read from them.
  if (config.identity && (name === 'session.login' || name === 'session.destroy')) {
    const model = name === 'session.login' ? config.identity.loginModelId : config.identity.logoutModelId;
    const response = await apiFetch(`/api/v1/models/${encodeURIComponent(model)}/records?application_id=${encodeURIComponent(config.applicationId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: name === 'session.login' ? { email: input.email, password: input.password } : {} }), signal });
    if (!response.ok) throw new ApiError(response.status, name === 'session.login' ? 'Sign-in could not be completed. Check your email and password.' : 'Sign-out could not be completed. Please try again.');
    return { ok: true } as T;
  }
  if (!id) throw new ApiError(503, 'This part of WorkGetsDone is temporarily unavailable.');
  const response = await apiFetch(`/api/v1/services/${encodeURIComponent(id)}/inbound`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 404 || response.status === 403 ? 'This record could not be found.' : response.status === 401 ? 'Please sign in again.' : typeof body?.error?.message === 'string' ? body.error.message : 'The request could not be completed. Please try again.';
    if (response.status === 401) window.dispatchEvent(new Event('wgd:session-expired'));
    throw new ApiError(response.status === 403 ? 404 : response.status, message, Array.isArray(body?.error?.fields) ? body.error.fields.filter((f: unknown) => typeof f === 'string') : undefined, Array.isArray(body?.error?.reasons) ? body.error.reasons.filter((r: any) => r && typeof r.kind === 'string' && typeof r.count === 'number') : undefined);
  }
  if (body === null) throw new ApiError(502, 'The server returned an unreadable response.');
  return (body.data ?? body) as T;
}

/** Authenticated form submission (administrator account creation, deviation H-2). The route hashes credential fields; the body is never echoed. */
export async function submitForm(formId: string, data: Record<string, unknown>, signal?: AbortSignal): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId)) throw new Error('Invalid form id');
  const response = await apiFetch(`/api/v1/public/app/workgetsdone/forms/${formId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }), signal });
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  if (response.status === 401) window.dispatchEvent(new Event('wgd:session-expired'));
  const message = response.status === 401 ? 'Please sign in again.' : response.status === 403 || response.status === 404 ? 'Only an administrator can create accounts.' : typeof body?.error?.message === 'string' ? body.error.message : 'The account could not be created. Check the details and try again.';
  throw new ApiError(response.status, message);
}

export const ATTACHMENT_FORM = 'ebb0f9b0-8bc0-4613-b8b2-ed24b152d21f';
// The platform edge refuses request bodies somewhere between 12 and 15 MB (probed 2026-10-11: 12 MB accepted, 15 MB refused with a bodiless 413); the 25 MB record rule trusts the declared size.
export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Attachment upload (deviation I-1): no inbound service accepts bytes, so the browser posts multipart (`payload` JSON + `file.blob`) to the authenticated form route. Resolves with the new attachment record id. */
export async function uploadAttachment(noteId: string, file: File, signal?: AbortSignal): Promise<string> {
  if (!idPattern.test(noteId)) throw new Error('Invalid note id');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new ApiError(413, 'This file is larger than the 12 MB limit.');
  if (file.size === 0) throw new ApiError(422, 'This file is empty.');
  const body = new FormData();
  body.set('payload', JSON.stringify({ data: { note: noteId, original_filename: file.name.slice(0, 255), content_type: (file.type || 'application/octet-stream').slice(0, 127), byte_size: file.size } }));
  body.set('file.blob', file, file.name);
  const response = await apiFetch(`/api/v1/public/app/workgetsdone/forms/${ATTACHMENT_FORM}/submit`, { method: 'POST', body, signal });
  const result = await response.json().catch(() => null);
  if (response.ok && typeof result?.record_id === 'string') return result.record_id;
  if (response.status === 401) window.dispatchEvent(new Event('wgd:session-expired'));
  const message = response.status === 401 ? 'Please sign in again.' : response.status === 413 ? 'This file is larger than the limit.' : response.status === 403 || response.status === 404 ? 'You cannot add attachments to this note.' : 'The attachment could not be added. Check the file name and try again.';
  throw new ApiError(response.status, message);
}
