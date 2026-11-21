type Input = { record: { createdRows?: { id?: string; key?: string }[]; sharedWith?: { userId: string; displayName: string }[] } };
export function handler(event: Input) {
  const row = event.record.createdRows?.[0];
  const created = { ok: true, id: row?.id ?? row?.key ?? null };
  const sharedWith = event.record.sharedWith;
  return { created, createdBody: { data: Array.isArray(sharedWith) ? { ...created, sharedWith } : created } };
}
