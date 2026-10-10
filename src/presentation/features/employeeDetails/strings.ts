import { formatNumber, plural } from '@/application/common/intl';
import type { Weekday } from '@/application/common/timeZones';
import type { RecordedManagerReason } from '@/application/features/orgChart/getRecordedManager';
import { defineStrings } from '@/application/settings/language';
import type { HideCategory } from '@/domain/orgChart/hideRules';
import type { WorkLocation } from '@/domain/presence/presence';

/** The details panel's own words; what its buttons open and a person's status come from contact and presence. */
export const DETAILS_STRINGS = defineStrings({
  en: {
    /** The panel's name as a landmark; the page announces its opening in the same words. */
    detailsFor: (name: string) => `Details for ${name}`,
    close: 'Close details',
    closeTooltip: 'Close',
    chat: 'Chat',
    /** Chat and Call are named for Teams, which tells Call apart from the phone numbers under it. */
    teamsChat: 'Teams chat',
    email: 'E-mail',
    call: 'Call',
    teamsCall: 'Teams call',
    /** Read before the note the person set in Teams, which the eye tells apart by its icon. */
    statusMessage: 'Status message',
    contact: 'Contact',
    automaticReply: 'Automatic reply',
    showMore: 'Show more',
    showLess: 'Show less',
    workLocationToday: 'Work location today',
    workLocations: {
      office: 'In the office',
      remote: 'Remote',
      timeOff: 'Time off',
    } satisfies Record<WorkLocation, string>,
    /** The row with the person's local time and working hours, from their calendar. */
    localTime: 'Local time',
    /** The person's time, then how far their clock is from the viewer's where it shows another time: "14:05, 1 hour behind you". */
    clock: (time: string, difference: string | null) => (difference === null ? time : `${time}, ${difference}`),
    behindYou: (duration: string) => `${duration} behind you`,
    aheadOfYou: (duration: string) => `${duration} ahead of you`,
    /** How far two clocks are apart: "1 hour", "5 hours 30 minutes" or "45 minutes". */
    duration: (hours: number, minutes: number) => {
      const inHours = `${formatNumber('en', hours)} ${plural('en', hours, { one: 'hour', other: 'hours' })}`;
      const inMinutes = `${formatNumber('en', minutes)} ${plural('en', minutes, { one: 'minute', other: 'minutes' })}`;
      if (minutes === 0) return inHours;
      return hours === 0 ? inMinutes : `${inHours} ${inMinutes}`;
    },
    /** The working days and hours the calendar sets, then when the person is free next within them. */
    works: (days: string, start: string, end: string, free: string | null) =>
      `Works ${days} ${start}-${end}${free === null ? '' : `, ${free}`}`,
    /** Three or more working days in a row, such as "Mon-Fri". */
    dayRange: (first: string, last: string) => `${first}-${last}`,
    everyDay: 'every day',
    weekdays: {
      monday: 'Mon',
      tuesday: 'Tue',
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun',
    } satisfies Record<Weekday, string>,
    freeNow: 'free now',
    freeFrom: (time: string) => `free from ${time}`,
    /** In the time's place, before Turn on, until someone consents to reading calendars. */
    calendarNeedsConsent: 'Needs permission to read calendars.',
    turnOn: 'Turn on',
    /** After Turn on, where the person's calendar names no time zone. */
    calendarSilent: "This person's calendar does not say.",
    workPhone: 'Work phone',
    mobile: 'Mobile',
    office: 'Office',
    location: 'Location',
    organization: 'Organization',
    company: 'Company',
    employeeId: 'Employee ID',
    /** Names the row in place of the level where levels are switched off, and always the list of managers. */
    reportingLine: 'Reporting line',
    topOfChart: 'Top of the chart',
    /** Names the row and the list of the person's department path, from the top department down to theirs. */
    department: 'Department',
    manager: 'Manager',
    /** The manager the directory names for a person whose manager the chart leaves out. */
    recordedManager: 'Recorded manager',
    /** Under that manager's name: a hide rule by the checkbox's words in Settings, or why there is nobody to show. */
    managerLeftOut: {
      hiddenBy: (filter: string) => `Hidden by the filters: ${filter}`,
      notInDirectory: 'No longer in the directory, or not a user',
      notInChart: 'Not in this chart',
    } satisfies Record<Exclude<RecordedManagerReason, HideCategory> | 'hiddenBy', unknown>,
    directReports: (count: number) => `Direct reports (${formatNumber('en', count)})`,
    /** Under the first of a long list of direct reports: lists them all, as See the whole team lists everyone below. */
    showAllReports: (count: number) => `Show all ${formatNumber('en', count)}`,
    /** The last section, for people with direct reports: everything about their team but the list of reports. */
    team: 'Team',
    /** Narrows the chart to the person and everyone below them; for the person at its top, the way back. */
    showOnlyTeam: 'Show only this team',
    showEveryone: 'Show everyone',
    /** Lists everyone below the person in the panel's place; not "See everyone", which would stand beside Show everyone. */
    seeTeam: 'See the whole team',
  },
});
