import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { PresenceUnavailableError, type PresenceSource } from '@/application/abstractions/presenceSource';
import { WORK_LOCATIONS, type Availability, type Presence } from '@/domain/presence/presence';
import { GraphRequestError, type GraphClient } from './graphClient';

/** Limit of /communications/getPresencesByUserId. */
const MAX_IDS_PER_REQUEST = 650;

/** Teams' own limit for a status message. */
const MAX_STATUS_MESSAGE = 280;
/** Room for any reply people write; what is cut is mostly a legal footer. */
const MAX_REPLY = 1000;

interface GraphPresence {
  readonly id: string;
  readonly availability: string;
  readonly activity: string;
  /** The message is the automatic reply as written in Outlook or Teams, usually HTML. */
  readonly outOfOfficeSettings?: { readonly isOutOfOffice?: boolean | null; readonly message?: string | null } | null;
  readonly statusMessage?: {
    readonly message?: { readonly content?: string | null; readonly contentType?: string | null } | null;
  } | null;
  /** Also 'unspecified' and values Graph adds later. */
  readonly workLocation?: { readonly workLocationType?: string | null } | null;
}

const AVAILABILITY: Readonly<Record<string, Availability>> = {
  Available: 'available',
  AvailableIdle: 'available',
  Busy: 'busy',
  BusyIdle: 'busy',
  DoNotDisturb: 'doNotDisturb',
  Away: 'away',
  BeRightBack: 'away',
  Offline: 'offline',
};

/** Activities that only repeat the availability. */
const PLAIN_ACTIVITIES = new Set(['Available', 'Away', 'Busy', 'DoNotDisturb', 'Offline', 'PresenceUnknown']);

export class GraphPresenceSource implements PresenceSource {
  constructor(private readonly graph: GraphClient) {}

  async getPresences(ids: readonly string[]): Promise<ReadonlyMap<string, Presence>> {
    const presences = new Map<string, Presence>();
    for (let start = 0; start < ids.length; start += MAX_IDS_PER_REQUEST) {
      const chunk = ids.slice(start, start + MAX_IDS_PER_REQUEST);
      try {
        const { value } = await this.graph.postJson<{ value: GraphPresence[] }>('/communications/getPresencesByUserId', {
          ids: chunk,
        });
        for (const presence of value) presences.set(presence.id, toPresence(presence));
      } catch (error) {
        // Missing consent shows up as a token that needs interaction; a policy that blocks presence as a 403.
        if (error instanceof SignInRequiredError) throw new PresenceUnavailableError('consent', { cause: error });
        if (error instanceof GraphRequestError && error.status === 403) {
          throw new PresenceUnavailableError('denied', { cause: error });
        }
        throw error;
      }
    }
    return presences;
  }
}

export function toPresence({ availability, activity, outOfOfficeSettings, statusMessage, workLocation }: GraphPresence): Presence {
  const outOfOffice = outOfOfficeSettings?.isOutOfOffice === true || activity === 'OutOfOffice';
  const reply = outOfOfficeSettings?.message;
  const note = statusMessage?.message;
  return {
    availability: AVAILABILITY[availability] ?? 'unknown',
    activity: PLAIN_ACTIVITIES.has(activity) ? null : activity,
    outOfOffice,
    // Graph also gives a reply that is set up for later, which would say the person is away while they are not.
    outOfOfficeMessage: outOfOffice && reply ? plainText(reply, MAX_REPLY) : null,
    statusMessage: note?.content
      ? note.contentType === 'html'
        ? plainText(note.content, MAX_STATUS_MESSAGE)
        : oneLine(note.content, MAX_STATUS_MESSAGE)
      : null,
    workLocation: WORK_LOCATIONS.find((location) => location === workLocation?.workLocationType) ?? null,
  };
}

/** HTML, such as an automatic reply written in Outlook, as one line of plain text of at most `max` characters. */
function plainText(html: string, max: number): string | null {
  // A parsed document runs no scripts and loads nothing; only its text is kept.
  const { body } = new DOMParser().parseFromString(html, 'text/html');
  for (const unseen of body.querySelectorAll('script, style, template, noscript')) unseen.remove();
  // The text alone would run together the words on either side of a paragraph, a line break or a table cell.
  for (const block of body.querySelectorAll('br, p, div, li, tr, td, th, h1, h2, h3, h4, h5, h6, blockquote')) {
    block.before(' ');
    block.after(' ');
  }
  return oneLine(body.textContent, max);
}

/** Single spaces, cut with "..." to at most `max` characters; null when no text is left. */
function oneLine(text: string, max: number): string | null {
  const line = text.replace(/\s+/g, ' ').trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 3).trimEnd()}...` : line;
}
