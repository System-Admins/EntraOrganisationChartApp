/** Teams presence, reduced to what the chart shows. */
export type Availability = 'available' | 'busy' | 'doNotDisturb' | 'away' | 'offline' | 'unknown';

/** Where a person works today, as set in Outlook or Teams; a building's name would need another permission. */
export const WORK_LOCATIONS = ['office', 'remote', 'timeOff'] as const;

export type WorkLocation = (typeof WORK_LOCATIONS)[number];

export interface Presence {
  readonly availability: Availability;
  /** Graph's activity when it says more than the availability, such as InAMeeting, Presenting or BeRightBack. */
  readonly activity: string | null;
  readonly outOfOffice: boolean;
  /** The automatic reply as plain text, only while the person is out of office. */
  readonly outOfOfficeMessage: string | null;
  /** The note the person set in Teams, as plain text. */
  readonly statusMessage: string | null;
  readonly workLocation: WorkLocation | null;
}
