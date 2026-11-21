import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, uploadAttachment } from './api';
import type { Attachment, AttachmentSummary } from './contracts';
import { DeleteAction } from './delete';
import { Button, CardBody, DetailList, EmptyState, ErrorState, FieldError, LoadingState, PageHeader, Panel, linkClass, mutedText } from './primitives';
import { Breadcrumb } from './ui/Breadcrumb';
import { useService } from './use-service';

const kilobytes = (bytes: number | null) => bytes == null ? null : bytes < 1024 ? `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}` : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
const when = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;

/** Attachment metadata. The platform has no download route for uploaded files yet, so the page says so instead of offering a dead control. */
export function AttachmentScreen() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const result = useService<Attachment>('files.read', { id });
  if (result.isPending) return <LoadingState rows={5} />;
  if (result.isError) return result.error instanceof ApiError && result.error.status === 404 ? <EmptyState action={<Link className={linkClass} to="/notes">Back to Notes</Link>}>This attachment could not be found.</EmptyState> : <ErrorState message="This attachment could not be loaded." retry={() => void result.refetch()} />;
  const file = result.data;
  const parents: [string, string, string | null | undefined][] = [
    ['Note', file.note ? `/notes/${file.note.id}` : '', file.note?.title], ['Project', file.projectId ? `/projects/${file.projectId}` : '', file.projectName || (file.projectId ? 'Project' : null)],
    ['Company', file.companyId ? `/companies/${file.companyId}` : '', file.companyName || (file.companyId ? 'Company' : null)], ['Contact', file.contactId ? `/contacts/${file.contactId}` : '', file.contactName || (file.contactId ? 'Contact' : null)],
    ['Task', file.taskId ? `/tasks/${file.taskId}` : '', file.taskId ? 'Task' : null], ['Call', file.callId ? `/calls/${file.callId}` : '', file.callId ? 'Call' : null]];
  const present = parents.filter(([, href, label]) => href && label);
  const details = [['Type', file.contentType], ['Size', kilobytes(file.byteSize)], ['File reference', file.checksum], ['Uploaded', when(file.createdAt)], ['Uploaded by', file.uploaderName], ['Status', file.unavailableReason]].filter(([, value]) => value).map(([label, value]) => ({ label: label as string, value }));
  return <><div className="breadcrumbs mb-4"><Breadcrumb items={[{ label: 'Notes', to: '/notes' }, ...(file.note ? [{ label: file.note.title, to: `/notes/${file.note.id}` }] : [])]} current={file.originalFilename} /></div>
    <PageHeader recordId={id} title={file.originalFilename} subtitle="Attachment" actions={file.permissions.delete && <DeleteAction kind="file" id={id} name={file.originalFilename} onDeleted={() => navigate('/notes')} />} />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Panel title="Details"><DetailList rows={details} /></Panel>
      <aside aria-label="Attachment details" className="flex min-w-0 flex-col gap-6">
        {present.length > 0 && <Panel title="Attached to"><DetailList rows={present.map(([label, href, text]) => ({ label, value: <Link className={linkClass} to={href}>{text}</Link> }))} /></Panel>}
        <Panel title="Download"><CardBody><p className={mutedText}>Downloads are not available on this platform yet.</p></CardBody></Panel>
      </aside></div></>;
}

/** Attachments on a note: lists them and, when the viewer can write the note, adds one through the authenticated form route (deviation I-1). */
export function AttachmentsPanel({ noteId, attachments, canWrite }: { noteId: string; attachments: AttachmentSummary[]; canWrite: boolean }) {
  const client = useQueryClient(); const input = useRef<HTMLInputElement>(null); const [error, setError] = useState<string | null>(null);
  const upload = useMutation({ mutationFn: (file: File) => uploadAttachment(noteId, file), onSuccess: () => { setError(null); void client.invalidateQueries({ queryKey: ['notes.read'] }); void client.invalidateQueries({ predicate: query => typeof query.queryKey[0] === 'string' && query.queryKey[0].endsWith('.timeline') }); },
    onError: (e: Error) => setError(e instanceof ApiError ? e.message : 'The attachment could not be added.'), onSettled: () => { if (input.current) input.current.value = ''; } });
  const choose = (file: File | undefined) => { if (file && !upload.isPending) { setError(null); upload.mutate(file); } };
  return <Panel title="Attachments">
    {attachments.length ? <ul className="attachment-list flex flex-col gap-2 p-5 text-sm sm:px-6">{attachments.map(file => <li key={file.id}><Link className={linkClass} to={`/files/${file.id}`}>{file.originalFilename}</Link>{kilobytes(file.byteSize) && <span className={`tabular-nums ${mutedText}`}> {kilobytes(file.byteSize)}</span>}</li>)}</ul> : <CardBody><p className={mutedText}>No attachments yet.</p></CardBody>}
    {canWrite && <CardBody className="items-start"><input ref={input} type="file" hidden aria-label="Attachment file" onChange={event => choose(event.target.files?.[0])} /><Button busy={upload.isPending} onClick={() => input.current?.click()}>Add attachment</Button>{error && <FieldError>{error}</FieldError>}</CardBody>}
  </Panel>;
}
