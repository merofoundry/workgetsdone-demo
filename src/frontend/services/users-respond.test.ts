import { describe, expect, it } from 'vitest';
import { handler } from './users-respond';
const call = (usersRows?: any[], adminsRows?: any[], valid = true) => handler({ record: { valid, normalized: {}, ...(usersRows ? { usersRows } : {}), ...(adminsRows ? { adminsRows } : {}) } }) as any;
const row = (key: string, name: string, extra: any = {}) => ({ key, email: key + '@x.test', display_name: name, user_name: null, is_active: true, is_admin: false, last_login: null, timezone: null, password: 'h', ...extra });
describe('users.list response', () => {
  it('maps rows, takes isAdmin from the roster and never leaks a credential', () => {
    const out = call([row('b', 'Bob', { is_admin: false, oauth_provider: 'google' }), row('a', 'ann', { is_active: 'false', timezone: 'America/Chicago', last_login: '2026-10-11T10:00:00Z', user_name: 'ann' })], [{ user_id: 'b' }]);
    expect(out.resultStatus).toBe(200);
    expect(out.result.data.users).toEqual([
      { id: 'a', email: 'a@x.test', displayName: 'ann', userName: 'ann', isActive: false, isAdmin: false, lastLogin: '2026-10-11T10:00:00Z', timezone: 'America/Chicago', oauthProvider: null },
      { id: 'b', email: 'b@x.test', displayName: 'Bob', userName: null, isActive: true, isAdmin: true, lastLogin: null, timezone: 'UTC', oauthProvider: 'google' }]);
    expect(JSON.stringify(out)).not.toContain('password');
  });
  it('is 503 when a dataset is missing or oversized and passes invalid input through', () => {
    expect(call().resultStatus).toBe(503); expect(call([row('a', 'A')]).resultStatus).toBe(503);
    expect(call(Array.from({ length: 1001 }, (_, i) => row('k' + i, 'n')), []).resultStatus).toBe(503);
    expect(call([], [], false).resultStatus).toBe(422);
  });
  it('treats an empty roster as no administrators', () => { expect(call([row('a', 'A')], []).result.data.users[0].isAdmin).toBe(false); });
});
