/** The days of the week, Monday first, by the names calendars give them in working hours. */
export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** What a clock in one time zone shows at one moment. */
export interface WallClock {
  readonly weekday: Weekday;
  /** Minutes after midnight, such as 845 for 14:05. */
  readonly minutes: number;
  /** Minutes ahead of UTC at that moment, daylight saving included: 120 in Oslo in summer, -300 in New York in winter. */
  readonly offset: number;
}

const MINUTE_MS = 60_000;

/** One formatter per zone: making one costs more than using it many times. */
const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** Whether Intl knows `name` as an IANA time zone, such as "Europe/Oslo", its older aliases included. */
export function isTimeZone(name: string): boolean {
  try {
    clockFormat(name);
    return true;
  } catch {
    return false;
  }
}

/** The clock in `timeZone`, a name isTimeZone accepts, at `instant` in milliseconds since 1970, as Date.now gives it. */
export function wallClock(timeZone: string, instant: number): WallClock {
  const parts = new Map(clockFormat(timeZone).formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.get(type) ?? 0;
  const date = Date.UTC(part('year'), part('month') - 1, part('day'));
  const minutes = part('hour') * 60 + part('minute');
  // The zone's clock read as a UTC time, less the moment itself to the minute, is how far the zone is ahead.
  const offset = Math.round((date + minutes * MINUTE_MS - Math.floor(instant / MINUTE_MS) * MINUTE_MS) / MINUTE_MS);
  // getUTCDay counts from Sunday.
  return { weekday: WEEKDAYS[(new Date(date).getUTCDay() + 6) % 7] as Weekday, minutes, offset };
}

/** Minutes the browser's own clock is ahead of UTC at `instant`, as wallClock gives a zone's offset. */
export function browserOffset(instant: number): number {
  // getTimezoneOffset counts minutes behind UTC; subtracting from 0 also keeps UTC's 0 from becoming -0.
  return 0 - new Date(instant).getTimezoneOffset();
}

function clockFormat(timeZone: string): Intl.DateTimeFormat {
  let format = clockFormats.get(timeZone);
  if (!format) {
    // h23, as some engines write midnight as 24 with hour12 false; en-US for plain digits.
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    clockFormats.set(timeZone, format);
  }
  return format;
}
