import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, service } from './api';
import { COLLECTIONS, type CreateKind } from './contracts';
import { Button, Dialog, ErrorState, FieldError, LoadingState, RadioGroup, RadioOption } from './primitives';
import { useUI } from './ui-context';

export type DeleteKind = CreateKind | 'file';
type Reason = { kind: string; count: number };
type Strategy = 'cascade' | 'reparent';
type Children = { tasks: number; calls: number; notes: number; files: number; subprojects: number; associations: number };
type Preview = { blocked: boolean; reasons: Reason[]; children: Children; strategies: Strategy[] };
type Progress = { ok: boolean; done: boolean; remaining: number };
const MAX_BATCHES = 1000;
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (parts: string[]) => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

/** Reasons in words; the platform only sends a kind and a count. */
export function reasonText(kind: DeleteKind, reason: Reason): string {
  const { kind: type, count: n } = reason;
  switch (type) {
    case 'projects': case 'tasks': case 'calls': return `${count(n, type.slice(0, -1))} still ${n === 1 ? 'references' : 'reference'} this ${kind}. Reassign or delete ${n === 1 ? 'it' : 'them'} first.`;
    case 'associations': return `${count(n, 'association')} still ${n === 1 ? 'links' : 'link'} to this ${kind}. Remove ${n === 1 ? 'it' : 'them'} first.`;
    case 'companies': return `This contact is the primary contact of ${count(n, 'company', 'companies')}. Choose another primary contact first.`;
    case 'subprojects': return `${count(n, 'sub-project')} sit under this project. Move or delete ${n === 1 ? 'it' : 'them'} first.`;
    case 'children': return `This project has ${count(n, 'item')} under it. Choose what happens to them below.`;
    case 'orphans': return `${count(n, 'item')} cannot be moved because there is nowhere to move ${n === 1 ? 'it' : 'them'}. Move or delete ${n === 1 ? 'it' : 'them'} first.`;
    default: return `${count(n, 'record')} still depend${n === 1 ? 's' : ''} on this ${kind}.`;
  }
}
function childrenText(kind: DeleteKind, c: Children, strategy: Strategy | null): string[] {
  const out: string[] = [];
  const work = [c.tasks && count(c.tasks, 'task'), c.calls && count(c.calls, 'call'), c.notes && count(c.notes, 'note')].filter(Boolean) as string[];
  if (work.length) {
    if (kind === 'task' || kind === 'call') out.push(`${list(work)} will move to this ${kind}'s project.`);
    else if (kind === 'project') out.push(strategy === 'reparent' ? `${list(work)} will move to the company.` : strategy === 'cascade' ? `${list(work)} will be deleted.` : `${list(work)} are under this project.`);
    else out.push(`${list(work)} will be deleted.`);
  }
  if (c.subprojects) out.push(`${count(c.subprojects, 'sub-project')} sit under this project.`);
  if (c.files) out.push(`${count(c.files, 'attachment')} will be deleted.`);
  if (c.associations) out.push(`${count(c.associations, 'association')} will be removed.`);
  return out;
}

