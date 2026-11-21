export const dayKey = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export function sundayStart(date = new Date()) { const start = new Date(date); start.setDate(start.getDate() - start.getDay()); start.setHours(0, 0, 0, 0); return dayKey(start); }
export function daysLate(value: string, today = new Date()) {
  const date = new Date(value); return Math.max(0, Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000));
}
export function relativeDate(value: string | null, today = new Date()) {
  if (!value) return 'Undated';
  const date = new Date(value); const difference = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (!difference) return 'Today';
  if (difference === 1) return 'Tomorrow';
  if (difference === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { ...(Math.abs(difference) < 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }) });
}
export const entryHref = (entry: { kind: string; id: string }) => `/${entry.kind === 'file' ? 'files' : `${entry.kind}s`}/${encodeURIComponent(entry.id)}`;
const zoneParts = (ms: number, zone: string) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map(part => [part.type, Number(part.value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
};
/** Offset of the zone from UTC at the instant, in milliseconds. */
const zoneOffset = (ms: number, zone: string) => zoneParts(Math.floor(ms / 1000) * 1000, zone) - Math.floor(ms / 1000) * 1000;
/** Moves an ISO instant by calendar days plus milliseconds measured on the wall clock of the zone, so 09:00 stays 09:00 across a daylight-saving change. */
export function shiftInZone(iso: string, zone: string, delta: { days: number; milliseconds: number }) {
  const ms = new Date(iso).getTime(); const wall = ms + zoneOffset(ms, zone) + delta.days * 86400000 + delta.milliseconds;
  let guess = wall - zoneOffset(ms, zone); guess = wall - zoneOffset(guess, zone);
  return new Date(guess).toISOString();
}
/** YYYY-MM-DD of an instant on the wall clock of the zone. */
export const zoneDayKey = (value: string, zone: string) => new Date(new Date(value).getTime() + zoneOffset(new Date(value).getTime(), zone)).toISOString().slice(0, 10);
