import { describe, expect, it } from 'vitest';
import { emailUrl, teamsGroupChatUrl, teamsMeetingUrl } from './contactLinks';

describe('teamsGroupChatUrl', () => {
  it('lists the people with commas, each encoded, and names the chat after the team', () => {
    expect(teamsGroupChatUrl(['anna@contoso.com', 'ola.berg@contoso.com'], "Åse Vik's team & co")).toBe(
      'https://teams.microsoft.com/l/chat/0/0?users=anna%40contoso.com,ola.berg%40contoso.com' +
        "&topicName=%C3%85se%20Vik's%20team%20%26%20co",
    );
  });
});

describe('teamsMeetingUrl', () => {
  it('opens the form for a new meeting with everyone invited, a comma in an address kept inside it', () => {
    expect(teamsMeetingUrl(['anna@contoso.com', 'odd,name@contoso.com'])).toBe(
      'https://teams.microsoft.com/l/meeting/new?attendees=anna%40contoso.com,odd%2Cname%40contoso.com',
    );
  });
});

describe('emailUrl', () => {
  it('writes one message to one address or to several, in the mail app', () => {
    expect(emailUrl(['anna@contoso.com'], 'mailto')).toBe('mailto:anna@contoso.com');
    expect(emailUrl(['anna@contoso.com', 'ola@fabrikam.com'], 'mailto')).toBe('mailto:anna@contoso.com,ola@fabrikam.com');
  });

  it('keeps characters that would end or corrupt a mailto address inside it', () => {
    expect(emailUrl(['r&d?team#1@contoso.com', 'anna@contoso.com'], 'mailto')).toBe(
      'mailto:r%26d%3Fteam%231@contoso.com,anna@contoso.com',
    );
  });

  it('writes the same message in Outlook on the web', () => {
    expect(emailUrl(['anna@contoso.com'], 'outlookWeb')).toBe('https://outlook.office.com/mail/deeplink/compose?to=anna%40contoso.com');
    expect(emailUrl(['anna@contoso.com', 'ola@fabrikam.com'], 'outlookWeb')).toBe(
      'https://outlook.office.com/mail/deeplink/compose?to=anna%40contoso.com,ola%40fabrikam.com',
    );
  });
});
