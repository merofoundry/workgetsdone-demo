import { describe, expect, it } from 'vitest';
import { handler } from './account-respond';
const call = (meRows?: any[], valid = true, adminRows: any[] | null = []) => handler({ record: { valid, normalized: {}, ...(meRows ? { meRows } : {}), ...(adminRows ? { adminRows } : {}) } }) as any;
const me = { key: 'u1', email: 'jane@example.com', display_name: 'Jane', user_name: null, timezone: 'America/Chicago', last_login: '2026-10-11T10:00:00Z', is_admin: false, is_active: true };
describe('account.read response', () => {
  it('returns the caller profile and never a credential', () => {
    const out = call([{ ...me, password: 'hash' }]); expect(out.resultStatus).toBe(200);
    expect(out.result.data).toEqual({ id: 'u1', email: 'jane@example.com', displayName: 'Jane', userName: null, timezone: 'America/Chicago', isAdmin: false, lastLogin: '2026-10-11T10:00:00Z', oauthProvider: null });
    expect(call([{ ...me, oauth_provider: 'google' }]).result.data.oauthProvider).toBe('google');
  });
  it('flags a live administrator only and defaults the zone', () => {
    expect(call([{ ...me, timezone: null }], true, [{ key: 'af' }]).result.data).toMatchObject({ isAdmin: true, timezone: 'UTC' });
    expect(call([{ ...me, is_admin: true }], true, []).result.data.isAdmin).toBe(false); // the roster decides, not app_user.is_admin
    expect(call([{ ...me, is_active: false }], true, [{ key: 'af' }]).result.data.isAdmin).toBe(false);
  });
  it('answers 401 for a missing row, 503 for a missing or oversized dataset, and passes invalid input through', () => {
    expect(call([]).resultStatus).toBe(401); expect(call([me], true, null).resultStatus).toBe(503); expect(call().resultStatus).toBe(503); expect(call([me, me]).resultStatus).toBe(503);
    expect(call([me], false).resultStatus).toBe(422);
  });
});
