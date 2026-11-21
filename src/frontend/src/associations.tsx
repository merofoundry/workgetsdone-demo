import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { service } from './api';
import type { Association } from './contracts';
import { ConfirmDialog, EntityPicker } from './dialogs';
import { Button, CardBody, Dialog, Field, FieldError, Panel, Tag, linkClass, mutedText } from './primitives';
import { Checkbox } from './ui/Checkbox';
import { Input } from './ui/Input';
import { useUI } from './ui-context';

type AssociatedRecord = { id: string; primaryContactId?: string | null; associations: Association[]; permissions: { write: boolean } };
export function AssociationsPanel({ kind, record }: { kind: 'company' | 'contact'; record: AssociatedRecord }) {
  const ui = useUI(); const client = useQueryClient(); const canWrite = record.permissions.write; const other = kind === 'company' ? 'contact' : 'company';
  const [linking, setLinking] = useState(false); const [pending, setPending] = useState<Association | null>(null);
  useEffect(() => { ui.setDialogOpen(linking); return () => ui.setDialogOpen(false); }, [linking]);
  const done = async (message: string) => { await client.invalidateQueries(); ui.notify(message); };
  const isPrimary = (item: Association) => kind === 'company' ? item.contactId === record.primaryContactId : item.isPrimary; // the company's primary_contact is what companies.setPrimaryContact writes; the association flag is only set at link time
  const primary = useMutation({ mutationFn: (contactId: string | null) => service('companies.setPrimaryContact', { id: record.id, contactId }), onSuccess: () => done('Primary contact updated.') });
  const unlink = useMutation({ mutationFn: (row: Association) => service('contacts.dissociate', { associationId: row.id }), onSuccess: async () => { setPending(null); await done(`${other[0].toUpperCase()}${other.slice(1)} unlinked.`); } });
  return <Panel title="Associations"><CardBody>
    {record.associations.length ? record.associations.map(item => <div className="subproject flex flex-wrap items-center justify-between gap-2" key={item.id}><span>{kind === 'company' ? <Link className={linkClass} to={`/contacts/${item.contactId}`}>{item.contactName}</Link> : <Link className={linkClass} to={`/companies/${item.companyId}`}>{item.companyName}</Link>}{item.role && <span className={mutedText}> · {item.role}</span>}</span>
      <span className="actions flex flex-wrap items-center gap-2">{isPrimary(item) && <Tag>Primary</Tag>}{canWrite && <>
        {kind === 'company' && (isPrimary(item) ? <Button size="sm" disabled={primary.isPending} onClick={() => { primary.reset(); primary.mutate(null); }}>Clear primary</Button> : <Button size="sm" disabled={primary.isPending} onClick={() => { primary.reset(); primary.mutate(item.contactId); }}>Set as primary</Button>)}
        <Button size="sm" onClick={() => { unlink.reset(); setPending(item); }}>Unlink</Button></>}</span></div>) : <p className={mutedText}>No associations yet.</p>}
    {primary.isError && <FieldError>{primary.error.message}</FieldError>}
    {canWrite && <div><Button size="sm" onClick={() => setLinking(true)}>Link a {other}</Button></div>}</CardBody>
    {linking && <LinkDialog kind={kind} record={record} close={() => setLinking(false)} done={done} />}
    {pending && <ConfirmDialog title={`Unlink ${other}?`} message={`${kind === 'company' ? pending.contactName : pending.companyName} will no longer be linked to ${kind === 'company' ? pending.companyName : pending.contactName}.`} close={() => setPending(null)} busy={unlink.isPending} error={unlink.error?.message} confirm={() => unlink.mutate(pending)} />}</Panel>;
}
function LinkDialog({ kind, record, close, done }: { kind: 'company' | 'contact'; record: AssociatedRecord; close: () => void; done: (message: string) => Promise<void> }) {
  const other = kind === 'company' ? 'contact' : 'company'; const [target, setTarget] = useState<string | undefined>(); const [role, setRole] = useState(''); const [isPrimary, setIsPrimary] = useState(false);
  const [clientRef] = useState(() => crypto.randomUUID());
  const link = useMutation({ mutationFn: async () => { const contactId = kind === 'contact' ? record.id : target; const companyId = kind === 'company' ? record.id : target; await service('contacts.associate', { contactId, companyId, role: role.trim() || null, isPrimary, clientRef }); if (isPrimary) await service('companies.setPrimaryContact', { id: companyId, contactId }); }, onSuccess: async () => { close(); await done(`${other[0].toUpperCase()}${other.slice(1)} linked.`); } });
  return <Dialog title={`Link a ${other}`} close={close} busy={link.isPending} footer={<><Button onClick={close} disabled={link.isPending}>Cancel</Button><Button variant="primary" type="submit" form="link-association" busy={link.isPending} disabled={!target}>Link {other}</Button></>}>
    <form id="link-association" className="form-stack flex flex-col gap-4" onSubmit={event => { event.preventDefault(); if (target && !link.isPending) link.mutate(); }}>
      <EntityPicker label={other[0].toUpperCase() + other.slice(1)} kind={`${other === 'contact' ? 'contacts' : 'companies'}`} onChange={setTarget} />
      <Field label="Role"><Input value={role} maxLength={100} onChange={event => setRole(event.target.value)} /></Field>
      <Checkbox label={kind === 'company' ? 'Primary contact' : 'Primary contact for this company'} checked={isPrimary} onChange={event => setIsPrimary(event.target.checked)} />
      {link.isError && <FieldError>{link.error.message}</FieldError>}
    </form></Dialog>;
}
