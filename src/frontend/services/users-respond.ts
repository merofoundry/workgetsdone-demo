type Row = Record<string, any>;
type Input = { record: Row };
const truth = (value: unknown) => value === true || value === 'true';
const LIMIT = 1000;
/** users.list: shapes app_user rows (usersRows) and live admin_flag rows (adminsRows) into the user table. isAdmin comes from the roster. Never returns a credential. */
export function handler(event: Input) {
  const state = event.record;
  if (!state.valid) return { resultStatus: state.resultStatus || 422, result: state.result || { error: { message: 'Invalid request.' } } };
  const users = state.usersRows, admins = state.adminsRows;
  if (!Array.isArray(users) || !Array.isArray(admins) || users.length > LIMIT || admins.length > LIMIT) return { resultStatus: 503, result: { error: { message: 'This information could not be loaded. Please try again.' } } };
  const roster = new Set(admins.map((row: Row) => row.user_id));
  const out = users.map((row: Row) => ({ id: row.key, email: row.email, displayName: row.display_name, userName: row.user_name || null, isActive: truth(row.is_active), isAdmin: roster.has(row.key), lastLogin: row.last_login || null, timezone: row.timezone || 'UTC', oauthProvider: row.oauth_provider || null }));
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  out.sort((a: Row, b: Row) => order(String(a.displayName).toLowerCase(), String(b.displayName).toLowerCase()) || order(String(a.id), String(b.id)));
  return { resultStatus: 200, result: { data: { users: out } } };
}
