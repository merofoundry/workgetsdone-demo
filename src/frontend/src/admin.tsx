import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { service, submitForm } from './api';
import { useService } from './use-service';
import { useUI } from './ui-context';
import { timeZones, type Profile } from './account';
import { ConfirmDialog } from './dialogs';
import { Button, Dialog, EmptyState, ErrorState, Field, FieldError, LoadingState, PageHeader, Panel, Tag, linkClass, mutedText } from './primitives';
import { Checkbox } from './ui/Checkbox';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from './ui/Table';
/** Form user_create_authenticated (administrator-only account creation; the submit route hashes the password). */
export const USER_CREATE_FORM = '2b149237-3d50-407d-a6b7-e87978ac59e0';
export interface UserRow { id: string; email: string; displayName: string; userName: string | null; isActive: boolean; isAdmin: boolean; lastLogin: string | null; timezone: string; oauthProvider?: string | null }
const lastLogin = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never';
function NewUserDialog({ close }: { close: () => void }) {
  const [email, setEmail] = useState(''); const [displayName, setDisplayName] = useState(''); const [userName, setUserName] = useState(''); const [timezone, setTimezone] = useState('UTC'); const [password, setPassword] = useState('');
  const client = useQueryClient(); const ui = useUI();
  const create = useMutation({
    mutationFn: () => submitForm(USER_CREATE_FORM, { email: email.trim(), password, display_name: displayName.trim(), user_name: (userName.trim() || email.trim()).slice(0, 64), timezone }),
    onSuccess: () => { setPassword(''); ui.notify('User created. Pass the initial password on out of band.'); void client.invalidateQueries({ queryKey: ['users.list'] }); close(); },
  });
  const short = password.length > 0 && password.length < 12;
  const submit = (event: FormEvent) => { event.preventDefault(); if (!email.includes('@') || !displayName.trim() || password.length < 12 || password.length > 128) return; create.mutate(); };
  return <Dialog title="New user" close={close} busy={create.isPending} footer={<><Button disabled={create.isPending} onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="new-user" busy={create.isPending}>Create user</Button></>}>
    <form id="new-user" className="form-stack flex flex-col gap-4" onSubmit={submit} autoComplete="off">
      <Field label="Email"><Input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></Field>
      <Field label="Display name"><Input required maxLength={255} value={displayName} onChange={event => setDisplayName(event.target.value)} /></Field>
      <Field label="User name"><Input maxLength={64} placeholder="Defaults to the email" value={userName} onChange={event => setUserName(event.target.value)} /></Field>
      <Field label="Time zone"><Select value={timezone} onChange={event => setTimezone(event.target.value)}>{timeZones('UTC').map(zone => <option key={zone} value={zone}>{zone}</option>)}</Select></Field>
      <Field label="Initial password" error={short ? 'Use at least 12 characters.' : undefined}><Input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /></Field>
      <p className={`text-sm ${mutedText}`}>Pass the initial password on out of band. It is not shown again.</p>
      {create.isError && <FieldError>{create.error.message}</FieldError>}
    </form>
  </Dialog>;
}
function EditUserDialog({ user, close }: { user: UserRow; close: () => void }) {
  const [displayName, setDisplayName] = useState(user.displayName); const [timezone, setTimezone] = useState(user.timezone); const [subject, setSubject] = useState(''); const [unlink, setUnlink] = useState(false);
  const client = useQueryClient(); const ui = useUI();
  const save = useMutation({
    mutationFn: () => {
      // FED-03: provider and subject travel together. Omitted keys leave the link as it is (users.list never returns the subject).
      const link = unlink && user.oauthProvider ? { oauthProvider: null, oauthSubject: null } : subject.trim() ? { oauthProvider: 'google', oauthSubject: subject.trim() } : {};
      return service('users.update', { id: user.id, displayName: displayName.trim(), timezone, isActive: user.isActive, ...link });
    },
    onSuccess: () => { ui.notify('User saved.'); void client.invalidateQueries({ queryKey: ['users.list'] }); close(); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); if (displayName.trim()) save.mutate(); };
  return <Dialog title="Edit user" close={close} busy={save.isPending} footer={<><Button disabled={save.isPending} onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="edit-user" busy={save.isPending}>Save user</Button></>}>
    <form id="edit-user" className="form-stack flex flex-col gap-4" onSubmit={submit}>
      <Field label="Email"><Input value={user.email} readOnly aria-readonly="true" /></Field>
      <Field label="Display name"><Input required maxLength={255} value={displayName} onChange={event => setDisplayName(event.target.value)} /></Field>
      <Field label="Time zone"><Select value={timezone} onChange={event => setTimezone(event.target.value)}>{timeZones(user.timezone).map(zone => <option key={zone} value={zone}>{zone}</option>)}</Select></Field>
      <Field label="Google account subject"><Input maxLength={255} autoComplete="off" value={subject} disabled={unlink} placeholder={user.oauthProvider ? 'Linked. Enter a new subject to replace it.' : ''} onChange={event => setSubject(event.target.value)} /></Field>
      <p className={`text-sm ${mutedText}`}>From the Google account's <code className="rounded bg-gray-100 px-1 dark:bg-white/5">sub</code> claim. Leave empty to keep the current link state.</p>
      {user.oauthProvider && <Checkbox label="Unlink the Google account" checked={unlink} onChange={event => setUnlink(event.target.checked)} />}
      {save.isError && <FieldError>{save.error.message}</FieldError>}
    </form>
  </Dialog>;
}
function UserTable({ users, selfId }: { users: UserRow[]; selfId: string }) {
  const [editing, setEditing] = useState<UserRow | null>(null); const [toggling, setToggling] = useState<UserRow | null>(null);
  const client = useQueryClient(); const ui = useUI();
  const toggle = useMutation({
    mutationFn: (user: UserRow) => service('users.update', { id: user.id, displayName: user.displayName, timezone: user.timezone, isActive: !user.isActive }),
    onSuccess: (_data, user) => { ui.notify(user.isActive ? 'User deactivated.' : 'User reactivated.'); setToggling(null); void client.invalidateQueries({ queryKey: ['users.list'] }); },
  });
  return <>
    <Table className="user-table"><TableHeader><TableRow><TableCell isHeader>Name</TableCell><TableCell isHeader>Email</TableCell><TableCell isHeader>User name</TableCell><TableCell isHeader>Time zone</TableCell><TableCell isHeader>Role</TableCell><TableCell isHeader>Sign-in</TableCell><TableCell isHeader>Status</TableCell><TableCell isHeader>Last sign-in</TableCell><TableCell isHeader><span className="sr-only">Actions</span></TableCell></TableRow></TableHeader>
      <TableBody>{users.map(user => <TableRow key={user.id}>
        <TableCell>{user.displayName}</TableCell><TableCell>{user.email}</TableCell><TableCell>{user.userName ?? ''}</TableCell><TableCell>{user.timezone}</TableCell>
        <TableCell>{user.isAdmin && <Tag variant="active">Administrator</Tag>}</TableCell><TableCell>{user.oauthProvider === 'google' && <Tag variant="neutral">Google</Tag>}</TableCell><TableCell><Tag variant={user.isActive ? 'neutral' : 'late'}>{user.isActive ? 'Active' : 'Inactive'}</Tag></TableCell><TableCell>{lastLogin(user.lastLogin)}</TableCell>
        <TableCell><div className="actions flex justify-end gap-2"><Button size="sm" aria-label={`Edit ${user.displayName}`} onClick={() => setEditing(user)}>Edit</Button>{user.id !== selfId && <Button size="sm" aria-label={`${user.isActive ? 'Deactivate' : 'Reactivate'} ${user.displayName}`} onClick={() => { toggle.reset(); setToggling(user); }}>{user.isActive ? 'Deactivate' : 'Reactivate'}</Button>}</div></TableCell>
      </TableRow>)}</TableBody></Table>
    {editing && <EditUserDialog user={editing} close={() => setEditing(null)} />}
    {toggling && <ConfirmDialog title={toggling.isActive ? 'Deactivate user' : 'Reactivate user'} message={toggling.isActive ? `${toggling.displayName} will no longer be able to sign in or be chosen when sharing.` : `${toggling.displayName} will be able to sign in again.`} close={() => setToggling(null)} busy={toggle.isPending} confirm={() => toggle.mutate(toggling)} error={toggle.error?.message} />}
  </>;
}
export function Users() {
  const me = useService<Profile>('account.read'); const isAdmin = me.data?.isAdmin === true;
  const list = useService<{ users: UserRow[] }>('users.list', {}, isAdmin); const [creating, setCreating] = useState(false);
  if (me.isPending) return <div><LoadingState rows={4} /></div>;
  if (me.isError) return <div><ErrorState retry={() => void me.refetch()} /></div>;
  if (!isAdmin) return <EmptyState action={<Link className={linkClass} to="/">Back to Overview</Link>}>This page could not be found.</EmptyState>;
  return <div><PageHeader title="Users" subtitle="Accounts that can sign in to WorkGetsDone." actions={<Button variant="primary" onClick={() => setCreating(true)}>New user</Button>} />
    <Panel>{list.isPending ? <LoadingState rows={4} /> : list.isError || !list.data ? <div className="p-4"><ErrorState retry={() => void list.refetch()} /></div> : <UserTable users={list.data.users} selfId={me.data!.id} />}</Panel>
    {creating && <NewUserDialog close={() => setCreating(false)} />}
  </div>;
}
