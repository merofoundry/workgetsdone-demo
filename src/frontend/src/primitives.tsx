import { useEffect, useState, type ButtonHTMLAttributes, type FormEventHandler, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import type { Kind } from './contracts';
import { Alert } from './ui/Alert';
import { Badge, type BadgeColor } from './ui/Badge';
import { Button as UIButton } from './ui/Button';
import { Card } from './ui/Card';
import { Label } from './ui/Label';
import { Modal } from './ui/Modal';
import { ChevronDownIcon, PlusIcon, SearchIcon } from './icons';
import { Input as TextInput } from './ui/Input';
import { cn, focusRing } from './utils';

export function Button({ children, variant = 'secondary', busy = false, hint, className, disabled, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger'; busy?: boolean; hint?: string; size?: 'sm' | 'md' }) {
  return <UIButton {...props} variant={variant} size={size} busy={busy} hint={hint} className={className} disabled={disabled}>{children}</UIButton>;
}
/** Pill toggle for a radiogroup of filters or kinds; `selected` mirrors aria-checked. */
export function ChipButton({ selected, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <UIButton {...props} size="sm" role="radio" aria-checked={selected} className={cn('chip rounded-full', selected && 'bg-brand-50 text-brand-600 ring-brand-300 hover:bg-brand-50 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/40 dark:hover:bg-brand-500/15', className)} />;
}
export function RadioGroup({ legend, children, disabled }: { legend: string; children: ReactNode; disabled?: boolean }) {
  return <fieldset className="radio-group m-0 grid min-w-0 gap-2 border-0 p-0" disabled={disabled}><legend className="mb-1 p-0 text-sm font-medium text-gray-700 dark:text-gray-400">{legend}</legend>{children}</fieldset>;
}
export function RadioOption({ children, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { children: ReactNode }) {
  return <label className="radio-option flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200"><input {...props} type="radio" className="size-4 accent-brand-500" />{children}</label>;
}
/** Text link in the brand colour with a visible keyboard ring. */
export const linkClass = cn(focusRing, 'rounded-sm text-brand-600 hover:underline dark:text-brand-400');
/** Page title block: heading, one-line summary, and the page actions on the right. */
export function PageHeader({ title, subtitle, badge, actions, recordId }: { title: ReactNode; subtitle?: ReactNode; badge?: ReactNode; actions?: ReactNode; recordId?: string }) {
  return <header className="page-header mb-6 flex flex-wrap items-center justify-between gap-4" data-record-id={recordId}>
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{title}</h1>{badge}</div>{subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}</div>
    {actions && <div className="actions flex flex-wrap gap-2">{actions}</div>}
  </header>;
}
/** Label and value rows for a details rail. */
export function DetailList({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return <dl className="details-list flex flex-col gap-3 p-5 text-sm sm:px-6">{rows.map(row => <div key={row.label} className="grid grid-cols-[1fr_1.4fr] gap-2"><dt className="text-gray-500 dark:text-gray-400">{row.label}</dt><dd className="m-0 wrap-anywhere text-gray-800 dark:text-white/90">{row.value}</dd></div>)}</dl>;
}
/** Padded body for a Card that holds loose content. */
export function CardBody({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn('flex flex-col gap-3 p-5 text-sm text-gray-700 sm:px-6 dark:text-gray-300', className)}>{children}</div>; }
export function FieldError({ children }: { children: ReactNode }) { return <p role="alert" className="field-error text-sm text-error-600 dark:text-error-400">{children}</p>; }
export const mutedText = 'text-sm text-gray-500 dark:text-gray-400';
export function Panel({ title, action, children, danger = false, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; danger?: boolean; className?: string }) {
  return <Card title={title} action={action} danger={danger} className={cn('panel', className)}>{children}</Card>;
}
const tagColors: Record<string, BadgeColor> = { neutral: 'light', active: 'primary', proposed: 'warning', billable: 'success', late: 'error' };
export function Tag({ children, variant = 'neutral' }: { children: ReactNode; variant?: string }) { return <Badge color={tagColors[variant] ?? 'light'}>{children}</Badge>; }
export function StatusTag({ status }: { status: string }) {
  const labels: Record<string, string> = { STARTED: 'Active', ACTIVE: 'Active', PROPOSED: 'Proposed', ON_HOLD: 'On hold', COMPLETED: 'Completed' };
  return <Tag variant={['STARTED', 'ACTIVE'].includes(status) ? 'active' : status === 'PROPOSED' ? 'proposed' : 'neutral'}>{labels[status] || status}</Tag>;
}
const markerShape: Record<Kind, string> = { call: 'rounded-full bg-brand-500', task: 'bg-success-600', note: 'rounded-full border-2 border-gray-500', file: 'border-2 border-gray-500' };
export function Marker({ kind }: { kind: Kind }) { return <span className={cn('marker inline-block size-2.5 shrink-0', markerShape[kind])} aria-label={kind} />; }
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) { return <div className="empty-state flex flex-col gap-3 p-6 text-gray-500 dark:text-gray-400"><p>{children}</p>{action && <div className="actions flex flex-wrap gap-2">{action}</div>}</div>; }
export function ErrorState({ message = 'This information could not be loaded.', retry }: { message?: string; retry: () => void }) {
  return <Alert variant="error" role="alert" message={message} className="error-state"><Button onClick={retry}>Retry</Button></Alert>;
}
export function LoadingState({ rows = 3 }: { rows?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setVisible(true), 150); return () => clearTimeout(timer); }, []);
  return <div className="loading-state flex flex-col gap-2 p-4" role="status" aria-label="Loading">{visible && Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton h-5 animate-pulse rounded-lg bg-gray-200 motion-reduce:animate-none dark:bg-gray-800" />)}</div>;
}
export function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return <label className="field flex min-w-0 flex-col"><Label as="span">{label}</Label>{children}{error && <span className="field-error mt-1.5 text-sm text-error-600 dark:text-error-400">{error}</span>}</label>;
}
export function Dialog({ title, children, footer, close, busy = false, className = '' }: { title: string; children: ReactNode; footer?: ReactNode; close: () => void; busy?: boolean; className?: string }) {
  return <Modal title={title} footer={footer} onClose={close} busy={busy} className={className}>{children}</Modal>;
}
export function Icon({ name }: { name: 'search' | 'chevron' | 'plus' }) {
  const Glyph = name === 'search' ? SearchIcon : name === 'chevron' ? ChevronDownIcon : PlusIcon;
  return <Glyph aria-hidden="true" className={cn('icon size-5 shrink-0', name === 'chevron' && '-rotate-90')} />;
}

/** The bordered strip that separates a toolbar, search or pager from the content next to it. Pass `edge="t"` for a strip below the content. */
export function SectionStrip({ as: Tag = 'div', edge = 'b', className, ...props }: { as?: 'div' | 'footer' | 'form'; edge?: 'b' | 't' } & Omit<HTMLAttributes<HTMLElement>, 'onSubmit'> & { onSubmit?: FormEventHandler<HTMLElement> }) {
  return <Tag {...(props as object)} className={cn('border-gray-100 p-4 sm:px-6 dark:border-gray-800', edge === 'b' ? 'border-b' : 'border-t', className)} />;
}

export function SearchField({ collection, query, update, extra }: { collection: string; query: string; update: (field: string, value: string) => void; extra?: ReactNode }) {
  return <SectionStrip className="record-filters flex flex-wrap items-center justify-between gap-3">
    <label className="record-search min-w-0 max-w-md flex-1"><span className="sr-only">Search {collection}</span><TextInput type="search" placeholder={`Search ${collection}…`} value={query} onChange={event => update('q', event.target.value)} maxLength={255} /></label>
    {extra}
  </SectionStrip>;
}
export function Pagination({ cursor, next, update }: { cursor: number; next: string | null; update: (field: string, value: string) => void }) {
  return <SectionStrip as="footer" edge="t" className="record-pagination flex items-center justify-between gap-2"><Button disabled={cursor === 0} onClick={() => update('cursor', String(Math.max(0, cursor - 25)))}>Previous</Button><span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">Page {Math.floor(cursor / 25) + 1}</span><Button disabled={!next} onClick={() => update('cursor', next!)}>Next</Button></SectionStrip>;
}
