import { describe, expect, it } from 'vitest';
import type { Weekday } from '@/application/common/timeZones';
import type { LocalTime } from '@/application/features/workingHours/localTime';
import { describeLocalTime } from './describeLocalTime';

const WEEK: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

/** 14:05, an hour behind the viewer, at work Monday to Friday 08:00-15:30 and free from 15:00. */
const local: LocalTime = {
  minutes: 14 * 60 + 5,
  aheadOfViewer: -60,
  workingHours: { days: WEEK, start: 8 * 60, end: 15 * 60 + 30 },
  freeFrom: 15 * 60,
};

const daysOf = (days: Weekday[]) => describeLocalTime({ ...local, workingHours: { days, start: 0, end: 60 }, freeFrom: null }, 'en').work;

describe('describeLocalTime', () => {
  it('says the time, how far it is from the viewer\'s, and the working hours with when the person is free next', () => {
    expect(describeLocalTime(local, 'en')).toEqual({
      clock: '14:05, 1 hour behind you',
      work: 'Works Mon-Fri 08:00-15:30, free from 15:00',
    });
    expect(describeLocalTime({ ...local, freeFrom: 'now' }, 'en').work).toBe('Works Mon-Fri 08:00-15:30, free now');
    expect(describeLocalTime({ ...local, freeFrom: null }, 'en').work).toBe('Works Mon-Fri 08:00-15:30');
  });

  it('leaves the difference out where both clocks show the same time, and words it in hours and minutes otherwise', () => {
    const clock = (aheadOfViewer: number) => describeLocalTime({ ...local, aheadOfViewer }, 'en').clock;

    expect(clock(0)).toBe('14:05');
    expect(clock(120)).toBe('14:05, 2 hours ahead of you');
    expect(clock(210)).toBe('14:05, 3 hours 30 minutes ahead of you');
    expect(clock(-45)).toBe('14:05, 45 minutes behind you');
    expect(clock(-61)).toBe('14:05, 1 hour 1 minute behind you');
  });

  it('writes times on the 24-hour clock with two digits each', () => {
    expect(describeLocalTime({ ...local, minutes: 5, aheadOfViewer: 0 }, 'en').clock).toBe('00:05');
    expect(describeLocalTime({ ...local, minutes: 23 * 60 + 59, aheadOfViewer: 0 }, 'en').clock).toBe('23:59');
  });

  it('says no working hours where the calendar names no working days', () => {
    expect(describeLocalTime({ ...local, workingHours: null, freeFrom: null }, 'en').work).toBeNull();
  });

  it('names three or more working days in a row as a range and the others one by one, in the week\'s order', () => {
    expect(daysOf(WEEK)).toBe('Works Mon-Fri 00:00-01:00');
    expect(daysOf(['monday', 'wednesday', 'friday'])).toBe('Works Mon, Wed, and Fri 00:00-01:00');
    expect(daysOf(['monday', 'tuesday', 'wednesday', 'friday'])).toBe('Works Mon-Wed and Fri 00:00-01:00');
    expect(daysOf(['saturday', 'sunday'])).toBe('Works Sat and Sun 00:00-01:00');
    expect(daysOf(['thursday'])).toBe('Works Thu 00:00-01:00');
    expect(daysOf([...WEEK, 'saturday', 'sunday'])).toBe('Works every day 00:00-01:00');
  });

  it('keeps a run of working days past Sunday whole, as where the week starts on Sunday', () => {
    expect(daysOf(['monday', 'tuesday', 'wednesday', 'thursday', 'sunday'])).toBe('Works Sun-Thu 00:00-01:00');
    expect(daysOf(['monday', 'wednesday', 'saturday', 'sunday'])).toBe('Works Wed and Sat-Mon 00:00-01:00');
  });
});
