import type { ContactDestinations, ContactLauncher } from '@/application/abstractions/contactLauncher';
import type { EmailClient } from '../config/appConfig';
import { emailUrl, followLink, teamsCallUrl, teamsChatUrl, teamsGroupChatUrl, teamsMeetingUrl } from './contactLinks';

/** Outside Teams: Teams deep links open the Teams app (or Teams on the web) in a new tab. */
export class BrowserContactLauncher implements ContactLauncher {
  constructor(private readonly emailClient: EmailClient) {}

  chat(userPrincipalName: string): Promise<void> {
    return followLink(teamsChatUrl(userPrincipalName), true);
  }

  call(userPrincipalName: string): Promise<void> {
    return followLink(teamsCallUrl(userPrincipalName), true);
  }

  email(address: string): Promise<void> {
    return this.emailGroup([address]);
  }

  chatWithGroup(userPrincipalNames: readonly string[], topic: string): Promise<void> {
    return followLink(teamsGroupChatUrl(userPrincipalNames, topic), true);
  }

  emailGroup(addresses: readonly string[]): Promise<void> {
    return followLink(emailUrl(addresses, this.emailClient), this.emailClient === 'outlookWeb');
  }

  meetWith(userPrincipalNames: readonly string[]): Promise<void> {
    return followLink(teamsMeetingUrl(userPrincipalNames), true);
  }

  destinations(): ContactDestinations {
    return {
      chat: 'teamsNewTab',
      call: 'teamsNewTab',
      email: this.emailClient === 'outlookWeb' ? 'outlookNewTab' : 'mailApp',
      meeting: 'teamsNewTab',
    };
  }
}
