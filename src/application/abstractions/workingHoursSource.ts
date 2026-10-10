import type { Employee } from '@/domain/employees/employee';
import type { Weekday } from '../common/timeZones';

/** Thrown until someone consents to reading calendars (Calendars.ReadBasic), or while a sign-in is needed again: Turn on asks for both. */
export class CalendarConsentRequiredError extends Error {
  constructor(options?: ErrorOptions) {
    super('Reading calendars needs consent.', options);
    this.name = 'CalendarConsentRequiredError';
  }
}

/** The days and hours a person works, as their calendar sets them, on the clock of their working time zone. */
export interface WorkingHours {
  /** In WEEKDAYS' order, and never empty. */
  readonly days: readonly Weekday[];
  /** Minutes after midnight, such as 480 for 08:00. An end at or before the start is midnight. */
  readonly start: number;
  readonly end: number;
}

/** From `start` up to `end`, in milliseconds since 1970. */
export interface TimeSpan {
  readonly start: number;
  readonly end: number;
}

export interface WorkSchedule {
  /** The IANA name of the zone the person works in, such as "Europe/Oslo", which Intl knows. */
  readonly timeZone: string;
  /** Null where the calendar names no working days. */
  readonly workingHours: WorkingHours | null;
  /** The free times in time order, over a day from the half hour it was asked in; null where the calendar didn't say. */
  readonly free: readonly TimeSpan[] | null;
}

export interface WorkingHoursSource {
  /** Null where the person's time isn't known: no mailbox to ask, no working hours, or a time zone Intl doesn't know. */
  getWorkingHours(employee: Employee): Promise<WorkSchedule | null>;
}
