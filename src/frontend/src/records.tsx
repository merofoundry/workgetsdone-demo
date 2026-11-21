import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, service } from './api';
import type { CreateKind, Entry, ProjectSummary } from './contracts';
import { ConfirmDialog } from './dialogs';
import { FilterBar, filterInput, filterKeys, isFiltered, rowLinkClass } from './filters';
import { DeleteAction } from './delete';
import { CreateActions } from './overview';
import { AccessCard } from './sharing';
import { AttachmentsPanel } from './attachment';
import { TimelineEntry } from './timeline';
import { Button, CardBody, DetailList, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Panel, SearchField, StatusTag, Tag, linkClass, mutedText } from './primitives';
import { Breadcrumb } from './ui/Breadcrumb';
import { Checkbox } from './ui/Checkbox';
import { useService } from './use-service';
import { useUI, usePageParent } from './ui-context';

type Collection = 'projects' | 'tasks' | 'calls' | 'notes';
type List<T> = { items: T[]; total: number; nextCursor: string | null };
const title = (collection: Collection) => collection[0].toUpperCase() + collection.slice(1);
function useRecordActions() {
  const ui = useUI(); const client = useQueryClient(); const navigate = useNavigate();
  const [confirm, setConfirm] = useState<{ name: string; entry: Entry } | null>(null);
  const mutation = useMutation({ mutationFn: ({ name, entry }: { name: string; entry: Entry }) => name === 'notes.convertToTask' ? service<{ id: string }>(name, { id: entry.id, clientRef: crypto.randomUUID() }) : service(name, { id: entry.id }), onSuccess: (result, { name }) => { void client.invalidateQueries(); setConfirm(null); ui.notify(name === 'notes.convertToTask' ? 'Converted to task.' : 'Saved.'); if (name === 'notes.convertToTask' && result && typeof (result as { id?: unknown }).id === 'string') navigate(`/tasks/${(result as { id: string }).id}`); }, onError: error => ui.notify(error.message, true) });
  useEffect(() => { ui.setDialogOpen(!!confirm); return () => ui.setDialogOpen(false); }, [confirm]);
  return { action: (name: string, entry: Entry) => { if (!mutation.isPending) { if (name === 'notes.archive') setConfirm({ name, entry }); else mutation.mutate({ name, entry }); } }, dialog: confirm && <ConfirmDialog title="Archive note?" message="You can find it again by including archived notes." busy={mutation.isPending} close={() => setConfirm(null)} confirm={() => mutation.mutate(confirm)} /> };
}
export function RecordList({ collection }: { collection: Collection }) {
  const [params, setParams] = useSearchParams(); const ui = useUI(); const actions = useRecordActions();
  const includeClosed = params.get('closed') === '1'; const query = params.get('q') || '';
  const cursor = /^\d+$/.test(params.get('cursor') || '') ? Number(params.get('cursor')) : 0;
  const filters = filterInput(collection, params);
  const result = useService<List<Entry | ProjectSummary>>(`${collection}.list`, { includeClosed, query, cursor: Math.min(cursor, 10000), pageSize: 25, ...filters });
  const clear = () => setParams(current => { const next = new URLSearchParams(current); next.delete('cursor'); for (const key of filterKeys(collection)) next.delete(key); return next; });
  const update = (field: string, value: string) => setParams(current => { const next = new URLSearchParams(current); next.delete('cursor'); if (value) next.set(field, value); else next.delete(field); return next; });
  const closedLabel = collection === 'projects' || collection === 'notes' ? 'Include archived' : 'Include completed';
  return <><PageHeader title={title(collection)} subtitle={result.data ? `${result.data.total} ${collection} ${isFiltered(filters) ? 'match these filters' : 'in this view'}` : `Your ${collection}, in one place`} actions={<Button variant="primary" onClick={() => ui.openCreate(collection.slice(0, -1) as CreateKind)}>New {collection.slice(0, -1)}</Button>} />
    <Panel>
      <SearchField collection={collection} query={query} update={update} extra={<Checkbox label={closedLabel} checked={includeClosed} onChange={event => update('closed', event.target.checked ? '1' : '')} />} />
      <FilterBar collection={collection} params={params} update={update} clear={clear} />
      {result.isPending ? <LoadingState rows={5} /> : result.isError ? <div className="p-4"><ErrorState message={`Your ${collection} could not be loaded.`} retry={() => void result.refetch()} /></div> : !result.data.items.length ? <EmptyState>{isFiltered(filters) ? `No ${collection} match these filters.` : query ? `No ${collection} match your search.` : `No ${collection} in this view yet.`}</EmptyState>
        : <ul className="divide-y divide-gray-100 dark:divide-gray-800">{result.data.items.map(item => collection === 'projects'
          ? <li key={item.id}><Link className={`record-project ${rowLinkClass}`} to={`/projects/${item.id}`} data-record-id={item.id}><div className="min-w-0 flex-1 wrap-anywhere"><strong className="font-medium">{(item as ProjectSummary).name}</strong><span className={`mt-1 block ${mutedText}`}>{item.companyName || 'No company linked'}</span></div><StatusTag status={(item as ProjectSummary).status} /><span className={`basis-full tabular-nums sm:basis-auto ${mutedText}`}>{(item as ProjectSummary).openTasks} tasks · {(item as ProjectSummary).openCalls} calls · {(item as ProjectSummary).notes} notes</span></Link></li>
          : <li key={item.id} className="record-entry" data-record-id={item.id}><TimelineEntry entry={item as Entry} action={actions.action} compact />{(item as Entry).projectId && (item as Entry).projectName && <Link className={`record-context mb-3 ml-5 inline-block text-sm sm:ml-6 ${linkClass}`} to={`/projects/${(item as Entry).projectId}`}>{(item as Entry).projectName}</Link>}</li>)}</ul>}
      {result.data && (cursor > 0 || result.data.nextCursor) && <Pagination cursor={cursor} next={result.data.nextCursor} update={update} />}
    </Panel>{actions.dialog}</>;
}
export function RecordDetail({ collection }: { collection: Exclude<Collection, 'projects'> }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const ui = useUI(); const result = useService<Entry>(`${collection}.read`, { id }); const actions = useRecordActions(); const singular = collection.slice(0, -1) as 'task' | 'call' | 'note'; usePageParent(singular === 'call' ? 'call' : 'task', id, singular === 'note' ? null : result.data?.title);
  if (result.isPending) return <LoadingState rows={5} />;
  if (result.isError) return result.error instanceof ApiError && result.error.status === 404 ? <EmptyState action={<Link className={linkClass} to={`/${collection}`}>Back to {title(collection)}</Link>}>This {collection.slice(0, -1)} could not be found.</EmptyState> : <ErrorState message={`This ${collection.slice(0, -1)} could not be loaded.`} retry={() => void result.refetch()} />;
  const entry = result.data; const format = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const rows = [['Starts', format(entry.startAt)], ['Due', format(entry.dueAt)], ['Occurred', collection === 'notes' ? format(entry.date) : null], ['Contact', entry.personName], ['Company', entry.companyName], ['Duration', entry.durationMinutes == null ? null : `${entry.durationMinutes} minutes`], ['Billable', collection === 'notes' ? null : entry.billable ? 'Yes' : 'No']].filter(([, value]) => value).map(([label, value]) => ({ label: label as string, value }));
  const main = [entry.convertedTaskId && <Panel key="converted" title="Converted to task"><CardBody><p>This note became a task. <Link className={linkClass} to={`/tasks/${entry.convertedTaskId}`}>Open the task</Link></p></CardBody></Panel>,
    entry.body && <Panel key="body" title={collection === 'notes' ? 'Note' : collection === 'calls' ? 'Follow-up' : 'Description'}><div className="record-body max-w-prose p-5 text-sm whitespace-pre-wrap wrap-anywhere text-gray-700 sm:px-6 dark:text-gray-300">{entry.body}</div></Panel>,
    collection === 'notes' && <AttachmentsPanel key="attachments" noteId={id} attachments={entry.attachments ?? []} canWrite={!!entry.canWrite} />].filter(Boolean);
  return <><div className="breadcrumbs mb-4"><Breadcrumb items={[{ label: title(collection), to: `/${collection}` }]} current={entry.title} /></div>
    <PageHeader recordId={id} title={entry.title} subtitle={[entry.personName, entry.companyName].filter(Boolean).join(' · ') || title(collection).slice(0, -1)} actions={(entry.canWrite || entry.canDelete) && <>{entry.canWrite && <><Button onClick={() => ui.openEdit(singular, entry)}>Edit</Button>{singular !== 'note' && <CreateActions parent={{ kind: singular, id, name: entry.title }} />}{entry.canConvertToTask && <Button onClick={() => actions.action('notes.convertToTask', entry)}>Convert to task</Button>}<Button onClick={() => actions.action(`${collection}.${collection === 'notes' ? entry.archived ? 'unarchive' : 'archive' : entry.completed ? 'reopen' : 'complete'}`, entry)}>{collection === 'notes' ? entry.archived ? 'Unarchive' : 'Archive' : entry.completed ? 'Reopen' : 'Mark complete'}</Button></>}{entry.canDelete && <DeleteAction kind={singular} id={id} name={entry.title} onDeleted={() => navigate(`/${collection}`)} />}</>} />
    <div className={main.length ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]' : 'max-w-xl'}>
      {main.length > 0 && <div className="flex min-w-0 flex-col gap-6">{main}</div>}
      <aside aria-label="Record details" className="details-rail flex min-w-0 flex-col gap-6">
        <Panel title="Details"><DetailList rows={[{ label: 'Status', value: <Tag>{collection === 'notes' ? entry.archived ? 'Archived' : 'Active' : entry.completed ? 'Completed' : 'Open'}</Tag> }, ...(entry.projectId && entry.projectName ? [{ label: 'Project', value: <Link className={linkClass} to={`/projects/${entry.projectId}`}>{entry.projectName}</Link> }] : []), ...rows]} /></Panel>
        {entry.canShare && <AccessCard kind={singular} id={id} />}
      </aside></div>{actions.dialog}
  </>;
}
