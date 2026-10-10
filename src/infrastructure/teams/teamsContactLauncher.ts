import { app, call, chat } from '@microsoft/teams-js';
import type { ContactDestinations, ContactLauncher } from '@/application/abstractions/contactLauncher';
import type { EmailClient } from '../config/appConfig';
import {
  emailUrl,
  followLink,
  teamsCallUrl,
  teamsChatUrl,
  teamsGroupChatUrl,
  teamsMeetingUrl,
} from '../contact/contactLinks';

/** Hosts without the chat or call capability get the deep link, which openLink routes from inside the iframe. */
export class TeamsContactLauncher implements ContactLauncher {
  constructor(private readonly emailClient: EmailClient) {}

  chat(userPrincipalName: string): Promise<void> {
    return chat.isSupported() ? chat.openChat({ user: userPrincipalName }) : app.openLink(teamsChatUrl(userPrincipalName));
  }

  async call(userPrincipalName: string): Promise<void> {
    if (call.isSupported()) {
      await call.startCall({ targets: [userPrincipalName], requestedModalities: [call.CallModalities.Audio] });
    } else {
      await app.openLink(teamsCallUrl(userPrincipalName));
    }
  }

  email(address: string): Promise<void> {
    return this.emailGroup([address]);
  }

  chatWithGroup(userPrincipalNames: readonly string[], topic: string): Promise<void> {
    return chat.isSupported()
      ? chat.openGroupChat({ users: [...userPrincipalNames], topic })
      : app.openLink(teamsGroupChatUrl(userPrincipalNames, topic));
  }

  emailGroup(addresses: readonly string[]): Promise<void> {
    const url = emailUrl(addresses, this.emailClient);
    return this.emailClient === 'mailto' ? followLink(url, false) : app.openLink(url);
  }

  // Teams has no calendar capability (composeMeeting is Outlook's), so its own deep link opens the form.
  meetWith(userPrincipalNames: readonly string[]): Promise<void> {
    return app.openLink(teamsMeetingUrl(userPrincipalNames));
  }

  destinations(): ContactDestinations {
    return {
      chat: chat.isSupported() ? 'teamsHere' : 'teamsNewWindow',
      call: call.isSupported() ? 'teamsHere' : 'teamsNewWindow',
      email: this.emailClient === 'mailto' ? 'mailApp' : 'outlookNewWindow',
      // Where chats open inside Teams, its links open there too; elsewhere (Outlook, Microsoft 365) Teams opens anew.
      meeting: chat.isSupported() ? 'teamsHere' : 'teamsNewWindow',
    };
  }
}
