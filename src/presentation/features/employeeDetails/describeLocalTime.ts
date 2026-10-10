import { padTwo } from '@/application/common/formatLocalDate';
import { formatList } from '@/application/common/intl';
import { WEEKDAYS, type Weekday } from '@/application/common/timeZones';
import type { LocalTime } from '@/application/features/workingHours/localTime';
import type { Language } from '@/application/settings/language';
import { DETAILS_STRINGS } from './strings';

/** The local time row's two lines. */
export interface LocalTimeLines {
  /** The time, and how far it is from the viewer's where it differs. */
  readonly clock: string;
  /** The working hours and when the person is free next; null where the calendar names no working days. */
  readonly work: string | null;
}

export function describeLocalTime({ minutes, aheadOfViewer, workingHours, freeFrom }: LocalTime, language: Language): LocalTimeLines {
  const t = DETAILS_STRINGS[language];
  const apart = Math.abs(aheadOfViewer);
  const duration = t.duration(Math.floor(apart / 60), apart % 60);
  const difference = aheadOfViewer === 0 ? null : aheadOfViewer > 0 ? t.aheadOfYou(duration) : t.behindYou(duration);
  const free = freeFrom === null ? null : freeFrom === 'now' ? t.freeNow : t.freeFrom(clockTime(freeFrom));
  return {
    clock: t.clock(clockTime(minutes), difference),
    work:
      workingHours &&
      t.works(describeDays(workingHours.days, language), clockTime(workingHours.start), clockTime(workingHours.end), free),
  };
}

/** On the 24-hour clock with two digits each, as the chart writes every time: 08:05. */
function clockTime(minutes: number): string {
  return `${padTwo(Math.floor(minutes / 60))}:${padTwo(minutes % 60)}`;
}

/** Three or more days in a row as a range and the others by name, in the week's order: "Mon-Fri", "Mon, Wed, and Fri". */
function describeDays(days: readonly Weekday[], language: Language): string {
  const t = DETAILS_STRINGS[language];
  if (days.length === WEEKDAYS.length) return t.everyDay;
  const worked = (index: number) => days.includes(dayAt(index));
  const name = (index: number) => t.weekdays[dayAt(index)];
  // From the first day of a run, which a week with a day off has, so that a run past Sunday stays whole: "Sun-Thu".
  let index = WEEKDAYS.findIndex((_, day) => worked(day) && !worked(day + WEEKDAYS.length - 1));
  const end = index + WEEKDAYS.length;
  const parts: string[] = [];
  while (index < end) {
    let length = 0;
    while (worked(index + length)) length++;
    if (length >= 3) parts.push(t.dayRange(name(index), name(index + length - 1)));
    else for (let step = 0; step < length; step++) parts.push(name(index + step));
    index += Math.max(length, 1);
  }
  return formatList(language, parts, 'conjunction');
}

/** Counting on past Sunday. */
function dayAt(index: number): Weekday {
  return WEEKDAYS[index % WEEKDAYS.length] as Weekday;
}
