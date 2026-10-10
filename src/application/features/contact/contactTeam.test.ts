import { describe, expect, it, vi } from 'vitest';
import type { ContactLauncher } from '@/application/abstractions/contactLauncher';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import type { Employee } from '@/domain/employees/employee';
import { makeEmployee } from '@/testing/makeEmployee';
import { ContactTeamCommand, ContactTeamHandler } from './contactTeam';
import { GetTeamContactHandler, GetTeamContactQuery } from './getTeamContact';
import { GROUP_CHAT_SIZE, MAX_LINK_PEOPLE, planTeamContact } from './teamContact';

const lead = makeEmployee('lead', null, { userPrincipalName: 'lead@contoso.onmicrosoft.com', mail: 'lead@contoso.com' });

/** `count` direct reports of the lead, all enabled members with an address. */
const reports = (count: number, prefix = 'dev') =>
  Array.from({ length: count }, (_, index) => makeEmployee(`${prefix}${String(index + 1)}`, 'lead'));

const YOU: SignedInUser = { id: 'dev1', displayName: 'Dev1', userPrincipalName: 'dev1@contoso.com', isGuest: false };

function launcher() {
  const chatWithGroup = vi.fn<ContactLauncher['chatWithGroup']>(() => Promise.resolve());
  const emailGroup = vi.fn<ContactLauncher['emailGroup']>(() => Promise.resolve());
  const meetWith = vi.fn<ContactLauncher['meetWith']>(() => Promise.resolve());
  const ports: ContactLauncher = {
    chat: vi.fn<ContactLauncher['chat']>(),
    call: vi.fn<ContactLauncher['call']>(),
    email: vi.fn<ContactLauncher['email']>(),
    chatWithGroup,
    emailGroup,
    meetWith,
    destinations: vi.fn<ContactLauncher['destinations']>(),
  };
  return { chatWithGroup, emailGroup, meetWith, ports };
}

describe('planTeamContact', () => {
  it('reaches the manager and the direct reports by UPN in Teams and by address in mail, the person asking aside', () => {
    const team = [lead, ...reports(3)];

    const contact = planTeamContact(team, 'dev1');

    expect(contact.chat).toEqual({ people: ['lead@contoso.onmicrosoft.com', 'dev2@contoso.com', 'dev3@contoso.com'], reach: 'link', leftOut: {} });
    expect(contact.meeting).toEqual(contact.chat);
    expect(contact.email).toEqual({ people: ['lead@contoso.com', 'dev2@contoso.com', 'dev3@contoso.com'], reach: 'link', leftOut: {} });
    expect(planTeamContact(team, null).chat.people).toHaveLength(4);
  });

  it('leaves guests, disabled accounts and members without a license out of the chat and the meeting', () => {
    const team: Employee[] = [
      lead,
      ...reports(2),
      makeEmployee('consultant', 'lead', { isGuest: true, mail: 'consultant@fabrikam.com' }),
      makeEmployee('former', 'lead', { accountEnabled: false }),
      makeEmployee('trainee', 'lead', { isLicensed: false }),
    ];

    const { chat } = planTeamContact(team, null);

    expect(chat.people).toEqual(['lead@contoso.onmicrosoft.com', 'dev1@contoso.com', 'dev2@contoso.com']);
    expect(chat.leftOut).toEqual({ guest: 1, disabled: 1, unlicensed: 1 });
  });

  it('e-mails guests and members without a license, but no disabled account and nobody without an address', () => {
    const team: Employee[] = [
      lead,
      makeEmployee('consultant', 'lead', { isGuest: true, mail: 'consultant@fabrikam.com' }),
      makeEmployee('trainee', 'lead', { isLicensed: false }),
      makeEmployee('former', 'lead', { accountEnabled: false }),
      makeEmployee('formerGuest', 'lead', { accountEnabled: false, isGuest: true }),
      makeEmployee('noMail', 'lead', { mail: null }),
    ];

    const { email } = planTeamContact(team, null);

    expect(email.people).toEqual(['lead@contoso.com', 'consultant@fabrikam.com', 'trainee@contoso.com']);
    expect(email.leftOut).toEqual({ disabled: 2, noAddress: 1 });
  });

  it('offers a group chat for 2 to 20 people, the person asking aside, and says why where it offers none', () => {
    const reach = (count: number) => planTeamContact([lead, ...reports(count - 1)], null).chat.reach;

    expect(reach(GROUP_CHAT_SIZE.min - 1)).toBe('tooFew');
    expect(reach(GROUP_CHAT_SIZE.min)).toBe('link');
    expect(reach(GROUP_CHAT_SIZE.max)).toBe('link');
    expect(reach(GROUP_CHAT_SIZE.max + 1)).toBe('tooMany');
    // The lead's chat with their one report is a chat with that person, which their own Chat button starts.
    expect(planTeamContact([lead, ...reports(1)], 'lead').chat.reach).toBe('tooFew');
  });

  it('links an e-mail to up to 50 addresses and has the rest copied, and a meeting to up to 50 people', () => {
    const plan = (count: number) => planTeamContact([lead, ...reports(count - 1)], null);

    expect(plan(MAX_LINK_PEOPLE).email.reach).toBe('link');
    expect(plan(MAX_LINK_PEOPLE).meeting.reach).toBe('link');
    const crowd = plan(MAX_LINK_PEOPLE + 1);
    expect(crowd.email).toMatchObject({ reach: 'copy' });
    expect(crowd.email.people).toHaveLength(MAX_LINK_PEOPLE + 1);
    expect(crowd.meeting.reach).toBe('tooMany');
  });

  it('reaches nobody where everyone else is left out', () => {
    const contact = planTeamContact([lead, makeEmployee('former', 'lead', { accountEnabled: false, mail: null })], 'lead');

    expect([contact.chat.reach, contact.email.reach, contact.meeting.reach]).toEqual(['tooFew', 'tooFew', 'tooFew']);
  });
});

