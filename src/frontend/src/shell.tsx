import { useEffect, useId, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, service } from './api';
import type { SearchResults, User } from './contracts';
import { Dialog, EmptyState, ErrorState, Icon, LoadingState } from './primitives';
import AppLayout from './layout/AppLayout';
import type { NavSection } from './layout/AppSidebar';
import { Avatar } from './ui/Avatar';
import { Input } from './ui/Input';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import { BriefcaseIcon, BuildingIcon, CalendarIcon, CheckSquareIcon, NoteIcon, PhoneIcon, UserIcon } from './icons';
import { CreateDialog, EditDialog } from './dialogs';
import { ALLOWED_CHILDREN } from './contracts';
import { useUI } from './ui-context';
import { useService } from './use-service';
const sections: NavSection[] = [{ label: 'Overview', to: '/', end: true, icon: CalendarIcon }, { label: 'Companies', to: '/companies', icon: BuildingIcon }, { label: 'Contacts', to: '/contacts', icon: UserIcon }, { label: 'Projects', to: '/projects', icon: BriefcaseIcon }, { label: 'Tasks', to: '/tasks', icon: CheckSquareIcon }, { label: 'Calls', to: '/calls', icon: PhoneIcon }, { label: 'Notes', to: '/notes', icon: NoteIcon }];

function CommandPalette({ close }: { close: () => void }) {
  const [query, setQuery] = useState(''); const [debounced, setDebounced] = useState(''); const [active, setActive] = useState(0);
  const navigate = useNavigate(); const ui = useUI(); const listId = useId();
  useEffect(() => { const timer = setTimeout(() => { setDebounced(query); setActive(0); }, 150); return () => clearTimeout(timer); }, [query]);
  const results = useService<SearchResults>('search', { query: debounced, kinds: ['companies', 'contacts', 'projects', 'tasks', 'calls', 'notes'], limit: 20 }, debounced.length >= 2);
  const here = (kind: 'task' | 'call' | 'note') => ui.pageParent && ALLOWED_CHILDREN[ui.pageParent.kind].includes(kind) ? ui.pageParent : undefined;
  const actions = [{ label: 'New task', run: () => ui.openCreate('task', here('task')) }, { label: 'New call', run: () => ui.openCreate('call', here('call')) }, { label: 'New note', run: () => ui.openCreate('note', here('note')) }, { label: 'Sign out', run: () => { void service('session.destroy').then(() => navigate('/sign-in')).catch(error => ui.notify(error.message, true)); } }].filter(action => !query || action.label.toLowerCase().includes(query.toLowerCase()));
  const matches = results.data?.matches || [];
  const options = [...matches.map(match => ({ ...match, run: () => navigate(match.href) })), ...actions.map(action => ({ ...action, kind: 'actions', context: null }))];
  const choose = (index: number) => { if (options[index]) { close(); options[index].run(); } };
  const safeActive = Math.min(active, Math.max(0, options.length - 1));
  return <Dialog title="Jump to a record or action" close={close} className="command-palette max-w-2xl"><Input autoFocus data-autofocus className="palette-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your work…" role="combobox" aria-expanded="true" aria-controls={listId} aria-activedescendant={options.length ? `${listId}-${safeActive}` : undefined} onKeyDown={event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive((safeActive + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % Math.max(1, options.length)); }
    if (event.key === 'Enter') { event.preventDefault(); choose(safeActive); }
  }} />
    {results.isFetching && <LoadingState rows={2} />}{results.isError && debounced.length >= 2 && <ErrorState retry={() => void results.refetch()} message="Search could not be loaded." />}
    <ul role="listbox" id={listId} aria-label="Search results" className="palette-results m-0 mt-3 flex list-none flex-col gap-0.5 p-0">{options.map((option, index) => <li role="option" aria-selected={index === safeActive} className="flex cursor-pointer flex-col rounded-lg px-3 py-2 text-sm text-gray-800 aria-selected:bg-brand-50 dark:text-white/90 dark:aria-selected:bg-brand-500/15" id={`${listId}-${index}`} key={`${option.kind}-${option.label}-${index}`} onMouseMove={() => setActive(index)} onClick={() => choose(index)}><span className="kind-caption text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">{option.kind}</span><span>{option.label}</span>{option.context && <small className="text-gray-500 dark:text-gray-400">{option.context}</small>}</li>)}</ul>
    {!options.length && !results.isFetching && <EmptyState>No matching records or actions.</EmptyState>}
  </Dialog>;
}

