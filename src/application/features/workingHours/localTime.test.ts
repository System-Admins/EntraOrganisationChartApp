import { describe, expect, it } from 'vitest';
import type { WorkSchedule } from '../../abstractions/workingHoursSource';
import type { Weekday } from '../../common/timeZones';
import { localTimeOf } from './localTime';

/** Thursday 1 October 2026 at `hours`:`minutes` UTC, an hour more in London (summer time). */
const at = (hours: number, minutes = 0, seconds = 0) => Date.UTC(2026, 9, 1, hours, minutes, seconds);
const WEEK: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
/** The viewer in Oslo, two hours ahead of UTC in summer. */
const OSLO = 120;

/** 08:00-15:30 in London, free from 15:00 to 16:00 there. */
const london: WorkSchedule = {
  timeZone: 'Europe/London',
  workingHours: { days: WEEK, start: 8 * 60, end: 15 * 60 + 30 },
  free: [{ start: at(14), end: at(15) }],
};

describe('localTimeOf', () => {
  it('gives the person\'s time, how far it is ahead of the viewer\'s, and their working hours', () => {
    expect(localTimeOf(london, at(13, 5), OSLO)).toEqual({
      minutes: 14 * 60 + 5,
      aheadOfViewer: -60,
      workingHours: london.workingHours,
      freeFrom: 15 * 60,
    });
    expect(localTimeOf({ ...london, timeZone: 'Asia/Kolkata' }, at(13, 5), OSLO).aheadOfViewer).toBe(210);
    expect(localTimeOf({ ...london, timeZone: 'Europe/Berlin' }, at(13, 5), OSLO).aheadOfViewer).toBe(0);
  });

  it('says the person is free now from the first minute of a free time to its last', () => {
    expect(localTimeOf(london, at(13, 59, 59), OSLO).freeFrom).toBe(15 * 60);
    expect(localTimeOf(london, at(14), OSLO).freeFrom).toBe('now');
    expect(localTimeOf(london, at(14, 29, 59), OSLO).freeFrom).toBe('now');
  });

  it('offers no free time outside today\'s working hours, nor one that starts as they end', () => {
    // 15:30 in London, as the working day ends; the free time goes on to 16:00.
    expect(localTimeOf(london, at(14, 30), OSLO).freeFrom).toBeNull();
    expect(localTimeOf(london, at(6, 59), OSLO).freeFrom).toBeNull();
    const endsAtFree = { ...london, workingHours: { days: WEEK, start: 8 * 60, end: 15 * 60 } };
    expect(localTimeOf(endsAtFree, at(13, 5), OSLO).freeFrom).toBeNull();
    // Saturday 3 October.
    expect(localTimeOf(london, Date.UTC(2026, 9, 3, 13, 5), OSLO).freeFrom).toBeNull();
  });

  it('offers no free time where the calendar told none, or names no working hours', () => {
    expect(localTimeOf({ ...london, free: null }, at(13, 5), OSLO).freeFrom).toBeNull();
    expect(localTimeOf({ ...london, free: [] }, at(13, 5), OSLO).freeFrom).toBeNull();
    expect(localTimeOf({ ...london, workingHours: null }, at(14), OSLO)).toMatchObject({ workingHours: null, freeFrom: null });
  });

  it('works on to midnight where the working hours end at or before they start', () => {
    const lateShift: WorkSchedule = {
      timeZone: 'Europe/London',
      workingHours: { days: WEEK, start: 16 * 60, end: 0 },
      free: [{ start: at(21), end: at(22) }],
    };

    expect(localTimeOf(lateShift, at(20), OSLO).freeFrom).toBe(22 * 60);
  });
});
