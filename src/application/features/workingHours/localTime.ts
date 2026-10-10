import type { WorkingHours, WorkSchedule } from '../../abstractions/workingHoursSource';
import { wallClock, type WallClock } from '../../common/timeZones';

const MINUTE_MS = 60_000;
const DAY_MINUTES = 24 * 60;

/** A person's local time and working hours at one moment, as the details panel says them. */
export interface LocalTime {
  /** The person's clock, in minutes after midnight. */
  readonly minutes: number;
  /** Minutes the person's clock is ahead of the viewer's: negative where it is behind, 0 where both show the same time. */
  readonly aheadOfViewer: number;
  readonly workingHours: WorkingHours | null;
  /** When the person is free next within today's working hours: 'now', or minutes after midnight on their clock; else null. */
  readonly freeFrom: 'now' | number | null;
}

/** Worked out for each moment, so the time, the difference and the free time stay right as minutes pass; `viewerOffset` is browserOffset's. */
export function localTimeOf(schedule: WorkSchedule, instant: number, viewerOffset: number): LocalTime {
  const clock = wallClock(schedule.timeZone, instant);
  return {
    minutes: clock.minutes,
    aheadOfViewer: clock.offset - viewerOffset,
    workingHours: schedule.workingHours,
    freeFrom: nextFreeTime(schedule, clock, instant),
  };
}

/** Only within today's working hours: a free time outside them is no time to reach the person at work. */
function nextFreeTime({ timeZone, workingHours, free }: WorkSchedule, clock: WallClock, instant: number): 'now' | number | null {
  if (!workingHours || !free || !worksAt(workingHours, clock)) return null;
  // Offsets are whole minutes, so the person's minute starts with UTC's.
  const endOfWork = Math.floor(instant / MINUTE_MS) * MINUTE_MS + (endOf(workingHours) - clock.minutes) * MINUTE_MS;
  const next = free.find((time) => time.end > instant);
  if (!next || next.start >= endOfWork) return null;
  return next.start <= instant ? 'now' : wallClock(timeZone, next.start).minutes;
}

function worksAt(hours: WorkingHours, clock: WallClock): boolean {
  return hours.days.includes(clock.weekday) && clock.minutes >= hours.start && clock.minutes < endOf(hours);
}

/** Hours that went on past midnight would belong to two days, so the working day stops at midnight. */
function endOf({ start, end }: WorkingHours): number {
  return end > start ? end : DAY_MINUTES;
}
