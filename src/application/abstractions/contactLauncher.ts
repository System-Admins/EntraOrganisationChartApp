export const CONTACT_CHANNELS = ['chat', 'email', 'call'] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** How a manager and their direct reports are reached at once: a group chat, one e-mail and a Teams meeting. */
export const TEAM_CHANNELS = ['chat', 'email', 'meeting'] as const;

export type TeamChannel = (typeof TEAM_CHANNELS)[number];

/** Where a contact action opens, so its button can say so before it is pressed. */
export type ContactDestination =
  | 'teamsHere'
  | 'teamsNewTab'
  | 'teamsNewWindow'
  | 'mailApp'
  | 'outlookNewTab'
  | 'outlookNewWindow';

/** A group chat opens where a chat does, and one e-mail to many where an e-mail does. */
export type ContactDestinations = Readonly<Record<ContactChannel | TeamChannel, ContactDestination>>;

export interface ContactLauncher {
  chat(userPrincipalName: string): Promise<void>;
  call(userPrincipalName: string): Promise<void>;
  email(address: string): Promise<void>;
  /** Teams adds the person who starts the chat, and names it `topic` from three people on. */
  chatWithGroup(userPrincipalNames: readonly string[], topic: string): Promise<void>;
  emailGroup(addresses: readonly string[]): Promise<void>;
  /** Teams' form for a new meeting, organized by the person who opens it, with everyone named invited. */
  meetWith(userPrincipalNames: readonly string[]): Promise<void>;
  destinations(): ContactDestinations;
}
