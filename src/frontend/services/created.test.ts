import { describe, expect, it } from 'vitest';
import { handler } from './created';
describe('byof-created', () => {
  it('returns the created key', () => { expect(handler({ record: { createdRows: [{ id: 'abc' }] } } as any)).toEqual({ created: { ok: true, id: 'abc' }, createdBody: { data: { ok: true, id: 'abc' } } }); });
  it('falls back to the key', () => { expect((handler({ record: { createdRows: [{ key: 'k' }] } } as any) as any).created.id).toBe('k'); });
  it('returns ok without an id when the row was not found', () => { expect(handler({ record: { createdRows: [] } } as any)).toEqual({ created: { ok: true, id: null }, createdBody: { data: { ok: true, id: null } } }); });
  it('adds sharedWith when the plan provided it', () => { expect((handler({ record: { createdRows: [{ id: 'abc' }], sharedWith: [{ userId: 'u', displayName: 'J' }] } } as any) as any).createdBody).toEqual({ data: { ok: true, id: 'abc', sharedWith: [{ userId: 'u', displayName: 'J' }] } }); });
});
