import type { ContactDestinations, ContactLauncher } from '../../abstractions/contactLauncher';
import { Query, type RequestHandler } from '../../common/mediator';

/** Where Chat, E-mail and Call open in this host, and a team's chat, e-mail and meeting. */
export class GetContactDestinationsQuery extends Query<ContactDestinations> {}

export class GetContactDestinationsHandler implements RequestHandler<GetContactDestinationsQuery> {
  constructor(private readonly launcher: ContactLauncher) {}

  handle(): Promise<ContactDestinations> {
    return Promise.resolve(this.launcher.destinations());
  }
}
