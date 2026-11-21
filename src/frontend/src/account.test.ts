import { describe, expect, it } from 'vitest';
import { timeZones } from './account';
describe('account helpers', () => {
  it('lists UTC, the browser zones and the stored value once each, sorted', () => {
    const zones = timeZones('Mars/Base'); expect(zones).toContain('UTC'); expect(zones).toContain('America/New_York'); expect(zones).toContain('Mars/Base');
    expect(new Set(zones).size).toBe(zones.length); expect([...zones].sort((a, b) => a.localeCompare(b))).toEqual(zones);
  });
});
