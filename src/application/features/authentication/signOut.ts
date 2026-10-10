import type { Authenticator } from '../../abstractions/authenticator';
import type { BrowserCopy } from '../../abstractions/browserCopy';
import { Command, type RequestHandler } from '../../common/mediator';

export class SignOutCommand extends Command {}

export class SignOutHandler implements RequestHandler<SignOutCommand> {
  constructor(
    private readonly authenticator: Authenticator,
    private readonly copies: readonly BrowserCopy[],
  ) {}

  /** The copies go first: signing out navigates away from the page. */
  async handle(): Promise<void> {
    await Promise.all(this.copies.map((copy) => copy.forget()));
    await this.authenticator.signOut();
  }
}
