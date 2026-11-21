import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import classicTheme from '@fullcalendar/react/themes/classic';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import listPlugin from '@fullcalendar/react/list';
import interactionPlugin from '@fullcalendar/react/interaction';
import type { DatesSetInfo, EventApi, EventDropInfo, EventInput, EventResizeDoneInfo } from '@fullcalendar/react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, service } from './api';
import type { Agenda, Entry } from './contracts';
import { entryHref, shiftInZone, zoneDayKey } from './dates';
import { toInitial } from './dialogs';
import { EmptyState, ErrorState, LoadingState, PageHeader } from './primitives';
import { useUI } from './ui-context';
import { useService } from './use-service';
import { cn } from './utils';

interface Profile { timezone?: string | null }
type Row = Record<string, any>;
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, classicTheme];
const DAY = 86400000;
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
/** Tasks are all-day events on their due day; calls are timed events from start to end. */
export function toEvent(entry: Entry, zone: string): EventInput {
  const base = { id: `${entry.kind}-${entry.id}`, title: entry.title, url: entryHref(entry), editable: entry.canWrite !== false, extendedProps: { kind: entry.kind, personName: entry.personName ?? null, projectName: entry.projectName ?? null, completed: entry.completed === true } };
  if (entry.kind === 'task') { const day = entry.dueAt || entry.startAt || entry.date; return { ...base, allDay: true, start: day ? zoneDayKey(day, zone) : undefined, durationEditable: false }; }
  const start = entry.startAt || entry.date!; const end = entry.endAt && new Date(entry.endAt) > new Date(start) ? entry.endAt : undefined;
  return { ...base, allDay: false, start, end, durationEditable: true };
}
/** The agenda window a view needs: month views ask for their whole grid; week, day and list views ask for the week Sunday and seven days. */
export function windowFor(info: { startStr: string; endStr: string; view: { type: string } }) {
  const start = info.startStr.slice(0, 10); const span = Math.round((Date.parse(info.endStr.slice(0, 10)) - Date.parse(start)) / DAY);
  if (info.view.type === 'dayGridMonth') return { windowStart: start, windowDays: Math.min(42, Math.max(7, span)) };
  const date = new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return { windowStart: date.toISOString().slice(0, 10), windowDays: 7 };
}
const splitId = (id: string) => { const cut = id.indexOf('-'); return { kind: id.slice(0, cut) as 'task' | 'call', id: id.slice(cut + 1) }; };
const iso = (value: unknown) => typeof value === 'string' && value ? value : null;

function CalendarGrid({ zone }: { zone: string }) {
  const [params] = useSearchParams(); const navigate = useNavigate(); const ui = useUI(); const client = useQueryClient();
  const [range, setRange] = useState<{ windowStart: string; windowDays: number } | null>(null);
  const query = useService<Agenda>('dashboard.agenda', range ?? {}, !!range);
  const last = useRef<Entry[]>([]); if (query.data) last.current = query.data.items;
  const items = query.data?.items ?? last.current;
  const events = useMemo(() => items.filter(entry => entry.kind === 'task' || entry.kind === 'call').map(entry => toEvent(entry, zone)), [items, zone]);
  const shift = async (event: EventApi, startDelta: { days: number; milliseconds: number }, endDelta: { days: number; milliseconds: number }) => {
    const { kind, id } = splitId(event.id); const collection = `${kind}s`;
    const row = await service<Row>(`${collection}.read`, { id });
    const values: Row = { ...toInitial(kind, row), id, version: row.version };
    values.billable = values.billable === true; values.billed = values.billable && values.billed === true;
    if (kind === 'call') values.followup = values.followup === true;
    const start = iso(row.startAt); const end = iso(row.endAt);
    if (kind === 'call') { values.startAt = start && shiftInZone(start, zone, startDelta); values.endAt = end && shiftInZone(end, zone, endDelta); }
    else { const due = iso(row.endAt) || iso(row.dueAt) || start; values.endAt = due && shiftInZone(due, zone, startDelta); values.startAt = start && shiftInZone(start, zone, startDelta); }
    await service(`${collection}.update`, values);
    // The write landed: a refetch problem must not revert the event or report a failure.
    void client.invalidateQueries().catch(() => {}); ui.notify('Saved.');
  };
  const apply = (info: EventDropInfo | EventResizeDoneInfo, startDelta: { days: number; milliseconds: number }, endDelta = startDelta) => {
    const fail = (error: unknown, message?: string) => { info.revert(); ui.notify(message ?? (error instanceof ApiError && error.status === 409 ? 'This item was changed elsewhere, so the move was undone. Reload to see the latest.' : error instanceof ApiError && error.status === 404 ? 'You can no longer change this item.' : 'The change could not be saved and was undone.'), true); };
    if (info.event.allDay !== (info.oldEvent.allDay)) { fail(null, 'Tasks cannot be given a time.'); return; }
    shift(info.event, startDelta, endDelta).catch(fail);
  };
  return <div className="calendar-grid min-w-0" aria-busy={query.isFetching}>
    {query.isError && <div className="mb-4"><ErrorState message="Your calendar could not be loaded." retry={() => void query.refetch()} /></div>}
    <FullCalendar plugins={PLUGINS} timeZone={zone} firstDay={0} initialView="dayGridMonth" initialDate={params.get('windowStart') || undefined} height="auto" nowIndicator navLinks={false} dayMaxEvents
      headerToolbar={{ start: 'prev,next today', center: 'title', end: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }}
      events={events} editable eventStartEditable eventDurationEditable
      datesSet={(info: DatesSetInfo) => { const next = windowFor(info); setRange(current => current && current.windowStart === next.windowStart && current.windowDays === next.windowDays ? current : next); }}
      eventClick={info => { info.jsEvent.preventDefault(); const { kind, id } = splitId(info.event.id); navigate(entryHref({ kind, id })); }}
      eventDrop={info => apply(info, { days: info.delta.days, milliseconds: info.delta.milliseconds })}
      eventResize={info => apply(info, { days: info.startDelta.days, milliseconds: info.startDelta.milliseconds }, { days: info.endDelta.days, milliseconds: info.endDelta.milliseconds })}
      eventDidMount={arg => arg.el.setAttribute('data-record-id', splitId(arg.event.id).id)}
      eventContent={arg => { const { personName, projectName, completed } = arg.event.extendedProps; const context = [personName, projectName].filter(Boolean).join(' · ');
        return <span className={cn('block min-w-0 truncate', completed && 'opacity-60 line-through')}>{arg.timeText && <span className="mr-1 tabular-nums">{arg.timeText}</span>}<span className="font-medium">{arg.event.title}</span>{context && <span className="ml-1 opacity-80">{context}</span>}</span>; }} />
    {query.isPending && range && !items.length && <div className="mt-4"><LoadingState rows={2} /></div>}
    {query.data && !query.data.items.length && <div className="mt-4"><EmptyState>Nothing scheduled in this window.</EmptyState></div>}
  </div>;
}
export function Calendar() {
  const profile = useService<Profile>('account.read');
  return <><PageHeader title="Your calendar" />{profile.isPending ? <LoadingState /> : <CalendarGrid zone={profile.data?.timezone || browserZone()} />}</>;
}
