import type { EmailClient } from '../config/appConfig';

export function teamsChatUrl(userPrincipalName: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(userPrincipalName)}`;
}

export function teamsCallUrl(userPrincipalName: string): string {
  return `https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(userPrincipalName)}`;
}

/** Teams adds whoever follows the link, and names the chat after `topic` from three people on. */
export function teamsGroupChatUrl(userPrincipalNames: readonly string[], topic: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${commaList(userPrincipalNames)}&topicName=${encodeURIComponent(topic)}`;
}

/** Teams' form for a new meeting, organized by whoever follows the link. */
export function teamsMeetingUrl(userPrincipalNames: readonly string[]): string {
  return `https://teams.microsoft.com/l/meeting/new?attendees=${commaList(userPrincipalNames)}`;
}

export function emailUrl(addresses: readonly string[], client: EmailClient): string {
  return client === 'outlookWeb'
    ? `https://outlook.office.com/mail/deeplink/compose?to=${commaList(addresses)}`
    : // RFC 6068: characters such as ? & # % in an address would otherwise end or corrupt it; commas part the addresses.
      `mailto:${addresses.map((address) => encodeURIComponent(address).replace(/%40/g, '@')).join(',')}`;
}

/** Each value encoded, as a comma or an & in one would end it; the commas between them stay as the links expect. */
function commaList(values: readonly string[]): string {
  return values.map(encodeURIComponent).join(',');
}

/** Follows a link like a click: mailto: leaves no empty tab, and a new tab isn't treated as a popup. */
export function followLink(url: string, newTab: boolean): Promise<void> {
  const anchor = document.createElement('a');
  anchor.href = url;
  if (newTab) {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  anchor.click();
  return Promise.resolve();
}
