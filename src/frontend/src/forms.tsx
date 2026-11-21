import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { EditKind, SearchMatch, SearchResults } from './contracts';
import { Button, Field, FieldError, LoadingState } from './primitives';
import { Checkbox } from './ui/Checkbox';
import { Input as TextInput } from './ui/Input';
import { Select } from './ui/Select';
import { TextArea } from './ui/TextArea';
import { useService } from './use-service';
import { focusRing } from './utils';

export function EntityPicker({ label, kind, value, valueLabel, onChange, error }: { label: string; kind: string; value?: string; valueLabel?: string; onChange: (id: string | undefined) => void; error?: string }) {
  const [query, setQuery] = useState(''); const [debounced, setDebounced] = useState('');
  useEffect(() => { const timer = setTimeout(() => setDebounced(query), 150); return () => clearTimeout(timer); }, [query]);
  const matches = useService<SearchResults>('search', { query: debounced, kinds: [kind], limit: 8 }, debounced.length >= 2);
  const [chosen, setChosen] = useState(value ? valueLabel || 'Linked record' : '');
  return <div className="entity-picker relative min-w-0"><Field label={label} error={error}><TextInput value={chosen || query} onChange={event => { setChosen(''); onChange(undefined); setQuery(event.target.value); }} placeholder="Type at least two characters" autoComplete="off" aria-autocomplete="list" error={!!error} /></Field>
    {debounced.length >= 2 && !chosen && <div className="picker-results mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm dark:border-gray-800 dark:bg-gray-900">{matches.isFetching ? <LoadingState rows={1} /> : matches.isError ? <p role="alert" className="p-3 text-error-600 dark:text-error-400">Search could not be loaded.</p> : matches.data?.matches.length ? <ul className="divide-y divide-gray-100 dark:divide-gray-800">{matches.data.matches.map((match: SearchMatch) => <li key={match.id}><button type="button" className={`flex min-h-11 w-full flex-col px-3 py-2 text-start text-gray-800 hover:bg-gray-50 ${focusRing} focus-visible:ring-inset dark:text-white/90 dark:hover:bg-white/5`} onClick={() => { setChosen(match.label); onChange(match.id); setQuery(''); }}>{match.label}<small className="text-gray-500 dark:text-gray-400">{match.context}</small></button></li>)}</ul> : <p className="p-3 text-gray-500 dark:text-gray-400">No matches.</p>}</div>}
  </div>;
}

