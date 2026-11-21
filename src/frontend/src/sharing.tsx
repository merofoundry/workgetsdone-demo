import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { service } from './api';
import type { Grant, GrantsResponse } from './contracts';
import { ConfirmDialog } from './dialogs';
import { Button, CardBody, Dialog, RadioGroup, RadioOption, ErrorState, FieldError, LoadingState, Panel, mutedText } from './primitives';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { useUI } from './ui-context';
import { useService } from './use-service';

export type ShareKind = 'project' | 'company' | 'contact' | 'task' | 'call' | 'note';
const levels = [['viewer', 'Viewer: can view'], ['editor', 'Editor: can view and edit'], ['manager', 'Manager: can view, edit, delete and share']] as const;
const scopes = [['self', 'This record only'], ['subtree', 'This record and everything under it']] as const;

export function AccessCard({ kind, id }: { kind: ShareKind; id: string }) {
  const [open, setOpen] = useState(false); const ui = useUI(); const grants = useService<GrantsResponse>('grants.list', { objectKind: kind, objectId: id });
  useEffect(() => { ui.setDialogOpen(open); return () => ui.setDialogOpen(false); }, [open]);
  return <Panel title="Access"><CardBody className="items-start">{grants.isPending ? <LoadingState rows={2} /> : grants.isError ? <ErrorState message="Access could not be loaded." retry={() => void grants.refetch()} /> : grants.data.grants.map(grant => <div className="access-person flex w-full flex-wrap justify-between gap-2" key={`${grant.userId}:${grant.source}`}><span>{grant.displayName}</span><span className={mutedText}>{grant.accessLabel}</span></div>)}<Button size="sm" onClick={() => setOpen(true)}>Manage sharing</Button></CardBody>{open && <SharingDialog kind={kind} id={id} close={() => setOpen(false)} />}</Panel>;
}
function SharingDialog({ kind, id, close }: { kind: ShareKind; id: string; close: () => void }) {
  const input = { objectKind: kind, objectId: id }; const grants = useService<GrantsResponse>('grants.list', input); const ui = useUI(); const client = useQueryClient();
  const [search, setSearch] = useState(''); const [userId, setUserId] = useState(''); const [level, setLevel] = useState('viewer'); const [scope, setScope] = useState('self'); const [pending, setPending] = useState<Grant | null>(null);
  const refresh = () => client.invalidateQueries();
  const grant = useMutation({ mutationFn: () => service('grants.grant', { ...input, userId, level, scope }), onSuccess: async () => { setUserId(''); setSearch(''); setLevel('viewer'); setScope('self'); await refresh(); ui.notify('Access updated.'); } });
  const revoke = useMutation({ mutationFn: (row: Grant) => service('grants.revoke', { ...input, userId: row.userId, source: row.source }), onSuccess: async () => { setPending(null); await refresh(); ui.notify('Access revoked.'); } });
  const needle = search.trim().toLowerCase(); const matches = (grants.data?.users ?? []).filter(person => !needle || person.displayName.toLowerCase().includes(needle));
  const busy = grant.isPending || revoke.isPending;
  return <><Dialog title={`${kind[0].toUpperCase()}${kind.slice(1)} access`} close={close} busy={busy}>
    <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">People with access to this {kind}.</p>
    {grants.isPending ? <LoadingState /> : grants.isError ? <ErrorState retry={() => void grants.refetch()} /> : <>
      {grants.data.grants.map(row => <div className="sharing-row flex items-center justify-between gap-3 border-b border-gray-100 py-3 dark:border-gray-800" key={`${row.userId}:${row.source}`}><div className="min-w-0 text-sm"><strong className="font-medium text-gray-800 dark:text-white/90">{row.displayName}</strong><p className={mutedText}>{row.accessLabel}</p></div>{row.revocable !== false && <Button variant="danger" onClick={() => { revoke.reset(); setPending(row); }}>Revoke</Button>}</div>)}
      <form className="form-stack mt-4 flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (userId && !busy) grant.mutate(); }}>
        <h3 className="text-base font-medium text-gray-800 dark:text-white/90">Add person</h3>
        <label className="field"><Label as="span">Find a colleague</Label><Input type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} /></label>
        <RadioGroup legend="Person">{matches.length ? matches.map(person => <RadioOption key={person.id} name="share-person" checked={userId === person.id} onChange={() => setUserId(person.id)}>{person.displayName}</RadioOption>) : <p className={mutedText}>No colleagues match.</p>}</RadioGroup>
        <RadioGroup legend="Level">{levels.filter(([value]) => grants.data.levels.includes(value)).map(([value, label]) => <RadioOption key={value} name="share-level" checked={level === value} onChange={() => setLevel(value)}>{label}</RadioOption>)}</RadioGroup>
        <RadioGroup legend="Applies to">{scopes.filter(([value]) => grants.data.scopes.includes(value)).map(([value, label]) => <RadioOption key={value} name="share-scope" checked={scope === value} onChange={() => setScope(value)}>{label}</RadioOption>)}</RadioGroup>
        {grant.isError && <FieldError>{grant.error.message}</FieldError>}
        <div className="actions flex flex-wrap gap-2"><Button type="submit" variant="primary" disabled={!userId} busy={grant.isPending}>Add person</Button></div>
      </form></>}
  </Dialog>
  {pending && <ConfirmDialog title="Revoke access?" message={`${pending.displayName} will lose this access (${pending.accessLabel}).`} close={() => setPending(null)} busy={revoke.isPending} error={revoke.error?.message} confirm={() => revoke.mutate(pending)} />}</>;
}
