import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { googleStartHref, service } from './api';
import { Alert } from './ui/Alert';
import { Button, Field, FieldError, linkClass, mutedText } from './primitives';
import { Input } from './ui/Input';
import { focusRing } from './utils';
import { demoAccounts } from './demo-accounts';
export function safeReturnPath(value: string | null) { return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.startsWith('/sign-in') ? value : '/'; }
/** TailAdmin sign-in layout: the form on the left, a brand panel on the right at wide widths. No sign-up link and no social buttons beyond the linked-account Google link. */
export function SignIn() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [params] = useSearchParams(); const navigate = useNavigate(); const client = useQueryClient();
  const google = useQuery({ queryKey: ['google-start-href'], queryFn: googleStartHref, retry: false, staleTime: Infinity });
  const login = useMutation({ mutationFn: () => service('session.login', { email, password }), onSuccess: () => { client.clear(); navigate(safeReturnPath(params.get('returnTo')), { replace: true }); } });
  const submit = (event: FormEvent) => { event.preventDefault(); login.mutate(); };
  return <main className="sign-in min-h-screen bg-white text-gray-800 lg:grid lg:grid-cols-2 dark:bg-gray-900 dark:text-gray-100">
    <div className="flex min-h-screen flex-col justify-center px-6 py-10 sm:px-12">
      <div className="mx-auto w-full max-w-md">
        <div className="brand mb-8 flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white"><span className="brand-tile grid size-8 place-items-center rounded-lg bg-brand-500 text-sm text-white">W</span><span>WorkGetsDone</span></div>
        <section className="panel flex flex-col gap-5"><div><h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Sign in to your work</h1><p className={`mt-1 ${mutedText}`}>Your projects, conversations, and next steps.</p></div>
          {params.get('changed') === '1' && <Alert variant="success" role="status" message="Your password was changed. Sign in again." className="notice" />}
          <form className="form-stack flex flex-col gap-4" onSubmit={submit}>
            <Field label="Email"><Input autoFocus type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></Field>
            <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></Field>
            <Button type="submit" variant="primary" busy={login.isPending} className="w-full">Sign in</Button>
            {login.isError && <FieldError>{login.error.message}</FieldError>}
          </form>
          <section aria-labelledby="demo-heading" className="demo flex flex-col gap-3 border-t border-gray-200 pt-5 dark:border-gray-800">
            <div><h2 id="demo-heading" className="text-base font-semibold text-gray-800 dark:text-white/90">Try the demo</h2><p className={`mt-1 ${mutedText}`}>Sign in as Bob or Jane. Change anything you like: the demo data goes back to its starting point every hour.</p></div>
            {demoAccounts.map(account => <div key={account.name} className="demo-account flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-200 ring-inset dark:bg-white/[0.03] dark:ring-gray-800">
              <dl className="min-w-0 text-sm text-gray-700 dark:text-gray-300">
                <div className="flex flex-wrap gap-x-2"><dt className="font-medium">Email</dt><dd className="break-all font-mono">{account.email}</dd></div>
                <div className="flex flex-wrap gap-x-2"><dt className="font-medium">Password</dt><dd className="break-all font-mono">{account.password}</dd></div>
              </dl>
              <Button type="button" size="sm" onClick={() => { setEmail(account.email); setPassword(account.password); }}>Use {account.name}'s login</Button>
            </div>)}
          </section>
          {google.data && <div className="federated flex flex-col gap-3 border-t border-gray-200 pt-5 dark:border-gray-800"><a className={`button inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 ${focusRing} dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-white/5`} href={google.data}>Continue with Google</a><p className={mutedText}>Google sign-in works for accounts an administrator has linked. It does not create accounts.</p></div>}
        </section>
        <p className={`created-by mt-8 ${mutedText}`}>Created by <a className={linkClass} href="https://merofoundry.com" rel="noopener">merofoundry.com</a></p>
      </div>
    </div>
    <div aria-hidden="true" className="hidden items-center justify-center bg-brand-950 p-12 lg:flex"><div className="max-w-sm text-center"><div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-brand-500 text-3xl font-bold text-white">W</div><p className="text-xl font-bold text-white">WorkGetsDone</p></div></div>
  </main>;
}
