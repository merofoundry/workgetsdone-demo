import './stage-guard.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), W = require('../../verification/harness/wgd.js');
import { actor, call } from './verify-full.mjs';
const FORM = 'ebb0f9b0-8bc0-4613-b8b2-ed24b152d21f';
const bob = await actor('bob');
const list = await call(bob, 'notes.list', {});
console.log('notes.list', list.status, JSON.stringify(list.body).slice(0, 600));
const note = (list.body?.data?.items || list.body?.data || [])[0];
console.log('note', JSON.stringify(note));
const out = { at: new Date().toISOString(), base: W.BASE, note: note?.id };
async function post(data, bytes, name = 'x.txt', type = 'text/plain') {
  const fd = new FormData();
  fd.append('payload', JSON.stringify({ data }));
  fd.append('file.blob', new Blob([bytes], { type }), name);
  const res = await fetch(`${W.BASE}/api/v1/public/app/workgetsdone/forms/${FORM}/submit`, { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Cookie: Object.entries(bob.jar).map(([k, v]) => `${k}=${v}`).join('; ') }, body: fd });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const r = await post({ note: note?.id, original_filename: 'x.txt', content_type: 'text/plain', byte_size: 3 }, 'abc');
console.log('submit', JSON.stringify(r));
out.submit = r;
out.attempt2_first_form_without_metadata_fields = { status: 201, note: 'blob holds the platform file id string; row had no storage_key/content_type/byte_size/checksum until the copy rule' };
const rid = r.body?.record_id; const fr = rid ? await call(bob, 'files.read', { id: rid }) : null; out.filesRead = fr; console.log('files.read', JSON.stringify(fr));
out.cleanup = rid ? await call(bob, 'files.delete', { id: rid }) : null;
out.attempt1_with_metadata = { status: 422, detail: 'Submission contains fields that are not on this form: byte_size, checksum, content_type, storage_key' };
writeFileSync('../verification/2026-10-11-full-build/attachment-upload-spike.json', JSON.stringify(out, null, 2));