describe('GetTeamContactHandler', () => {
  it('leaves the signed-in user out, and nobody before anyone has signed in', async () => {
    let signedIn: SignedInUser | null = YOU;
    const handler = new GetTeamContactHandler({ getSignedInUser: () => signedIn });
    const team = [lead, ...reports(2)];

    expect((await handler.handle(new GetTeamContactQuery(team))).email.people).toEqual(['lead@contoso.com', 'dev2@contoso.com']);
    signedIn = null;
    expect((await handler.handle(new GetTeamContactQuery(team))).email.people).toHaveLength(3);
  });
});

describe('ContactTeamHandler', () => {
  const team = [lead, ...reports(3)];

  it('starts a group chat named after the team, one e-mail and a meeting with everyone else', async () => {
    const { chatWithGroup, emailGroup, meetWith, ports } = launcher();
    const handler = new ContactTeamHandler(ports, { getSignedInUser: () => YOU });

    await handler.handle(new ContactTeamCommand(team, 'chat', "Lead's team"));
    await handler.handle(new ContactTeamCommand(team, 'email', "Lead's team"));
    await handler.handle(new ContactTeamCommand(team, 'meeting', "Lead's team"));

    const others = ['lead@contoso.onmicrosoft.com', 'dev2@contoso.com', 'dev3@contoso.com'];
    expect(chatWithGroup).toHaveBeenCalledExactlyOnceWith(others, "Lead's team");
    expect(emailGroup).toHaveBeenCalledExactlyOnceWith(['lead@contoso.com', 'dev2@contoso.com', 'dev3@contoso.com']);
    expect(meetWith).toHaveBeenCalledExactlyOnceWith(others);
  });

  it('opens nothing where a link would not reach the team, as with too many people for a chat or an e-mail', async () => {
    const { chatWithGroup, emailGroup, ports } = launcher();
    const handler = new ContactTeamHandler(ports, { getSignedInUser: () => null });
    const crowd = [lead, ...reports(MAX_LINK_PEOPLE)];

    await expect(handler.handle(new ContactTeamCommand(crowd, 'chat', "Lead's team"))).rejects.toThrow(
      "A link can't reach this team's 51 people by chat.",
    );
    await expect(handler.handle(new ContactTeamCommand(crowd, 'email', "Lead's team"))).rejects.toThrow('by email');
    expect(chatWithGroup).not.toHaveBeenCalled();
    expect(emailGroup).not.toHaveBeenCalled();
  });
});
