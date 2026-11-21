import type { ReactNode } from 'react';
import { Button, Field, SectionStrip } from './primitives';
import { cn, focusRing } from './utils';
import { Checkbox } from './ui/Checkbox';
import { Input as TextInput } from './ui/Input';
import { Select } from './ui/Select';
import { EntityPicker } from './dialogs';

export type FilterCollection = 'tasks' | 'calls' | 'notes' | 'projects' | 'companies' | 'contacts';
type Option = [string, string];
export type FilterSpec =
  | { key: string; label: string; kind: 'bool' }
  | { key: string; label: string; kind: 'date' }
  | { key: string; label: string; kind: 'select'; options: Option[] }
  | { key: string; label: string; kind: 'ref'; refKind: 'projects' | 'companies' | 'contacts' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: Option[] = [['NOT_STARTED', 'Not started'], ['STARTED', 'Started'], ['ON_SCHEDULE', 'On schedule'], ['BEHIND_SCHEDULE', 'Behind schedule'], ['MAINTENANCE', 'Maintenance'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled']];
const PARENTS: Option[] = [['project', 'Project'], ['company', 'Company'], ['contact', 'Contact'], ['task', 'Task'], ['call', 'Call']];
const activity = (): FilterSpec[] => [
  { key: 'billable', label: 'Billable', kind: 'bool' }, { key: 'billed', label: 'Billed', kind: 'bool' },
  { key: 'from', label: 'From', kind: 'date' }, { key: 'to', label: 'To', kind: 'date' },
  { key: 'projectId', label: 'Project', kind: 'ref', refKind: 'projects' }, { key: 'companyId', label: 'Company', kind: 'ref', refKind: 'companies' }, { key: 'contactId', label: 'Contact', kind: 'ref', refKind: 'contacts' },
];
const sortField = (options: Option[]): FilterSpec => ({ key: 'sort', label: 'Sort by', kind: 'select', options });

/**
 * The filters and sorts each list offers, matching the allow-list in byof-normalize. The first sort option is the default
 * and sends no parameter. Direction is fixed per sort and named in the label. Assignee (tasks) and owner (projects) are
 * accepted by the services but have no user search service, so the interface does not offer them.
 */
export const FILTERS: Record<FilterCollection, FilterSpec[]> = {
  tasks: [...activity(), sortField([['date', 'Date (newest first)'], ['title', 'Title (A to Z)'], ['due', 'Due (soonest first)']])],
  calls: [...activity(), sortField([['date', 'Date (newest first)'], ['title', 'Subject (A to Z)'], ['due', 'Start (soonest first)']])],
  notes: [{ key: 'parentKind', label: 'Attached to', kind: 'select', options: PARENTS }, { key: 'from', label: 'From', kind: 'date' }, { key: 'to', label: 'To', kind: 'date' }, sortField([['date', 'Date (newest first)'], ['title', 'Title (A to Z)']])],
  projects: [{ key: 'status', label: 'Status', kind: 'select', options: STATUSES }, { key: 'companyId', label: 'Company', kind: 'ref', refKind: 'companies' }, sortField([['activity', 'Recent activity (newest first)'], ['name', 'Name (A to Z)'], ['start', 'Start date (earliest first)']])],
  companies: [sortField([['name', 'Name (A to Z)'], ['city', 'City (A to Z)']])],
  contacts: [{ key: 'companyId', label: 'Company', kind: 'ref', refKind: 'companies' }, sortField([['lastName', 'Last name (A to Z)'], ['firstName', 'First name (A to Z)']])],
};

/** Reads the URL into service input. Unknown or malformed parameters are dropped, so a hand-typed value never reaches the service. */
export function filterInput(collection: FilterCollection, params: URLSearchParams): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const spec of FILTERS[collection]) {
    const value = params.get(spec.key); if (!value) continue;
    if (spec.kind === 'bool') { if (value === '1') out[spec.key] = true; }
    else if (spec.kind === 'date') { if (DAY.test(value)) out[spec.key] = value; }
    else if (spec.kind === 'ref') { if (UUID.test(value)) out[spec.key] = value; }
    else if (spec.options.some(([id]) => id === value) && !(spec.key === 'sort' && value === spec.options[0][0])) out[spec.key] = value;
  }
  return out;
}
/** True when a narrowing filter is in effect (a sort alone does not narrow). */
export const isFiltered = (input: Record<string, unknown>) => Object.keys(input).some(key => key !== 'sort');
export const isCustomised = (input: Record<string, unknown>) => Object.keys(input).length > 0;
export const filterKeys = (collection: FilterCollection) => FILTERS[collection].map(spec => spec.key);

export function FilterBar({ collection, params, update, clear }: { collection: FilterCollection; params: URLSearchParams; update: (field: string, value: string) => void; clear: () => void }): ReactNode {
  const input = filterInput(collection, params);
  return <SectionStrip className="filter-bar flex flex-wrap items-end gap-3" role="group" aria-label={`Filter ${collection}`}>
    {FILTERS[collection].map(spec => {
      if (spec.kind === 'bool') return <div key={spec.key} className="flex min-h-11 items-center"><Checkbox label={spec.label} checked={input[spec.key] === true} onChange={event => update(spec.key, event.target.checked ? '1' : '')} /></div>;
      if (spec.kind === 'date') return <Field key={spec.key} label={spec.label}><TextInput type="date" value={input[spec.key] ? String(input[spec.key]) : ''} onChange={event => update(spec.key, event.target.value)} /></Field>;
      if (spec.kind === 'ref') return <EntityPicker key={spec.key + ':' + (input[spec.key] ? 'set' : 'unset')} label={spec.label} kind={spec.refKind} value={input[spec.key] ? String(input[spec.key]) : undefined} valueLabel="Linked record" onChange={id => update(spec.key, id ?? '')} />;
      return <Field key={spec.key} label={spec.label}><Select value={String(input[spec.key] ?? '')} onChange={event => update(spec.key, event.target.value)}>
        <option value="">{spec.key === 'sort' ? spec.options[0][1] : 'Any'}</option>{spec.options.filter(([id], index) => !(spec.key === 'sort' && index === 0)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></Field>;
    })}
    {isCustomised(input) && <Button type="button" onClick={clear}>Clear filters</Button>}
  </SectionStrip>;
}

/** Class for a whole-row link in a record list. The row stays one link so its accessible name does not change. */
export const rowLinkClass = cn(focusRing, 'flex flex-wrap items-center gap-3 px-5 py-4 text-gray-800 hover:bg-gray-50 focus-visible:ring-inset sm:px-6 dark:text-white/90 dark:hover:bg-white/3');
