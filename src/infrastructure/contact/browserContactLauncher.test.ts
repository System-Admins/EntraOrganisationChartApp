// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserContactLauncher } from './browserContactLauncher';

/** The links followed, as the anchors that were clicked: jsdom follows none. */
function followed() {
  const links: { href: string; target: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    links.push({ href: this.href, target: this.target });
  });
  return () => links;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BrowserContactLauncher', () => {
  it('says that Teams opens in a new tab and the mail app without one', () => {
    expect(new BrowserContactLauncher('mailto').destinations()).toEqual({
      chat: 'teamsNewTab',
      call: 'teamsNewTab',
      email: 'mailApp',
      meeting: 'teamsNewTab',
    });
  });

  it('says that Outlook on the web opens in a new tab', () => {
    expect(new BrowserContactLauncher('outlookWeb').destinations().email).toBe('outlookNewTab');
  });

  it('opens a team\'s group chat and its new meeting in Teams in a new tab', async () => {
    const links = followed();
    const launcher = new BrowserContactLauncher('mailto');

    await launcher.chatWithGroup(['anna@contoso.com', 'ola@contoso.com'], "Anna's team");
    await launcher.meetWith(['anna@contoso.com', 'ola@contoso.com']);

    expect(links()).toEqual([
      {
        href: 'https://teams.microsoft.com/l/chat/0/0?users=anna%40contoso.com,ola%40contoso.com&topicName=Anna%27s%20team',
        target: '_blank',
      },
      { href: 'https://teams.microsoft.com/l/meeting/new?attendees=anna%40contoso.com,ola%40contoso.com', target: '_blank' },
    ]);
  });

  it('writes to a whole team in the mail app in place, and in Outlook on the web in a new tab', async () => {
    const links = followed();

    await new BrowserContactLauncher('mailto').emailGroup(['anna@contoso.com', 'ola@contoso.com']);
    await new BrowserContactLauncher('outlookWeb').emailGroup(['anna@contoso.com', 'ola@contoso.com']);

    expect(links()).toEqual([
      { href: 'mailto:anna@contoso.com,ola@contoso.com', target: '' },
      { href: 'https://outlook.office.com/mail/deeplink/compose?to=anna%40contoso.com,ola%40contoso.com', target: '_blank' },
    ]);
  });
});
