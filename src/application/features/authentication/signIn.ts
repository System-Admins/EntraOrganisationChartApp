import type { Authenticator } from '../../abstractions/authenticator';
import { Command, type RequestHandler } from '../../common/mediator';

export class SignInCommand extends Command {}

export class SignInHandler implements RequestHandler<SignInCommand> {
  constructor(private readonly authenticator: Authenticator) {}

  handle(): Promise<void> {
    return this.authenticator.signIn();
  }
}
