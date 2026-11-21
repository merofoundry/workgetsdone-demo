import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError } from './api';
import { AssociationsPanel } from './associations';
import type { Company, CompanySummary, Contact, ContactSummary } from './contracts';
import { DeleteAction } from './delete';
import { FilterBar, filterInput, filterKeys, isFiltered, rowLinkClass } from './filters';
import { CreateActions } from './overview';
import { Button, CardBody, DetailList, EmptyState, ErrorState, LoadingState, PageHeader, Pagination, Panel, SearchField, StatusTag, linkClass, mutedText } from './primitives';
import { Breadcrumb } from './ui/Breadcrumb';
import { AccessCard } from './sharing';
import { TimelinePanel, useTimelinePrefetch, type TimelineService } from './timeline';
import { useUI, usePageParent } from './ui-context';
import { useService } from './use-service';

type List<T> = { items: T[]; total: number; nextCursor: string | null };
const present = (...values: (string | null | undefined)[]) => values.filter(Boolean).join(' · ');
const place = (...values: (string | null | undefined)[]) => values.filter(Boolean).join(', ');
function EntityList<T extends { id: string }>({ collection, singular, row }: { collection: 'companies' | 'contacts'; singular: string; row: (item: T) => ReactNode }) {
  const [params, setParams] = useSearchParams(); const query = params.get('q') || '';
  const cursor = /^\d+$/.test(params.get('cursor') || '') ? Number(params.get('cursor')) : 0;
  const ui = useUI(); const filters = filterInput(collection, params);
  const result = useService<List<T>>(`${collection}.list`, { query, cursor: Math.min(cursor, 10000), pageSize: 25, ...filters });
  const clear = () => setParams(current => { const next = new URLSearchParams(current); next.delete('cursor'); for (const key of filterKeys(collection)) next.delete(key); return next; });
  const update = (field: string, value: string) => setParams(current => { const next = new URLSearchParams(current); next.delete('cursor'); if (value) next.set(field, value); else next.delete(field); return next; });
  const label = collection[0].toUpperCase() + collection.slice(1);
  return <><PageHeader title={label} subtitle={result.data ? `${result.data.total} ${collection} ${isFiltered(filters) ? 'match these filters' : 'in this view'}` : `Your ${collection}, in one place`} actions={<Button variant="primary" onClick={() => ui.openCreate(singular as 'company' | 'contact')}>New {singular}</Button>} />
    <Panel><SearchField collection={collection} query={query} update={update} /><FilterBar collection={collection} params={params} update={update} clear={clear} />
      {result.isPending ? <LoadingState rows={5} /> : result.isError ? <div className="p-4"><ErrorState message={`Your ${collection} could not be loaded.`} retry={() => void result.refetch()} /></div> : !result.data.items.length ? <EmptyState>{isFiltered(filters) ? `No ${collection} match these filters.` : query ? `No ${collection} match your search.` : `No ${collection} in this view yet.`}</EmptyState> : <ul className="divide-y divide-gray-100 dark:divide-gray-800">{result.data.items.map(item => <li key={item.id}>{row(item)}</li>)}</ul>}
      {result.data && (cursor > 0 || result.data.nextCursor) && <Pagination cursor={cursor} next={result.data.nextCursor} update={update} />}
    </Panel></>;
}
export const CompanyList = () => <EntityList<CompanySummary> collection="companies" singular="company" row={item => <Link className={`record-project ${rowLinkClass}`} to={`/companies/${item.id}`} data-record-id={item.id}><div className="min-w-0 flex-1 wrap-anywhere"><strong className="font-medium">{item.name}</strong><span className={`mt-1 block ${mutedText}`}>{present(place(item.city, item.state), item.primaryContactName) || 'No location or contact yet'}</span></div><span className={`basis-full tabular-nums sm:basis-auto ${mutedText}`}>{item.projects} projects · {item.contacts} contacts</span></Link>} />;
export const ContactList = () => <EntityList<ContactSummary> collection="contacts" singular="contact" row={item => <Link className={`record-project ${rowLinkClass}`} to={`/contacts/${item.id}`} data-record-id={item.id}><div className="min-w-0 flex-1 wrap-anywhere"><strong className="font-medium">{item.name}</strong><span className={`mt-1 block ${mutedText}`}>{present(item.title, item.email) || 'No title or email yet'}</span></div><span className={mutedText}>{item.companyNames.join(', ')}</span></Link>} />;

