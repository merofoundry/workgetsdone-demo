import { Link, useSearchParams } from 'react-router-dom';
import { ALLOWED_CHILDREN, type Agenda, type Entry, type Parent, type Rollup, type Stats } from './contracts';
import { dayKey, daysLate, entryHref, sundayStart } from './dates';
import { Button, EmptyState, ErrorState, LoadingState, Marker, PageHeader, Panel, StatusTag, linkClass, mutedText } from './primitives';
import { Card } from './ui/Card';
import { cn, focusRing } from './utils';
import { useUI } from './ui-context';
import { useService } from './use-service';

export function CreateActions({ parent }: { parent?: Parent }) {
  const ui = useUI(); const allowed = parent ? ALLOWED_CHILDREN[parent.kind] : ['call', 'note', 'task'];
  return <div className="actions flex flex-wrap gap-2">{allowed.includes('call') && <Button hint="C" onClick={() => ui.openCreate('call', parent)}>New call</Button>}{allowed.includes('note') && <Button hint="N" onClick={() => ui.openCreate('note', parent)}>New note</Button>}{allowed.includes('task') && <Button variant="primary" hint="T" onClick={() => ui.openCreate('task', parent)}>New task</Button>}</div>;
}
export function AgendaRow({ entry, overdue = false }: { entry: Entry; overdue?: boolean }) {
  const time = entry.startAt ? new Date(entry.startAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) : '-';
  const context = [entry.personName, entry.projectName || entry.companyName].filter(Boolean).join(' · ');
  return <Link to={entryHref(entry)} data-record-id={entry.id} className={cn(focusRing, 'agenda-row items-center gap-3 border-b border-gray-100 text-sm text-gray-800 last:border-b-0 hover:bg-gray-50 focus-visible:ring-inset dark:border-gray-800 dark:text-white/90 dark:hover:bg-white/3', 'grid min-h-11 grid-cols-[4rem_auto_minmax(0,1fr)] px-5 py-2 sm:grid-cols-[4rem_auto_minmax(0,1fr)_auto] sm:px-6')}>
    <span className={cn('agenda-time text-xs tabular-nums', mutedText)}>{overdue && entry.dueAt ? new Date(entry.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : time}</span><Marker kind={entry.kind} />
    <span className="agenda-title wrap-anywhere">{entry.title}{context && <span className="text-gray-500 dark:text-gray-400"> · {context}</span>}</span>
    <span className={cn('col-start-3 text-xs sm:col-auto', overdue ? 'text-error-600 dark:text-error-400' : 'text-gray-500 dark:text-gray-400')}>{overdue && entry.dueAt ? `${daysLate(entry.dueAt)} days` : entry.durationMinutes != null ? `${entry.durationMinutes}m` : entry.billable ? 'billable' : ''}</span></Link>;
}
export function StatStrip({ stats }: { stats: Stats }) {
  const tiles = [{ value: stats.todayCount, label: 'on the calendar today' }, { value: stats.overdueCount, label: 'overdue tasks', danger: stats.overdueCount > 0 }, { value: stats.openTasks, label: 'open tasks across projects' }, { value: stats.openCalls, label: `open calls · ${stats.unbilledCalls} unbilled` }];
  return <div className="stat-strip mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map(tile => <Card padded className="stat-tile" key={tile.label}><div className="flex flex-col"><strong className={cn('text-2xl font-semibold tabular-nums', tile.danger ? 'text-error-600 dark:text-error-400' : 'text-gray-800 dark:text-white/90')}>{tile.value}</strong><span className={mutedText}>{tile.label}</span></div></Card>)}</div>;
}
export function AgendaContent({ data }: { data: Agenda }) {
  const today = dayKey(new Date()); const days = new Map<string, Entry[]>(); days.set(today, []);
  for (const entry of data.items) { const date = entry.startAt || entry.dueAt || entry.date; if (date) { const key = dayKey(date); days.set(key, [...(days.get(key) || []), entry]); } }
  return <>{Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, entries]) => <section key={day} aria-label={day}><h3 className="day-separator border-b border-gray-100 bg-gray-50 px-5 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase sm:px-6 dark:border-gray-800 dark:bg-white/3 dark:text-gray-400">{day === today ? 'Today · ' : ''}{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</h3>{entries.length ? entries.sort((a, b) => (a.startAt || a.dueAt || '').localeCompare(b.startAt || b.dueAt || '')).map(entry => <AgendaRow key={`${entry.kind}-${entry.id}`} entry={entry} />) : <EmptyState>Nothing scheduled today.</EmptyState>}</section>)}{!data.items.length && <EmptyState action={<CreateActions />}>Nothing scheduled through {new Date(`${data.windowEnd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.</EmptyState>}<footer className={cn('marker-key flex gap-4 px-5 py-3 text-xs sm:px-6', mutedText)}><span className="inline-flex items-center gap-1"><Marker kind="call" />call</span><span className="inline-flex items-center gap-1"><Marker kind="task" />task</span></footer></>;
}
export function ProjectsContent({ data }: { data: Rollup }) {
  return data.projects.length ? <div className="project-cards flex flex-col gap-3">{data.projects.slice(0, 6).map(project => <Link className={cn('project-card block rounded-2xl', focusRing)} to={`/projects/${encodeURIComponent(project.id)}`} data-record-id={project.id} key={project.id}><Card className="text-gray-800 hover:border-gray-300 hover:shadow-xs dark:text-white/90 dark:hover:border-gray-700"><div className="flex flex-col gap-2 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="min-w-0 font-medium wrap-anywhere">{project.name}</h3><StatusTag status={project.status} /></div><p className={mutedText}>{project.companyName || 'No company linked'}</p><div className={cn('flex flex-wrap gap-3 text-xs tabular-nums', mutedText)}><span>{project.openTasks} tasks</span><span>{project.openCalls} calls</span><span>{project.notes} notes</span></div></div></Card></Link>)}</div> : <EmptyState>No projects you can see yet.</EmptyState>;
}
export function Overview() {
  const [params] = useSearchParams(); const windowStart = params.get('windowStart') || sundayStart();
  const stats = useService<Stats>('dashboard.stats'); const agenda = useService<Agenda>('dashboard.agenda', { windowStart }); const rollup = useService<Rollup>('dashboard.rollup', { limit: 6 });
  return <><PageHeader title={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} subtitle={stats.data ? `${stats.data.todayCount} scheduled today · ${stats.data.overdueCount} overdue · ${stats.data.activeProjects} projects active` : 'Your work, at a glance'} actions={<CreateActions />} />
    {stats.isPending ? <LoadingState rows={1} /> : stats.isError ? <div className="mb-6"><ErrorState message="Your work counts could not be loaded." retry={() => void stats.refetch()} /></div> : <StatStrip stats={stats.data} />}
    <div className="overview-columns grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"><Panel title="Next 14 days" action={<Link className={linkClass} to={`/calendar?windowStart=${windowStart}`}>Open calendar</Link>}>{agenda.isPending ? <LoadingState rows={8} /> : agenda.isError ? <div className="p-4"><ErrorState message="Your agenda could not be loaded." retry={() => void agenda.refetch()} /></div> : <AgendaContent data={agenda.data} />}</Panel>
      <aside aria-label="Overview sidebar" className="overview-rail flex min-w-0 flex-col gap-6">{agenda.data && agenda.data.overdue.length > 0 && <Panel title="Overdue" danger>{agenda.data.overdue.map(entry => <AgendaRow key={entry.id} entry={entry} overdue />)}</Panel>}<section aria-label="Projects"><header className="section-header mb-3 flex items-baseline justify-between gap-3"><h2 className="text-base font-medium text-gray-800 dark:text-white/90">Projects</h2>{rollup.data && <Link className={linkClass} to="/projects">All {rollup.data.total}</Link>}</header>{rollup.isPending ? <LoadingState rows={4} /> : rollup.isError ? <ErrorState message="Your projects could not be loaded." retry={() => void rollup.refetch()} /> : <ProjectsContent data={rollup.data} />}</section></aside>
    </div></>;
}
