import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ApiError, service } from './api';
import { ALLOWED_CHILDREN, COLLECTIONS, type CreateKind, type EditKind, type ParentKind } from './contracts';
import { RecordForm, type FormError } from './forms';
import { Button, ChipButton, Dialog, FieldError } from './primitives';
import { useUI } from './ui-context';

export { EntityPicker } from './forms';
const asFormError = (error: unknown): FormError => error instanceof ApiError ? { status: error.status, message: error.message, fields: error.fields } : { status: 0, message: error instanceof Error ? error.message : 'The request could not be completed. Please try again.' };
const PARENT_LABEL: Record<ParentKind, string> = { project: 'Project', company: 'Company', contact: 'Contact', task: 'Task', call: 'Call' };
const upper = (value: string) => value[0].toUpperCase() + value.slice(1);

export function CreateDialog() {
  const ui = useUI(); const client = useQueryClient(); const navigate = useNavigate(); const draft = ui.draft!; const parent = draft.parent;
  const [kind, setKind] = useState<CreateKind>(draft.kind); const [error, setError] = useState<FormError | null>(null);
  const clientRef = useMemo(() => crypto.randomUUID(), [kind]);
  const allowed = parent ? ALLOWED_CHILDREN[parent.kind] : [];
  const parentKey = parent ? `${parent.kind}Id` : '';
  const mutation = useMutation({ mutationFn: (values: Record<string, unknown>) => service<{ id?: string | null }>(`${COLLECTIONS[kind]}.create`, { ...values, ...(parent ? { [parentKey]: parent.id } : {}), clientRef }),
    onSuccess: async result => { ui.closeCreate(); await client.invalidateQueries(); ui.notify(`${upper(kind)} created.`); if (!parent && result?.id) navigate(`/${COLLECTIONS[kind]}/${result.id}`); },
    onError: failure => setError(asFormError(failure)) });
  const submit = (values: Record<string, unknown>) => {
    if (kind === 'note' && !parent && !['projectId', 'companyId', 'contactId'].some(key => values[key])) { setError({ status: 422, message: 'Link the note to a project, company or contact.' }); return; }
    setError(null); mutation.mutate(values);
  };
  return <Dialog title={`New ${kind}`} busy={mutation.isPending} close={ui.closeCreate} footer={<><Button onClick={ui.closeCreate} disabled={mutation.isPending}>Cancel</Button><Button variant="primary" busy={mutation.isPending} type="submit" form="create-record">Create {kind}</Button></>}>
    {parent && allowed.length > 1 && <div className="chips kind-switch mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Kind">{allowed.map(option => <ChipButton selected={kind === option} key={option} onClick={() => { setKind(option); setError(null); }}>{upper(option)}</ChipButton>)}</div>}
    <RecordForm key={kind} kind={kind} formId="create-record" busy={mutation.isPending} error={error} onSubmit={submit}
      initial={{ title: draft.title || '', ...(parent ? { [parentKey]: parent.id } : {}) }}
      locked={parent ? { [parentKey]: `${PARENT_LABEL[parent.kind]}: ${parent.name}` } : {}}
      hide={parent ? ['projectId', 'companyId'].filter(key => key !== parentKey) : []} />
  </Dialog>;
}
type Row = Record<string, any>;
/** Maps a read response onto the form keys; the carried ids keep a full-field update from nulling links the form does not show. */
export function toInitial(kind: EditKind, r: Row): Record<string, unknown> {
  const pick = (...keys: string[]) => Object.fromEntries(keys.map(key => [key, r[key] ?? null]));
  switch (kind) {
    case 'company': return { ...pick('name', 'address1', 'address2', 'city', 'state', 'postalCode', 'country', 'phone2', 'fax'), phone1: r.phone ?? null };
    case 'contact': return { ...pick('firstName', 'lastName', 'email2', 'workPhone', 'homePhone', 'cellPhone', 'fax', 'address1', 'address2', 'city', 'state', 'postalCode', 'country', 'title'), email1: r.email ?? null };
    case 'project': return { ...pick('name', 'description', 'startDate', 'endDate', 'parentProjectId', 'contactId', 'companyId'), status: STATUS_KEYS.includes(r.status) ? r.status : null };
    case 'task': return { ...pick('body', 'billable', 'billed', 'assigneeId', 'contactId', 'companyId', 'projectId', 'startAt'), title: r.title, endAt: r.endAt ?? null };
    case 'call': return { ...pick('startAt', 'billable', 'billed', 'followup', 'calleeId', 'taskId', 'contactId', 'companyId', 'projectId'), title: r.title, endAt: r.endAt ?? null };
    case 'note': return { ...pick('body', 'contactId', 'companyId', 'projectId', 'taskId', 'callId'), title: r.title, occurredAt: r.occurredAt ?? r.date ?? null };
  }
}
const STATUS_KEYS = ['NOT_STARTED', 'STARTED', 'ON_SCHEDULE', 'BEHIND_SCHEDULE', 'MAINTENANCE', 'COMPLETED', 'CANCELLED'];
export function EditDialog({ kind, record }: { kind: EditKind; record: Row }) {
  const ui = useUI(); const client = useQueryClient(); const collection = COLLECTIONS[kind];
  const [current, setCurrent] = useState<Row>(record); const [generation, setGeneration] = useState(0); const [error, setError] = useState<FormError | null>(null);
  const mutation = useMutation({ mutationFn: (values: Record<string, unknown>) => service(`${collection}.update`, { id: current.id, version: current.version, ...values }),
    onSuccess: async () => { ui.closeEdit(); await client.invalidateQueries(); ui.notify('Saved.'); }, onError: failure => setError(asFormError(failure)) });
  const reload = useMutation({ mutationFn: () => service<Row>(`${collection}.read`, { id: current.id }), onSuccess: async fresh => { setCurrent(fresh); setError(null); setGeneration(value => value + 1); await client.invalidateQueries(); }, onError: failure => setError(asFormError(failure)) });
  const labels: Record<string, string> = { companyId: current.companyName, contactId: current.contactName ?? current.personName, projectId: current.projectName };
  return <Dialog title={`Edit ${kind}`} busy={mutation.isPending} close={ui.closeEdit} footer={<><Button onClick={ui.closeEdit} disabled={mutation.isPending}>Cancel</Button><Button variant="primary" busy={mutation.isPending} type="submit" form="edit-record">Save</Button></>}>
    <RecordForm key={generation} kind={kind} formId="edit-record" busy={mutation.isPending || reload.isPending} error={error} initial={toInitial(kind, current)} labels={Object.fromEntries(Object.entries(labels).filter(([, value]) => value))} onReload={() => reload.mutate()} onSubmit={values => { setError(null); mutation.mutate(values); }} />
  </Dialog>;
}
export function ConfirmDialog({ title, message, close, confirm, busy, error }: { title: string; message: string; close: () => void; confirm: () => void; busy: boolean; error?: string }) {
  return <Dialog title={title} close={close} busy={busy} footer={<><Button disabled={busy} onClick={close}>Cancel</Button><Button variant="danger" busy={busy} onClick={confirm}>Confirm</Button></>}><p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>{error && <div className="mt-3"><FieldError>{error}</FieldError></div>}</Dialog>;
}