export function AppShell() {
  const location = useLocation(); const navigate = useNavigate(); const client = useQueryClient(); const ui = useUI();
  const [palette, setPalette] = useState(false); const [account, setAccount] = useState(false);
  const user = useService<User>('session.current'); const profile = useService<{ isAdmin: boolean }>('account.read');
  useEffect(() => { const listener = () => { client.removeQueries({ queryKey: ['session.current'] }); navigate(`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`); }; window.addEventListener('wgd:session-expired', listener); return () => window.removeEventListener('wgd:session-expired', listener); }, [client, navigate, location]);
  useEffect(() => { if (user.error instanceof ApiError && user.error.status === 401) navigate(`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`, { replace: true }); }, [user.error, navigate, location]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !ui.dialogOpen) { event.preventDefault(); setPalette(value => !value); return; }
      if (palette || ui.dialogOpen || event.ctrlKey || event.metaKey || event.altKey || target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const kind = ({ t: 'task', c: 'call', n: 'note' } as const)[event.key.toLowerCase() as 't' | 'c' | 'n'];
      if (kind) { event.preventDefault(); ui.openCreate(kind, ui.pageParent && ALLOWED_CHILDREN[ui.pageParent.kind].includes(kind) ? ui.pageParent : undefined); }
    };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [palette, ui]);
  if (user.isPending) return <main className="page p-6"><LoadingState /></main>;
  if (user.isError) return <main className="page p-6"><ErrorState message="Your session could not be loaded." retry={() => void user.refetch()} /></main>;
  const initials = user.data.displayName;
  return <><a className="skip-link sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100000 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-brand-500 dark:focus:bg-gray-900" href="#main">Skip to content</a>
    <AppLayout sections={sections}
      search={<button type="button" className="command-trigger flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-500 shadow-xs hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5" onClick={() => setPalette(true)}><Icon name="search" /><span className="min-w-0 flex-1 truncate text-start">Jump to a record or action</span><span className="hidden items-center gap-1 sm:flex"><kbd className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs dark:border-gray-800 dark:bg-white/3">Ctrl</kbd><kbd className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs dark:border-gray-800 dark:bg-white/3">K</kbd></span></button>}
      account={<div className="account relative">
        <button type="button" className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500/60" aria-label={`Account: ${user.data.displayName}`} aria-haspopup="true" aria-expanded={account} aria-controls="account-menu" onClick={() => setAccount(value => !value)}><Avatar name={initials} /></button>
        <Dropdown isOpen={account} onClose={() => setAccount(false)} id="account-menu" className="account-menu">
          <p className="px-3 py-2 text-sm font-semibold text-gray-800 dark:text-white/90">{user.data.displayName}</p>
          <DropdownItem to="/account" onItemClick={() => setAccount(false)}>Change password</DropdownItem>
          {profile.data?.isAdmin === true && <DropdownItem to="/admin/users" onItemClick={() => setAccount(false)}>Users</DropdownItem>}
          <DropdownItem onClick={() => { void service('session.destroy').then(() => { client.clear(); navigate('/sign-in'); }).catch(error => ui.notify(error.message, true)); }}>Sign out</DropdownItem>
        </Dropdown>
      </div>}><Outlet /></AppLayout>
    {palette && <CommandPalette close={() => setPalette(false)} />}{ui.draft && <CreateDialog key={`${ui.draft.kind}-${ui.draft.parent?.id || ''}-${ui.draft.title || ''}`} />}{ui.edit && <EditDialog kind={ui.edit.kind} record={ui.edit.record} />}</>;
}
