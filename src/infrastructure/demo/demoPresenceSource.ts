import type { PresenceSource } from '@/application/abstractions/presenceSource';
import type { Presence } from '@/domain/presence/presence';
import { stableHash } from './stableHash';

const NOTHING_SET = { activity: null, outOfOffice: false, outOfOfficeMessage: null, statusMessage: null, workLocation: null } as const;

const UNKNOWN: Presence = { ...NOTHING_SET, availability: 'unknown' };

/** Long enough to be cut to three lines in the details panel. */
const AUTOMATIC_REPLY =
  'Thank you for your message. I am on holiday and have no access to e-mail. For anything urgent, please contact my ' +
  'manager, or the service desk at servicedesk@contoso.com. I will reply to your message when I am back.';

const STATES: readonly Presence[] = [
  { ...NOTHING_SET, availability: 'available', workLocation: 'office' },
  { ...NOTHING_SET, availability: 'available', workLocation: 'remote', statusMessage: 'Working from home today, reachable on Teams' },
  { ...NOTHING_SET, availability: 'available' },
  { ...NOTHING_SET, availability: 'busy', activity: 'InAMeeting', workLocation: 'office' },
  { ...NOTHING_SET, availability: 'busy', activity: 'InACall', workLocation: 'remote' },
  { ...NOTHING_SET, availability: 'doNotDisturb', activity: 'Presenting', statusMessage: 'Presenting at the town hall this morning' },
  { ...NOTHING_SET, availability: 'away', workLocation: 'office' },
  { ...NOTHING_SET, availability: 'away', activity: 'BeRightBack', statusMessage: 'Lunch, back in 30 minutes' },
  { ...NOTHING_SET, availability: 'offline' },
  {
    ...NOTHING_SET,
    availability: 'offline',
    activity: 'OutOfOffice',
    outOfOffice: true,
    outOfOfficeMessage: AUTOMATIC_REPLY,
    workLocation: 'timeOff',
  },
];

/** How long a demo person keeps a status, so the display visibly changes during a demo. */
export const CHANGE_EVERY_MS = 2 * 60_000;

export class DemoPresenceSource implements PresenceSource {
  constructor(private readonly now: () => number = () => Date.now()) {}

  getPresences(ids: readonly string[]): Promise<ReadonlyMap<string, Presence>> {
    const period = Math.floor(this.now() / CHANGE_EVERY_MS);
    return Promise.resolve(new Map(ids.map((id) => [id, STATES[(stableHash(id) + period) % STATES.length] ?? UNKNOWN])));
  }
}
