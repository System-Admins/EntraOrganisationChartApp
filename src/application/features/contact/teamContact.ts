import { ACCOUNT_STATES, accountStateOf, type Employee } from '@/domain/employees/employee';
import type { TeamChannel } from '../../abstractions/contactLauncher';

/** Teams drops calls and status messages in larger group chats, and with one person it is no group chat. */
export const GROUP_CHAT_SIZE = { min: 2, max: 20 } as const;

/** Longer mailto and meeting links fail in some mail apps, and where Windows hands a link to an app. */
export const MAX_LINK_PEOPLE = 50;

/** Between copied addresses: Outlook's own, which the To line of most mail apps takes too. */
export const ADDRESS_SEPARATOR = '; ';

/** Why a channel leaves someone out: their account's state, or no e-mail address. */
export const LEFT_OUT_REASONS = [...ACCOUNT_STATES, 'noAddress'] as const;

export type LeftOutReason = (typeof LEFT_OUT_REASONS)[number];

/** 'copy' is the e-mail's: too many addresses for a link, so the person copies them. */
export const TEAM_REACHES = ['link', 'copy', 'tooFew', 'tooMany'] as const;

export type TeamReach = (typeof TEAM_REACHES)[number];

export interface TeamChannelPlan {
  /** UPNs for the chat and the meeting, addresses for the e-mail: everyone the channel reaches, the person asking aside. */
  readonly people: readonly string[];
  readonly reach: TeamReach;
  /** The others it leaves out, per reason; a reason that leaves out nobody is missing. */
  readonly leftOut: Readonly<Partial<Record<LeftOutReason, number>>>;
}

/** What each channel does for the people of one list: a manager's direct reports, their whole team, or part of it. */
export type TeamContactPlan = Readonly<Record<TeamChannel, TeamChannelPlan>>;

type Reached = { readonly address: string } | { readonly leftOut: LeftOutReason };

/** Whom each channel reaches. `youId` is the signed-in user's, who starts the chat, organizes the meeting and sends the e-mail. */
export function planTeamContact(team: readonly Employee[], youId: string | null): TeamContactPlan {
  const others = team.filter((person) => person.id !== youId);
  const teams = sortOut(others, inTeams);
  const mail = sortOut(others, byMail);
  return {
    chat: { ...teams, reach: reachOf('chat', teams.people.length) },
    email: { ...mail, reach: reachOf('email', mail.people.length) },
    meeting: { ...teams, reach: reachOf('meeting', teams.people.length) },
  };
}

/** Teams reaches an enabled member with a license; its links name a guest by a stand-in UPN (#EXT#) of this directory. */
function inTeams(person: Employee): Reached {
  const state = accountStateOf(person);
  return state === null ? { address: person.userPrincipalName } : { leftOut: state };
}

/** The address mail reaches the person at: anyone with one, guests included, but no disabled account, which is mostly someone who left. */
export function mailAddressOf(person: Employee): string | null {
  return accountStateOf(person) === 'disabled' ? null : person.mail;
}

function byMail(person: Employee): Reached {
  const address = mailAddressOf(person);
  if (address !== null) return { address };
  return { leftOut: accountStateOf(person) === 'disabled' ? 'disabled' : 'noAddress' };
}

function sortOut(people: readonly Employee[], reach: (person: Employee) => Reached): Omit<TeamChannelPlan, 'reach'> {
  const reached: string[] = [];
  const leftOut: Partial<Record<LeftOutReason, number>> = {};
  for (const person of people) {
    const result = reach(person);
    if ('address' in result) reached.push(result.address);
    else leftOut[result.leftOut] = (leftOut[result.leftOut] ?? 0) + 1;
  }
  return { people: reached, leftOut };
}

function reachOf(channel: TeamChannel, count: number): TeamReach {
  switch (channel) {
    case 'chat':
      return count < GROUP_CHAT_SIZE.min ? 'tooFew' : count > GROUP_CHAT_SIZE.max ? 'tooMany' : 'link';
    case 'email':
      return count === 0 ? 'tooFew' : count > MAX_LINK_PEOPLE ? 'copy' : 'link';
    case 'meeting':
      return count === 0 ? 'tooFew' : count > MAX_LINK_PEOPLE ? 'tooMany' : 'link';
  }
}
