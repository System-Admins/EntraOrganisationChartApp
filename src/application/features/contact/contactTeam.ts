import type { Employee } from '@/domain/employees/employee';
import type { ContactLauncher, TeamChannel } from '../../abstractions/contactLauncher';
import type { SignedInUserSource } from '../../abstractions/signedInUser';
import { Command, type RequestHandler } from '../../common/mediator';
import { planTeamContact } from './teamContact';

/** Reaches a team through a link, as GetTeamContactQuery planned it; addresses to copy instead go through CopyTextCommand. */
export class ContactTeamCommand extends Command {
  constructor(
    /** Everyone the tiles reach as the chart shows them: the people of the list beside them. */
    readonly team: readonly Employee[],
    readonly channel: TeamChannel,
    /** The group chat's name, in the language of the page. */
    readonly topic: string,
  ) {
    super();
  }
}

export class ContactTeamHandler implements RequestHandler<ContactTeamCommand> {
  constructor(
    private readonly launcher: ContactLauncher,
    private readonly signedInUser: SignedInUserSource,
  ) {}

  handle({ team, channel, topic }: ContactTeamCommand): Promise<void> {
    const { people, reach } = planTeamContact(team, this.signedInUser.getSignedInUser()?.id ?? null)[channel];
    if (reach !== 'link') return Promise.reject(new Error(`A link can't reach this team's ${people.length} people by ${channel}.`));
    switch (channel) {
      case 'chat':
        return this.launcher.chatWithGroup(people, topic);
      case 'email':
        return this.launcher.emailGroup(people);
      case 'meeting':
        return this.launcher.meetWith(people);
    }
  }
}
