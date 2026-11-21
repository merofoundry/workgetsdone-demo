type Row = Record<string, any>;
type Input = { record: Row };
const truth = (value: unknown) => value === true || value === 'true';
/** account.read: shapes the caller's own app_user row (meRows, one row) into the profile. isAdmin is the live admin_flag roster (adminRows from admin_check: one row for an active administrator), not app_user.is_admin. Never returns a credential. */
export function handler(event: Input) {
  const state = event.record;
  if (!state.valid) return { resultStatus: state.resultStatus || 422, result: state.result || { error: { message: 'Invalid request.' } } };
  const rows = state.meRows;
  if (!Array.isArray(rows) || rows.length > 1) return { resultStatus: 503, result: { error: { message: 'This information could not be loaded. Please try again.' } } };
  const admin = state.adminRows;
  if (!Array.isArray(admin)) return { resultStatus: 503, result: { error: { message: 'This information could not be loaded. Please try again.' } } };
  const row = rows[0];
  if (!row) return { resultStatus: 401, result: { error: { message: 'Please sign in again.' } } };
  return { resultStatus: 200, result: { data: { id: row.key, email: row.email, displayName: row.display_name, userName: row.user_name || null, timezone: row.timezone || 'UTC', isAdmin: admin.length > 0 && truth(row.is_active), lastLogin: row.last_login || null, oauthProvider: row.oauth_provider || null } } };
}
