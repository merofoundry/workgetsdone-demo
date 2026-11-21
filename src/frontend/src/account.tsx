import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, service } from './api';
import { useService } from './use-service';
import { useUI } from './ui-context';
import { Button, CardBody, ErrorState, Field, FieldError, LoadingState, PageHeader, Panel, mutedText } from './primitives';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
export interface Profile { id: string; email: string; displayName: string; userName: string | null; timezone: string; isAdmin: boolean; lastLogin: string | null; oauthProvider?: string | null }
/** IANA zone names from the browser, always including UTC and the stored value. */
export function timeZones(current: string): string[] {
  const listed: string[] = typeof (Intl as any).supportedValuesOf === 'function' ? (Intl as any).supportedValuesOf('timeZone') : [];
  return Array.from(new Set(['UTC', ...listed, current])).sort((a, b) => a.localeCompare(b));
}
function ProfileForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.displayName); const [timezone, setTimezone] = useState(profile.timezone); const [userName, setUserName] = useState(profile.userName ?? '');
  const client = useQueryClient(); const ui = useUI();
  useEffect(() => { setDisplayName(profile.displayName); setTimezone(profile.timezone); setUserName(profile.userName ?? ''); }, [profile]);
  const save = useMutation({
    mutationFn: () => service('account.update', { displayName, timezone, userName }),
    onSuccess: () => { ui.notify('Profile saved.'); void client.invalidateQueries({ queryKey: ['account.read'] }); void client.invalidateQueries({ queryKey: ['session.current'] }); },
  });
  const fields = save.error instanceof ApiError ? save.error.fields ?? [] : [];
  const submit = (event: FormEvent) => { event.preventDefault(); if (!displayName.trim()) return; save.mutate(); };
  return <form className="form-stack flex flex-col gap-4 p-5 sm:p-6" onSubmit={submit} aria-label="Profile">
    <Field label="Email"><Input value={profile.email} readOnly aria-readonly="true" /></Field>
    <Field label="Display name" error={!displayName.trim() ? 'Enter a display name.' : fields.includes('displayName') ? 'Check the display name.' : undefined}><Input required maxLength={255} value={displayName} onChange={event => setDisplayName(event.target.value)} /></Field>
    <Field label="Time zone" error={fields.includes('timezone') ? 'Choose a time zone from the list.' : undefined}><Select value={timezone} onChange={event => setTimezone(event.target.value)}>{timeZones(profile.timezone).map(zone => <option key={zone} value={zone}>{zone}</option>)}</Select></Field>
    <Field label="User name" error={fields.includes('userName') ? 'Use at most 64 characters.' : undefined}><Input maxLength={64} value={userName} onChange={event => setUserName(event.target.value)} /></Field>
    <div className="actions flex flex-wrap gap-2"><Button type="submit" variant="primary" busy={save.isPending}>Save profile</Button></div>
    {save.isError && <FieldError>{save.error.message}</FieldError>}
  </form>;
}
export function Account() {
  const me = useService<Profile>('account.read');
  return <div className="max-w-3xl"><PageHeader title="Account" subtitle="Your profile and sign-in details." />
    {me.isPending ? <LoadingState rows={4} /> : me.isError || !me.data ? <ErrorState retry={() => void me.refetch()} /> : <div className="flex flex-col gap-6">
      <Panel title="Profile"><ProfileForm profile={me.data} /></Panel>
      <Panel title="Google sign-in"><CardBody><p>{me.data.oauthProvider === 'google' ? 'Google sign-in is linked to this account.' : 'Google sign-in is not linked to this account.'}</p><p className={mutedText}>An administrator links or unlinks Google for your account.</p></CardBody></Panel>
      <Panel title="Password"><CardBody><p>Password changes are handled by an administrator for now.</p></CardBody></Panel>
    </div>}
  </div>;
}
