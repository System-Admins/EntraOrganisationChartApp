import type { Authenticator } from '../../abstractions/authenticator';
import type { BrowserCopy } from '../../abstractions/browserCopy';
import { Command, type RequestHandler } from '../../common/mediator';

/** Sign out's deletions without leaving the host's Microsoft sign-in, for shared computers where the host page owns it. */
export class ForgetBrowserCopyCommand extends Command {}

export class ForgetBrowserCopyHandler implements RequestHandler<ForgetBrowserCopyCommand> {
  constructor(
    private readonly authenticator: Authenticator,
    private readonly copies: readonly BrowserCopy[],
    /** Starts the page afresh, as nothing it holds in memory may outlive the copies. */
    private readonly reload: () => void,
  ) {}

  async handle(): Promise<void> {
    await Promise.all(this.copies.map((copy) => copy.forget()));
    await this.authenticator.forgetSignIn();
    this.reload();
  }
}