export function DeleteDialog({ kind, id, name, onDeleted, close }: { kind: DeleteKind; id: string; name: string; onDeleted: () => void; close: () => void }) {
  const ui = useUI(); const client = useQueryClient(); const collection = kind === 'file' ? 'files' : COLLECTIONS[kind];
  // A file has no children, so there is nothing to preview: the dialog confirms directly.
  const direct = kind === 'file';
  const preview = useQuery({ queryKey: ['delete-preview', kind, id], queryFn: ({ signal }) => service<Preview>(`${collection}.delete`, { id, dryRun: true }, signal), retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, enabled: !direct });
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; reasons?: Reason[] } | null>(null);
  useEffect(() => { ui.setDialogOpen(true); return () => ui.setDialogOpen(false); }, []);
  const busy = progress !== null;
  const data = preview.data;
  const choosing = !!data && data.strategies.length > 0;
  const onlyChildren = !!data && data.reasons.length > 0 && data.reasons.every(reason => reason.kind === 'children');
  const canConfirm = !busy && (direct || !!data) && (direct || !data!.blocked || (onlyChildren && choosing && strategy !== null));
  async function run(name: string, input: Record<string, unknown>, verb: string, startLabel: string) {
    setProgress(startLabel);
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const result = await service<Progress>(name, input);
      if (result.done) return;
      setProgress(result.remaining > 0 ? `${verb} ${count(result.remaining, 'item')}…` : startLabel);
    }
    throw new Error('Deleting took too many steps. Please try again.');
  }
  async function confirm() {
    setFailure(null);
    try {
      if (kind === 'project' && strategy) await run('projects.deleteChildren', { id, strategy }, strategy === 'reparent' ? 'Moving' : 'Deleting', strategy === 'reparent' ? 'Moving items…' : 'Deleting items…');
      if (direct) { setProgress('Deleting…'); await service('files.delete', { id }); } else await run(`${collection}.delete`, { id }, 'Deleting', 'Deleting…');
      onDeleted(); ui.notify(`${kind[0].toUpperCase() + kind.slice(1)} deleted.`); void client.invalidateQueries({ predicate: query => query.queryKey[0] !== 'delete-preview' });
    } catch (error) {
      setProgress(null);
      if (error instanceof ApiError && error.status === 409) setFailure({ message: error.message, reasons: error.reasons });
      else setFailure({ message: error instanceof Error ? error.message : 'The request could not be completed. Please try again.' });
    }
  }
  const lines = data ? childrenText(kind, data.children, strategy) : [];
  return <Dialog title={`Delete ${kind}?`} busy={busy} close={close} footer={<><Button disabled={busy} onClick={close}>Cancel</Button><Button variant="danger" busy={busy} disabled={!canConfirm} onClick={() => void confirm()}>Confirm</Button></>}>
    {direct ? <div className="form-stack flex flex-col gap-3 text-sm text-gray-700 dark:text-gray-300"><p>{name} will be deleted. This cannot be undone from here.</p>{progress && <p role="status">{progress}</p>}{failure && <FieldError>{failure.message}</FieldError>}</div> : preview.isPending ? <LoadingState rows={3} /> : preview.isError ? <ErrorState message={preview.error instanceof ApiError && preview.error.status === 404 ? 'This record could not be found.' : 'The delete preview could not be loaded.'} retry={() => void preview.refetch()} /> : <div className="form-stack flex flex-col gap-3 text-sm text-gray-700 dark:text-gray-300">
      <p>{name} will be deleted. This cannot be undone from here.</p>
      {lines.map(line => <p key={line}>{line}</p>)}
      {data!.reasons.map(reason => <p key={reason.kind} className="field-error text-error-600 dark:text-error-400">{reasonText(kind, reason)}</p>)}
      {choosing && <RadioGroup legend="What should happen to what is under it?" disabled={busy}>
        {([['cascade', 'Delete everything under it'], ['reparent', 'Move its tasks, calls and notes to the company']] as [Strategy, string][]).filter(([value]) => data!.strategies.includes(value)).map(([value, label]) => <RadioOption key={value} name="delete-strategy" checked={strategy === value} onChange={() => setStrategy(value)}>{label}</RadioOption>)}
      </RadioGroup>}
      {progress && <p role="status">{progress}</p>}
      {failure && <div role="alert" className="field-error text-error-600 dark:text-error-400"><p>{failure.message}</p>{failure.reasons?.map(reason => <p key={reason.kind}>{reasonText(kind, reason)}</p>)}</div>}
    </div>}
  </Dialog>;
}
/** A danger Delete button that owns its dialog; detail screens and timeline entries render it when the record says delete is allowed. */
export function DeleteAction({ kind, id, name, onDeleted = () => {}, className, size }: { kind: DeleteKind; id: string; name: string; onDeleted?: () => void; className?: string; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="danger" size={size} className={className} onClick={() => setOpen(true)}>Delete</Button>{open && <DeleteDialog kind={kind} id={id} name={name} close={() => setOpen(false)} onDeleted={onDeleted} />}</>;
}