function Detail({ label, rows }: { label: string; rows: [string, string | null | undefined][] }) {
  const shown = rows.filter(([, value]) => value);
  return <Panel title={label}>{shown.length ? <DetailList rows={shown.map(([name, value]) => ({ label: name, value }))} /> : <CardBody><p className={mutedText}>Nothing recorded yet.</p></CardBody>}</Panel>;
}
function EntityScreen<T extends { name: string; permissions: { write: boolean; delete?: boolean; share?: boolean } }>({ collection, singular, service, timeline, subtitle, rail }: { collection: 'companies' | 'contacts'; singular: string; service: string; timeline: TimelineService; subtitle: (item: T) => string; rail: (item: T) => ReactNode }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const ui = useUI(); const result = useService<T>(service, { id }); useTimelinePrefetch(timeline, id); const kind = singular as 'company' | 'contact'; usePageParent(kind, id, result.data?.name); const label = collection[0].toUpperCase() + collection.slice(1);
  if (result.isPending) return <LoadingState rows={5} />;
  if (result.isError) return result.error instanceof ApiError && result.error.status === 404 ? <EmptyState action={<Link className={linkClass} to={`/${collection}`}>Back to {label}</Link>}>This {singular} could not be found.</EmptyState> : <ErrorState message={`This ${singular} could not be loaded.`} retry={() => void result.refetch()} />;
  const item = result.data;
  return <><div className="breadcrumbs mb-4"><Breadcrumb items={[{ label, to: `/${collection}` }]} current={item.name} /></div>
    <PageHeader recordId={id} title={item.name} subtitle={subtitle(item)} actions={(item.permissions.write || item.permissions.delete) && <>{item.permissions.write && <><Button onClick={() => ui.openEdit(kind, item)}>Edit</Button><CreateActions parent={{ kind, id, name: item.name }} /></>}{item.permissions.delete && <DeleteAction kind={kind} id={id} name={item.name} onDeleted={() => navigate(`/${collection}`)} />}</>} />
    <div className="project-columns grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"><TimelinePanel service={timeline} id={id} canWrite={item.permissions.write} quickAddParent={{ kind, id, name: item.name }} /><aside aria-label="Details" className="details-rail flex min-w-0 flex-col gap-6">{rail(item)}{item.permissions.share && <AccessCard kind={kind} id={id} />}</aside></div></>;
}
export const CompanyDetail = () => <EntityScreen<Company> collection="companies" singular="company" service="companies.read" timeline="companies.timeline" subtitle={c => present(place(c.city, c.state), c.primaryContactName) || 'Company'} rail={c => <>
  <Detail label="Details" rows={[['Address', present(c.address1, c.address2)], ['City', place(c.city, c.state)], ['Postal code', c.postalCode], ['Country', c.country], ['Phone', c.phone], ['Phone 2', c.phone2], ['Fax', c.fax]]} />
  <AssociationsPanel kind="company" record={c} />
  <Panel title="Projects"><CardBody>{c.projectList.length ? c.projectList.map(project => <div className="subproject flex flex-wrap items-center justify-between gap-2" key={project.id}><Link className={linkClass} to={`/projects/${project.id}`}>{project.name}</Link><StatusTag status={project.status} /></div>) : <p className={mutedText}>No projects yet.</p>}</CardBody></Panel></>} />;
export const ContactDetail = () => <EntityScreen<Contact> collection="contacts" singular="contact" service="contacts.read" timeline="contacts.timeline" subtitle={c => present(c.title, c.companyNames.join(', ')) || 'Contact'} rail={c => <>
  <Detail label="Details" rows={[['Email', c.email], ['Email 2', c.email2], ['Work phone', c.workPhone || c.phone], ['Home phone', c.homePhone], ['Cell phone', c.cellPhone], ['Fax', c.fax], ['Address', present(c.address1, c.address2)], ['City', place(c.city, c.state)], ['Postal code', c.postalCode], ['Country', c.country]]} />
  <AssociationsPanel kind="contact" record={c} /></>} />;
