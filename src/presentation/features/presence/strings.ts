import { defineStrings } from '@/application/settings/language';
import type { Availability } from '@/domain/presence/presence';

/** Teams' own words for a status; an activity Graph adds later is shown as its spaced-out name. */
export const PRESENCE_STRINGS = defineStrings({
  en: {
    availability: {
      available: 'Available',
      busy: 'Busy',
      doNotDisturb: 'Do not disturb',
      away: 'Away',
      offline: 'Offline',
      unknown: 'Status unknown',
    } satisfies Record<Availability, string>,
    activity: {
      BeRightBack: 'Be right back',
      InACall: 'In a call',
      InAConferenceCall: 'In a conference call',
      InAMeeting: 'In a meeting',
      Presenting: 'Presenting',
      UrgentInterruptionsOnly: 'Urgent interruptions only',
      OffWork: 'Off work',
      Inactive: 'Inactive',
      OutOfOffice: 'Out of office',
    },
  },
});
