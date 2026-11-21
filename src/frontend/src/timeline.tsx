import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { service } from './api';
import type { Entry, FilterKind, Parent, Timeline } from './contracts';
import { daysLate, entryHref, relativeDate } from './dates';
import { ConfirmDialog } from './dialogs';
import { DeleteAction } from './delete';
import { Button, ChipButton, EmptyState, ErrorState, FieldError, LoadingState, Panel, SectionStrip, Tag, linkClass, mutedText } from './primitives';
import { Badge, type BadgeColor } from './ui/Badge';
import { Checkbox } from './ui/Checkbox';
import { Input } from './ui/Input';
import { cn } from './utils';
import { useUI } from './ui-context';

const kindColor: Record<Entry['kind'], BadgeColor> = { task: 'success', call: 'primary', note: 'light', file: 'info' };
export function TimelineEntry({ entry, action, compact = false }: { entry: Entry; action: (name: string, entry: Entry) => void; compact?: boolean }) {
  const isLate = entry.kind === 'task' && !entry.completed && entry.dueAt && daysLate(entry.dueAt) > 0;
  const state = entry.kind === 'task' || entry.kind === 'call' ? entry.completed ? 'completed' : entry.kind === 'call' && entry.startAt && new Date(entry.startAt) > new Date() ? 'upcoming' : 'open' : entry.archived ? 'archived' : '';
  const late = 'text-error-600 dark:text-error-400';
  return <article className="timeline-entry flex flex-col gap-1 px-5 py-4 sm:flex-row sm:gap-4 sm:px-6">
    <div className={cn('timeline-date w-24 shrink-0 pt-0.5 text-xs tabular-nums', isLate ? late : 'text-gray-500 dark:text-gray-400')}>{relativeDate(entry.date)}</div>
    <div className="timeline-body min-w-0 flex-1">
      <div className="kind-caption flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400"><Badge color={kindColor[entry.kind]}>{entry.kind}</Badge>{(state || entry.source) && <span>{[state, entry.source].filter(Boolean).join(' · ')}</span>}</div>
      <div className="entry-heading mt-1 flex flex-wrap items-center gap-2"><Link to={entryHref(entry)} className={cn('entry-title font-medium wrap-anywhere', linkClass)}>{entry.title}</Link>{entry.billable && <Tag variant="billable">Billable</Tag>}{isLate && <Tag variant="late">Late</Tag>}</div>
      {entry.body && <p className={cn('note-body mt-1 max-w-prose text-sm whitespace-pre-wrap wrap-anywhere text-gray-700 dark:text-gray-300', compact && 'line-clamp-3')}>{entry.body}</p>}
      <div className={cn('entry-metadata mt-1 flex flex-wrap gap-3 text-xs', mutedText)}>{entry.personName && <span>{entry.personName}</span>}{isLate && <span className={late}>{daysLate(entry.dueAt!)} days late</span>}{entry.durationMinutes != null && <span>{entry.durationMinutes} minutes</span>}{entry.attachmentCount ? <span>{entry.attachmentCount} attachments</span> : null}{entry.byteSize != null && <span>{Intl.NumberFormat(undefined, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 1 }).format(entry.byteSize / 1024)}</span>}{entry.uploaderName && <span>{entry.uploaderName}</span>}</div>
      <div className="inline-actions mt-2 flex flex-wrap gap-2 empty:hidden">{entry.canWrite && (entry.kind === 'task' || entry.kind === 'call') && <Button size="sm" onClick={() => action(`${entry.kind}s.${entry.completed ? 'reopen' : 'complete'}`, entry)}>{entry.completed ? 'Reopen' : entry.kind === 'task' ? 'Complete' : 'Mark complete'}</Button>}{entry.canWrite && entry.kind === 'note' && <>{entry.canConvertToTask && <Button size="sm" onClick={() => action('notes.convertToTask', entry)}>Convert to task</Button>}<Button size="sm" onClick={() => action(`notes.${entry.archived ? 'unarchive' : 'archive'}`, entry)}>{entry.archived ? 'Unarchive' : 'Archive'}</Button></>}{entry.canDelete && entry.kind !== 'file' && <DeleteAction kind={entry.kind} id={entry.id} name={entry.title} size="sm" />}{entry.canDelete && entry.kind === 'file' && <Button size="sm" variant="danger" onClick={() => action('files.delete', entry)}>Delete</Button>}</div>
    </div>
  </article>;
}
export function QuickAdd({ parent, invalidate }: { parent: Parent; invalidate: () => void }) {
  const ui = useUI(); const [text, setText] = useState(''); const input = useRef<HTMLInputElement>(null);
  const mutation = useMutation({ mutationFn: () => service('notes.create', { title: text.trim(), body: '', [`${parent.kind}Id`]: parent.id, clientRef: crypto.randomUUID() }), onSuccess: () => { setText(''); invalidate(); ui.notify('Note added.'); input.current?.focus(); } });
  const submit = (event: FormEvent) => { event.preventDefault(); const value = text.trim(); if (!value) return; const command = value.match(/^\/(task|call)\s+(.+)$/s); if (command) { ui.openCreate(command[1] as 'task' | 'call', parent, command[2]); setText(''); } else mutation.mutate(); };
  return <SectionStrip as="form" onSubmit={submit as never} className="quick-add"><div className="quick-add-controls flex gap-2"><label className="sr-only" htmlFor="quick-note">Add a note, or start with /task or /call</label><Input ref={input} id="quick-note" value={text} onChange={event => setText(event.target.value)} placeholder="Add a note… or start with /task or /call" disabled={mutation.isPending} maxLength={255} /><Button type="submit" disabled={!text.trim()} busy={mutation.isPending}>Add</Button></div>{mutation.isError && <div className="mt-2"><FieldError>{mutation.error.message}</FieldError></div>}</SectionStrip>;
}
export type TimelineService = 'projects.timeline' | 'companies.timeline' | 'contacts.timeline';
const timelineFilters = (params: URLSearchParams) => ({ kind: (['everything', 'tasks', 'calls', 'notes', 'files'].includes(params.get('kind') || '') ? params.get('kind') : 'everything') as FilterKind, includeClosed: params.get('closed') === '1' });
const timelineQuery = (name: TimelineService, id: string, kind: FilterKind, includeClosed: boolean) => ({ queryKey: [name, { id, kind, includeClosed }], queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) => service<Timeline>(name, { id, kind, includeClosed, cursor: pageParam, pageSize: 25 }, signal), initialPageParam: null as string | null, getNextPageParam: (page: Timeline) => page.nextCursor || undefined });
/** Starts the first timeline page beside the record read so the panel does not wait one round trip. */
export function useTimelinePrefetch(name: TimelineService, id: string) {
  const [params] = useSearchParams(); const client = useQueryClient(); const { kind, includeClosed } = timelineFilters(params);
  useEffect(() => { void client.prefetchInfiniteQuery(timelineQuery(name, id, kind, includeClosed)); }, [client, name, id, kind, includeClosed]);
}
export function TimelinePanel({ service: name, id, canWrite, label = 'timeline', counts, quickAddParent }: { service: TimelineService; id: string; canWrite: boolean; label?: string; counts?: Partial<Record<FilterKind, number>>; quickAddParent?: Parent }) {
  const [params, setParams] = useSearchParams(); const ui = useUI(); const client = useQueryClient();
  const { kind, includeClosed } = timelineFilters(params);
  const timeline = useInfiniteQuery(timelineQuery(name, id, kind, includeClosed));
  const [confirm, setConfirm] = useState<{ name: string; entry: Entry } | null>(null);
  const navigate = useNavigate();
  const invalidate = () => { void client.invalidateQueries(); };
  const mutation = useMutation({ mutationFn: ({ name, entry }: { name: string; entry: Entry }) => name === 'notes.convertToTask' ? service<{ id: string }>(name, { id: entry.id, clientRef: crypto.randomUUID() }) : service(name, { id: entry.id }), onSuccess: (result, { name }) => { invalidate(); ui.notify(name === 'notes.convertToTask' ? 'Converted to task.' : 'Saved.'); setConfirm(null); if (name === 'notes.convertToTask' && result && typeof (result as { id?: unknown }).id === 'string') navigate(`/tasks/${(result as { id: string }).id}`); }, onError: error => ui.notify(error.message, true) });
  useEffect(() => { ui.setDialogOpen(!!confirm); return () => ui.setDialogOpen(false); }, [confirm]);
  const action = (actionName: string, entry: Entry) => { if (actionName === 'files.delete' || actionName === 'notes.archive') setConfirm({ name: actionName, entry }); else mutation.mutate({ name: actionName, entry }); };
  const filter = (field: string, value: string) => setParams(current => { const updated = new URLSearchParams(current); if (value) updated.set(field, value); else updated.delete(field); return updated; });
  return <><Panel title="Timeline" action={<span className={mutedText}>Most recent first</span>}>
    <SectionStrip className="timeline-filters flex flex-col gap-3"><div className="chips flex flex-wrap gap-2" role="radiogroup" aria-label="Timeline kind">{(['everything', 'tasks', 'calls', 'notes', 'files'] as FilterKind[]).map(value => <ChipButton selected={kind === value} key={value} onClick={() => filter('kind', value === 'everything' ? '' : value)}><span className="inline-flex items-center gap-1.5">{value[0].toUpperCase() + value.slice(1)}{value !== 'everything' && counts?.[value] != null && <span className="tabular-nums">{counts[value]}</span>}</span></ChipButton>)}</div><Checkbox label="Include completed and archived" checked={includeClosed} onChange={event => filter('closed', event.target.checked ? '1' : '')} /></SectionStrip>
    {canWrite && quickAddParent && <QuickAdd parent={quickAddParent} invalidate={invalidate} />}{timeline.isPending ? <LoadingState rows={5} /> : timeline.isError ? <div className="p-4"><ErrorState message={`The ${label} could not be loaded.`} retry={() => void timeline.refetch()} /></div> : timeline.data.pages.every(page => !page.entries.length) ? <EmptyState action={canWrite && quickAddParent ? <Button onClick={() => ui.openCreate('note', quickAddParent)}>New note</Button> : undefined}>No {kind === 'everything' ? 'entries' : kind} in this view yet.</EmptyState> : <ul className="divide-y divide-gray-100 dark:divide-gray-800">{timeline.data.pages.flatMap(page => page.entries).map(entry => <li key={`${entry.kind}-${entry.id}`}><TimelineEntry entry={entry} action={action} /></li>)}</ul>}
    {timeline.hasNextPage && <SectionStrip as="footer" edge="t" className="show-more text-center"><Button busy={timeline.isFetchingNextPage} onClick={() => void timeline.fetchNextPage()}>Show {timeline.data?.pages.at(-1)?.remaining || ''} earlier entries</Button></SectionStrip>}
  </Panel>{confirm && <ConfirmDialog title={confirm.name === 'files.delete' ? 'Delete this file?' : 'Archive this note?'} message={confirm.entry.title} close={() => setConfirm(null)} busy={mutation.isPending} error={mutation.error?.message} confirm={() => mutation.mutate(confirm)} />}</>;
}
