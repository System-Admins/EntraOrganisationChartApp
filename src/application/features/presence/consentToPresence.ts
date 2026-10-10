import type { Authenticator } from '../../abstractions/authenticator';
import { Command, type RequestHandler } from '../../common/mediator';

export class ConsentToPresenceCommand extends Command {}

export class ConsentToPresenceHandler implements RequestHandler<ConsentToPresenceCommand> {
  constructor(private readonly authenticator: Authenticator) {}

  handle(): Promise<void> {
    return this.authenticator.consentToPresence();
  }
}
