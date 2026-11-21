import { describe, expect, it } from 'vitest';
import { dayKey, daysLate, relativeDate, shiftInZone, sundayStart, zoneDayKey } from './dates';
describe('calendar dates', () => {
  it('starts the window on Sunday without changing the input', () => { const date = new Date(2026, 9, 8, 12); expect(sundayStart(date)).toBe('2026-10-04'); expect(dayKey(date)).toBe('2026-10-08'); });
  it('uses calendar days across DST rather than elapsed hours', () => { expect(daysLate('2026-11-01T12:00:00', new Date(2026, 10, 2, 9))).toBe(1); });
  it('distinguishes today and tomorrow', () => { const today = new Date(2026, 9, 8, 12); expect(relativeDate('2026-10-08T09:00:00', today)).toBe('Today'); expect(relativeDate('2026-10-09T09:00:00', today)).toBe('Tomorrow'); });
});
describe('zone-aware shifts', () => {
  const ny = 'America/New_York';
  it('keeps the wall-clock time across the November daylight-saving change', () => {
    expect(shiftInZone('2026-10-30T13:00:00.000Z', ny, { days: 3, milliseconds: 0 })).toBe('2026-11-02T14:00:00.000Z');
  });
  it('keeps the wall-clock time across the March daylight-saving change', () => {
    expect(shiftInZone('2026-03-07T14:00:00.000Z', ny, { days: 2, milliseconds: 0 })).toBe('2026-03-09T13:00:00.000Z');
  });
  it('adds a time delta and a day delta together', () => {
    expect(shiftInZone('2026-10-08T13:00:00.000Z', ny, { days: -1, milliseconds: 3600000 })).toBe('2026-10-07T14:00:00.000Z');
  });
  it('names the day on the zone wall clock', () => {
    expect(zoneDayKey('2026-10-09T02:30:00.000Z', ny)).toBe('2026-10-08');
    expect(zoneDayKey('2026-10-09T02:30:00.000Z', 'Asia/Tokyo')).toBe('2026-10-09');
  });
});
