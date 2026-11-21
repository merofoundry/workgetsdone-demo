import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, service } from './api';
import type { Project } from './contracts';
import { CreateActions } from './overview';
import { ConfirmDialog } from './dialogs';
import { DeleteAction } from './delete';
import { Button, CardBody, DetailList, EmptyState, ErrorState, LoadingState, PageHeader, Panel, StatusTag, linkClass, mutedText } from './primitives';
import { Breadcrumb } from './ui/Breadcrumb';
import { AccessCard } from './sharing';
import { TimelinePanel, useTimelinePrefetch } from './timeline';
import { useUI, usePageParent } from './ui-context';
import { useService } from './use-service';

export function ProjectScreen() {
  const { id = '' } = useParams(); const project = useService<Project>('projects.read', { id }); useTimelinePrefetch('projects.timeline', id); const ui = useUI(); const navigate = useNavigate(); const client = useQueryClient(); const [confirm, setConfirm] = useState(false); usePageParent('project', id, project.data?.name);
  const archive = useMutation({ mutationFn: (name: string) => service(name, { id }), onSuccess: async () => { setConfirm(false); await client.invalidateQueries(); ui.notify('Saved.'); }, onError: error => { setConfirm(false); ui.notify(error.message, true); } });
  useEffect(() => { ui.setDialogOpen(confirm); return () => ui.setDialogOpen(false); }, [confirm]);
  if (project.isPending) return <LoadingState rows={5} />;
  if (project.isError) return project.error instanceof ApiError && project.error.status === 404 ? <EmptyState action={<Link className={linkClass} to="/">Back to Overview</Link>}>This project could not be found.</EmptyState> : <ErrorState message="This project could not be loaded." retry={() => void project.refetch()} />;
  const p = project.data;
  const rows = [['Company', p.companyName], ['Contact', p.contactName], ['Owner', p.ownerName], ['Starts', p.startDate], ['Ends', p.endDate]].filter(([, value]) => value).map(([label, value]) => ({ label: label as string, value }));
  return <><div className="breadcrumbs mb-4"><Breadcrumb items={[{ label: 'Projects', to: '/projects' }]} current={p.name} /></div>
    <PageHeader recordId={id} title={p.name} badge={<StatusTag status={p.status} />} subtitle={[p.companyName, p.contactName].filter(Boolean).join(' · ')} actions={(p.permissions.write || p.permissions.delete) && <>{p.permissions.write && <><Button onClick={() => ui.openEdit('project', p)}>Edit</Button><Button busy={archive.isPending && !confirm} onClick={() => p.archived ? archive.mutate('projects.unarchive') : setConfirm(true)}>{p.archived ? 'Unarchive' : 'Archive'}</Button><CreateActions parent={{ kind: 'project', id, name: p.name }} /></>}{p.permissions.delete && <DeleteAction kind="project" id={id} name={p.name} onDeleted={() => navigate('/projects')} />}</>} />{confirm && <ConfirmDialog title="Archive this project?" message={`${p.name} will be hidden from your lists. You can unarchive it later.`} close={() => setConfirm(false)} busy={archive.isPending} error={archive.error?.message} confirm={() => archive.mutate('projects.archive')} />}
    {p.description && <p className="project-description mb-6 max-w-prose text-sm text-gray-600 dark:text-gray-400">{p.description}</p>}
    <div className="project-columns grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"><TimelinePanel service="projects.timeline" label="project timeline" id={id} canWrite={p.permissions.write} counts={p.counts} quickAddParent={{ kind: 'project', id, name: p.name }} />
      <aside aria-label="Project details" className="details-rail flex min-w-0 flex-col gap-6">
        <Panel title="Details"><DetailList rows={[...rows, ...(p.parent ? [{ label: 'Parent', value: <Link className={linkClass} to={`/projects/${p.parent.id}`}>{p.parent.name}</Link> }] : [])]} /></Panel>
        <Panel title="Open work"><DetailList rows={[{ label: 'Tasks open', value: <span className="tabular-nums">{p.counts.tasks}{p.counts.lateTasks > 0 && <span className="text-error-600 dark:text-error-400"> · {p.counts.lateTasks} late</span>}</span> }, { label: 'Calls open', value: <span className="tabular-nums">{p.counts.calls}</span> }, { label: 'Billable, unbilled', value: <span className="tabular-nums">{p.counts.unbilledCalls}</span> }]} /></Panel>
        <Panel title="Sub-projects"><CardBody>{p.subprojects.length ? p.subprojects.map(sub => <div className="subproject flex flex-wrap items-center justify-between gap-2" key={sub.id}><Link className={linkClass} to={`/projects/${sub.id}`}>{sub.name}</Link><StatusTag status={sub.status} /></div>) : <p className={mutedText}>No sub-projects yet.</p>}</CardBody></Panel>
        {p.permissions.share && <AccessCard kind="project" id={id} />}
      </aside></div>
  </>;
}