export type Input = 'text' | 'textarea' | 'email' | 'tel' | 'date' | 'datetime' | 'checkbox' | 'select' | 'picker' | 'hidden';
export interface FieldSpec { key: string; label: string; input: Input; required?: boolean; max?: number; options?: [string, string][]; pickerKind?: string }
export interface FormError { status: number; message?: string; fields?: string[] }
type Values = Record<string, unknown>;
const t = (key: string, label: string, max: number, required = false): FieldSpec => ({ key, label, input: 'text', max, required });
const address: FieldSpec[] = [t('address1', 'Address line 1', 100), t('address2', 'Address line 2', 100), t('city', 'City', 100), t('state', 'State', 64), t('postalCode', 'Postal code', 20), t('country', 'Country', 100)];
const phone = (key: string, label: string): FieldSpec => ({ key, label, input: 'tel', max: 40 });
const picker = (key: string, label: string, pickerKind: string): FieldSpec => ({ key, label, input: 'picker', pickerKind });
const hidden = (key: string): FieldSpec => ({ key, label: key, input: 'hidden' });
const check = (key: string, label: string): FieldSpec => ({ key, label, input: 'checkbox' });
export const STATUSES: [string, string][] = [['NOT_STARTED', 'Not started'], ['STARTED', 'Started'], ['ON_SCHEDULE', 'On schedule'], ['BEHIND_SCHEDULE', 'Behind schedule'], ['MAINTENANCE', 'Maintenance'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']];
/** Mirrors the SCHEMAS in services/normalize.ts: every key the update services accept, in display order. */
export const FIELD_SPECS: Record<EditKind, FieldSpec[]> = {
  company: [t('name', 'Name', 200, true), ...address, phone('phone1', 'Phone'), phone('phone2', 'Phone 2'), phone('fax', 'Fax')],
  contact: [t('firstName', 'First name', 100, true), t('lastName', 'Last name', 100, true), { key: 'email1', label: 'Email', input: 'email', required: true, max: 254 }, { key: 'email2', label: 'Email 2', input: 'email', max: 254 }, t('title', 'Title', 100), phone('workPhone', 'Work phone'), phone('homePhone', 'Home phone'), phone('cellPhone', 'Cell phone'), phone('fax', 'Fax'), ...address],
  project: [t('name', 'Name', 255, true), { key: 'description', label: 'Description', input: 'textarea', required: true, max: 100000 }, { key: 'status', label: 'Status', input: 'select', options: STATUSES }, { key: 'startDate', label: 'Starts', input: 'date' }, { key: 'endDate', label: 'Ends', input: 'date' }, picker('companyId', 'Company', 'companies'), picker('contactId', 'Contact', 'contacts'), hidden('parentProjectId')],
  task: [t('title', 'Task name', 255, true), { key: 'body', label: 'Description', input: 'textarea', max: 100000 }, { key: 'startAt', label: 'Starts', input: 'datetime' }, { key: 'endAt', label: 'Due date', input: 'datetime' }, check('billable', 'Billable'), check('billed', 'Billed'), picker('projectId', 'Project', 'projects'), picker('companyId', 'Company', 'companies'), picker('contactId', 'Contact', 'contacts'), hidden('assigneeId')],
  call: [t('title', 'Subject', 255, true), { key: 'startAt', label: 'Starts', input: 'datetime' }, { key: 'endAt', label: 'Ends', input: 'datetime' }, check('billable', 'Billable'), check('billed', 'Billed'), check('followup', 'Follow-up needed'), picker('projectId', 'Project', 'projects'), picker('companyId', 'Company', 'companies'), picker('contactId', 'Contact', 'contacts'), hidden('calleeId'), hidden('taskId')],
  note: [t('title', 'Title', 200, true), { key: 'body', label: 'Note', input: 'textarea', max: 100000 }, { key: 'occurredAt', label: 'Occurred', input: 'datetime' }, picker('projectId', 'Project', 'projects'), picker('companyId', 'Company', 'companies'), picker('contactId', 'Contact', 'contacts'), hidden('taskId'), hidden('callId')],
};
const pad = (n: number) => String(n).padStart(2, '0');
/** ISO instant to the local `YYYY-MM-DDTHH:mm` a datetime-local input expects. */
export function toLocalInput(value: unknown) {
  if (typeof value !== 'string' || !value) return ''; const d = new Date(value); if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const nowLocal = () => toLocalInput(new Date().toISOString());
function start(kind: EditKind, initial: Values): Values {
  const out: Values = {};
  for (const spec of FIELD_SPECS[kind]) {
    const raw = initial[spec.key];
    out[spec.key] = spec.input === 'checkbox' ? raw === true : spec.input === 'datetime' ? toLocalInput(raw) : spec.input === 'date' ? typeof raw === 'string' ? raw.slice(0, 10) : '' : raw == null ? (spec.input === 'picker' || spec.input === 'hidden' ? null : '') : raw;
  }
  if (kind === 'note' && !out.occurredAt) out.occurredAt = nowLocal();
  return out;
}
function finish(kind: EditKind, values: Values): Values {
  const out: Values = {};
  for (const spec of FIELD_SPECS[kind]) {
    const value = values[spec.key];
    if (spec.input === 'checkbox') out[spec.key] = value === true;
    else if (spec.input === 'datetime') out[spec.key] = value ? new Date(String(value)).toISOString() : null;
    else if (spec.input === 'picker' || spec.input === 'hidden') out[spec.key] = value || null;
    else { const text = typeof value === 'string' ? value.trim() : ''; out[spec.key] = text || null; }
  }
  if (out.billed && !out.billable) out.billed = false;
  return out;
}
export interface RecordFormProps {
  kind: EditKind; initial: Values; onSubmit: (values: Values) => void; busy: boolean; formId: string; error?: FormError | null;
  onReload?: () => void; /** Picker keys shown as a locked parent line instead of a search box. */ locked?: Record<string, string>; labels?: Record<string, string>; hide?: string[]; children?: ReactNode;
}
/** Renders every field spec as a labelled Field; values survive any failure (FR-CRUD-04). */
export function RecordForm({ kind, initial, onSubmit, busy, formId, error, onReload, locked = {}, labels = {}, hide = [], children }: RecordFormProps) {
  const [values, setValues] = useState<Values>(() => ({ ...start(kind, initial), ...Object.fromEntries(Object.keys(locked).map(key => [key, initial[key] ?? null])) }));
  const [missing, setMissing] = useState<string[]>([]);
  const set = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    const required = FIELD_SPECS[kind].filter(spec => spec.required && !String(values[spec.key] ?? '').trim()).map(spec => spec.key);
    setMissing(required); if (required.length) return;
    onSubmit(finish(kind, values));
  };
  const bad = (key: string) => (error?.status === 422 && error.fields?.includes(key) ? 'Check this value' : missing.includes(key) ? 'Required' : undefined);
  return <form id={formId} onSubmit={submit} className="form-stack flex flex-col gap-4" noValidate>
    {Object.entries(locked).map(([key, text]) => <p key={key} className="locked-parent m-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/3 dark:text-gray-300" data-locked={key}>{text}</p>)}
    {FIELD_SPECS[kind].filter(spec => spec.input !== 'hidden' && !hide.includes(spec.key) && !(spec.key in locked)).map(spec => {
      const error = bad(spec.key); const value = values[spec.key]; const common = { error: !!error, disabled: busy };
      if (spec.input === 'picker') return <EntityPicker key={spec.key} label={spec.label} kind={spec.pickerKind!} value={(value as string) || undefined} valueLabel={labels[spec.key]} onChange={id => set(spec.key, id ?? null)} error={error} />;
      if (spec.input === 'checkbox') return <Checkbox key={spec.key} label={spec.label} checked={value === true} disabled={busy || (spec.key === 'billed' && values.billable !== true)} onChange={event => set(spec.key, event.target.checked)} />;
      return <Field key={spec.key} label={spec.label} error={error}>{spec.input === 'textarea' ? <TextArea {...common} value={String(value ?? '')} maxLength={spec.max} onChange={event => set(spec.key, event.target.value)} />
        : spec.input === 'select' ? <Select {...common} value={String(value ?? '')} onChange={event => set(spec.key, event.target.value)}><option value="">Not set</option>{spec.options!.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>
        : <TextInput {...common} type={spec.input === 'datetime' ? 'datetime-local' : spec.input} value={String(value ?? '')} maxLength={spec.max} required={spec.required} autoFocus={spec.key === FIELD_SPECS[kind][0].key} onChange={event => set(spec.key, event.target.value)} />}</Field>;
    })}
    {children}
    {error?.status === 409 ? <div role="alert" className="conflict flex items-center justify-between gap-3"><p className="field-error text-sm text-error-600 dark:text-error-400">{error.message}</p>{onReload && <Button type="button" onClick={onReload}>Reload</Button>}</div> : error && <FieldError>{error.message || 'The request could not be completed. Please try again.'}</FieldError>}
  </form>;
}
