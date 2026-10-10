import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserOffset, isTimeZone, wallClock } from './timeZones';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wallClock', () => {
  it('reads the weekday, the time and the offset of a zone at a moment', () => {
    expect(wallClock('Europe/Oslo', Date.UTC(2026, 0, 15, 12, 5))).toEqual({ weekday: 'thursday', minutes: 13 * 60 + 5, offset: 60 });
    expect(wallClock('America/New_York', Date.UTC(2026, 0, 15, 12, 5))).toEqual({
      weekday: 'thursday',
      minutes: 7 * 60 + 5,
      offset: -300,
    });
  });

  it('follows daylight saving through Intl, from the minute the clocks change', () => {
    // Europe moves its clocks at 01:00 UTC on the last Sunday of March, New York at 02:00 local time on the second Sunday.
    expect(wallClock('Europe/Oslo', Date.UTC(2026, 2, 29, 0, 59))).toMatchObject({ minutes: 1 * 60 + 59, offset: 60 });
    expect(wallClock('Europe/Oslo', Date.UTC(2026, 2, 29, 1, 0))).toMatchObject({ minutes: 3 * 60, offset: 120 });
    expect(wallClock('America/New_York', Date.UTC(2026, 2, 8, 6, 59))).toMatchObject({ minutes: 1 * 60 + 59, offset: -300 });
    expect(wallClock('America/New_York', Date.UTC(2026, 2, 8, 7, 0))).toMatchObject({ minutes: 3 * 60, offset: -240 });
    // And back in the autumn; the southern hemisphere has its summer time in January.
    expect(wallClock('Europe/Oslo', Date.UTC(2026, 9, 25, 1, 0)).offset).toBe(60);
    expect(wallClock('Australia/Sydney', Date.UTC(2026, 0, 15, 12, 0)).offset).toBe(660);
    expect(wallClock('Australia/Sydney', Date.UTC(2026, 6, 15, 12, 0)).offset).toBe(600);
  });

  it('keeps the minutes of zones that are part of an hour off UTC', () => {
    expect(wallClock('Asia/Kolkata', Date.UTC(2026, 6, 15, 12, 0))).toMatchObject({ minutes: 17 * 60 + 30, offset: 330 });
    expect(wallClock('Asia/Kathmandu', Date.UTC(2026, 6, 15, 12, 0))).toMatchObject({ minutes: 17 * 60 + 45, offset: 345 });
  });

  it('gives the zone\'s own weekday where its midnight came before or after UTC\'s', () => {
    expect(wallClock('Asia/Tokyo', Date.UTC(2026, 9, 1, 23, 30))).toEqual({ weekday: 'friday', minutes: 8 * 60 + 30, offset: 540 });
    expect(wallClock('Pacific/Honolulu', Date.UTC(2026, 9, 1, 3, 0))).toMatchObject({ weekday: 'wednesday', minutes: 17 * 60 });
    expect(wallClock('Etc/UTC', Date.UTC(2026, 9, 4, 0, 0))).toEqual({ weekday: 'sunday', minutes: 0, offset: 0 });
  });

  it('counts the minute a moment falls in, whatever its seconds', () => {
    expect(wallClock('Europe/London', Date.UTC(2026, 9, 1, 13, 5, 59, 999))).toMatchObject({ minutes: 14 * 60 + 5, offset: 60 });
  });
});

describe('isTimeZone', () => {
  it('knows IANA zones and their older aliases, and nothing else', () => {
    expect(isTimeZone('Europe/Oslo')).toBe(true);
    expect(isTimeZone('Asia/Calcutta')).toBe(true);
    expect(isTimeZone('W. Europe Standard Time')).toBe(false);
    expect(isTimeZone('Customized Time Zone')).toBe(false);
  });
});

describe('browserOffset', () => {
  it('turns the browser\'s minutes behind UTC into minutes ahead, as a zone\'s offset is given', () => {
    const offset = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-120);
    expect(browserOffset(Date.UTC(2026, 9, 1))).toBe(120);

    offset.mockReturnValue(300);
    expect(browserOffset(Date.UTC(2026, 0, 1))).toBe(-300);

    // Not -0, which would differ from a zone's 0 to Object.is.
    offset.mockReturnValue(0);
    expect(browserOffset(Date.UTC(2026, 0, 1))).toBe(0);
  });
});
