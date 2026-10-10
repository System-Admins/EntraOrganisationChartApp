import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamsContactLauncher } from './teamsContactLauncher';

const teams = vi.hoisted(() => ({
  chat: true,
  call: true,
  openGroupChat: vi.fn<(request: { users: string[]; topic?: string }) => Promise<void>>(() => Promise.resolve()),
  openLink: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('@microsoft/teams-js', () => ({
  app: { openLink: teams.openLink },
  chat: { isSupported: () => teams.chat, openGroupChat: teams.openGroupChat },
  call: { isSupported: () => teams.call },
}));

afterEach(() => {
  teams.chat = true;
  teams.call = true;
  teams.openGroupChat.mockClear();
  teams.openLink.mockClear();
});

describe('TeamsContactLauncher', () => {
  it('says that chats, calls and meetings stay in Teams', () => {
    expect(new TeamsContactLauncher('mailto').destinations()).toEqual({
      chat: 'teamsHere',
      call: 'teamsHere',
      email: 'mailApp',
      meeting: 'teamsHere',
    });
  });

  it('says that a host without chats and calls, and Outlook on the web, open a new window', () => {
    teams.chat = false;
    teams.call = false;

    expect(new TeamsContactLauncher('outlookWeb').destinations()).toEqual({
      chat: 'teamsNewWindow',
      call: 'teamsNewWindow',
      email: 'outlookNewWindow',
      meeting: 'teamsNewWindow',
    });
  });

  it('opens a team\'s group chat in Teams itself, named after the team', async () => {
    const people = ['anna@contoso.com', 'ola@contoso.com'];

    await new TeamsContactLauncher('mailto').chatWithGroup(people, "Anna's team");

    expect(teams.openGroupChat).toHaveBeenCalledExactlyOnceWith({ users: people, topic: "Anna's team" });
    expect(teams.openLink).not.toHaveBeenCalled();
  });

  it('opens the group chat\'s deep link in a host without chats', async () => {
    teams.chat = false;

    await new TeamsContactLauncher('mailto').chatWithGroup(['anna@contoso.com', 'ola@contoso.com'], "Anna's team");

    expect(teams.openLink).toHaveBeenCalledExactlyOnceWith(
      "https://teams.microsoft.com/l/chat/0/0?users=anna%40contoso.com,ola%40contoso.com&topicName=Anna's%20team",
    );
    expect(teams.openGroupChat).not.toHaveBeenCalled();
  });

  it('opens the form for a new meeting through its deep link, as Teams has no calendar capability', async () => {
    await new TeamsContactLauncher('mailto').meetWith(['anna@contoso.com', 'ola@contoso.com']);

    expect(teams.openLink).toHaveBeenCalledExactlyOnceWith(
      'https://teams.microsoft.com/l/meeting/new?attendees=anna%40contoso.com,ola%40contoso.com',
    );
  });

  it('writes to a whole team in Outlook on the web through Teams, which opens the link', async () => {
    await new TeamsContactLauncher('outlookWeb').emailGroup(['anna@contoso.com', 'ola@contoso.com']);

    expect(teams.openLink).toHaveBeenCalledExactlyOnceWith(
      'https://outlook.office.com/mail/deeplink/compose?to=anna%40contoso.com,ola%40contoso.com',
    );
  });
});
