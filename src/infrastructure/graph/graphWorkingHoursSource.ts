import { SignInRequiredError } from '@/application/abstractions/authenticator';
import {
  CalendarConsentRequiredError,
  type TimeSpan,
  type WorkingHours,
  type WorkingHoursSource,
  type WorkSchedule,
} from '@/application/abstractions/workingHoursSource';
import { WEEKDAYS } from '@/application/common/timeZones';
import type { Employee } from '@/domain/employees/employee';
import { GraphRequestError, type GraphClient } from './graphClient';
import { ianaTimeZone } from './windowsTimeZones';

const SLOT_MINUTES = 30;
export const SLOT_MS = SLOT_MINUTES * 60_000;
/** The rest of the person's day wherever they are: their next midnight is never more than a day away. */
export const PERIOD_MS = 24 * 60 * 60_000;

/** One of getSchedule's scheduleInformation; Graph leaves out what it has nothing for. */
export interface GraphScheduleInformation {
  readonly scheduleId?: string | null;
  /** A digit per slot from the start: 0 free (or working elsewhere), 1 tentative, 2 busy, 3 out of office. */
  readonly availabilityView?: string | null;
  /** Why the calendar could not be read, such as responseCode 5006 for too many entries in the period. */
  readonly error?: { readonly message?: string | null; readonly responseCode?: string | null } | null;
  readonly workingHours?: {
    readonly daysOfWeek?: readonly string[] | null;
    /** Such as "08:00:00.0000000", on the clock of `timeZone`. */
    readonly startTime?: string | null;
    readonly endTime?: string | null;
    /** A Windows zone's name, such as "W. Europe Standard Time", or "Customized Time Zone" with rules of its own. */
    readonly timeZone?: { readonly name?: string | null } | null;
  } | null;
}

export class GraphWorkingHoursSource implements WorkingHoursSource {
  constructor(
    private readonly graph: GraphClient,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getWorkingHours({ mail }: Employee): Promise<WorkSchedule | null> {
    // getSchedule takes SMTP addresses: without one there is no mailbox, and no calendar, to ask.
    if (!mail) return null;
    const from = Math.floor(this.now() / SLOT_MS) * SLOT_MS;
    try {
      const { value } = await this.graph.postJson<{ value?: readonly GraphScheduleInformation[] | null }>('/me/calendar/getSchedule', {
        schedules: [mail],
        startTime: inUtc(from),
        endTime: inUtc(from + PERIOD_MS),
        availabilityViewInterval: SLOT_MINUTES,
      });
      const address = mail.toLowerCase();
      return toWorkSchedule(value?.find((schedule) => schedule.scheduleId?.toLowerCase() === address) ?? value?.[0], from);
    } catch (error) {
      // Missing consent shows up as a token that needs interaction, as for presence.
      if (error instanceof SignInRequiredError) throw new CalendarConsentRequiredError({ cause: error });
      // The client's own words for a 403 are about the user directory.
      if (error instanceof GraphRequestError && error.status === 403) {
        throw new GraphRequestError(
          403,
          error.code,
          "Microsoft Graph denied access to calendars' free/busy times. An administrator must grant consent for the " +
            'Calendars.ReadBasic permission on the app registration, or for the SharePoint web part approve it under ' +
            'API access in the SharePoint admin center.',
          error.failure,
        );
      }
      throw error;
    }
  }
}

/** Null where the answer names no time zone Intl knows: no schedule for the person, or one without working hours. */
export function toWorkSchedule(schedule: GraphScheduleInformation | undefined, from: number): WorkSchedule | null {
  const hours = schedule?.workingHours;
  const timeZone = ianaTimeZone(hours?.timeZone?.name);
  if (!schedule || !hours || timeZone === null) return null;
  return {
    timeZone,
    workingHours: toWorkingHours(hours.daysOfWeek ?? [], hours.startTime, hours.endTime),
    // A calendar Graph could not read leaves its free times unknown, not free.
    free: schedule.error ? null : freeTimes(schedule.availabilityView, from),
  };
}

function toWorkingHours(daysOfWeek: readonly string[], startTime?: string | null, endTime?: string | null): WorkingHours | null {
  const named = new Set(daysOfWeek.map((day) => day.toLowerCase()));
  const days = WEEKDAYS.filter((day) => named.has(day));
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  return days.length === 0 || start === null || end === null ? null : { days, start, end };
}

/** "08:30:00.0000000" as 510; null for anything else. */
function minutesOf(time?: string | null): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(time ?? '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** The slots that are free, joined where they follow each other; null where the view is missing or empty. */
function freeTimes(view: string | null | undefined, from: number): TimeSpan[] | null {
  if (!view) return null;
  const free: TimeSpan[] = [];
  for (let slot = 0; slot < view.length; slot++) {
    if (view[slot] !== '0') continue;
    const start = from + slot * SLOT_MS;
    const last = free.at(-1);
    if (last?.end === start) free[free.length - 1] = { start: last.start, end: start + SLOT_MS };
    else free.push({ start, end: start + SLOT_MS });
  }
  return free;
}

/** getSchedule's dateTimeTimeZone for a moment, written on the UTC clock. */
function inUtc(instant: number): { readonly dateTime: string; readonly timeZone: string } {
  return { dateTime: new Date(instant).toISOString().slice(0, 19), timeZone: 'UTC' };
}
