import { describe, expect, it } from 'vitest';
import type { Authenticator } from '../../abstractions/authenticator';
import type { BrowserCopy } from '../../abstractions/browserCopy';
import type { RequestHandler } from '../../common/mediator';
import { SignOutCommand, SignOutHandler } from './signOut';

describe('SignOutHandler', () => {
  it('deletes what the chart keeps in the browser before signing out, which leaves the page', async () => {
    const calls: string[] = [];
    const authenticator = { signOut: () => Promise.resolve(void calls.push('signOut')) } as Authenticator;
    let deleteDirectory: () => void = () => undefined;
    const directory: BrowserCopy = {
      forget: () =>
        new Promise<void>((resolve) => {
          deleteDirectory = () => {
            calls.push('directory forgotten');
            resolve();
          };
        }),
    };
    const photos: BrowserCopy = { forget: () => Promise.resolve(void calls.push('photos forgotten')) };

    const handler: RequestHandler<SignOutCommand> = new SignOutHandler(authenticator, [directory, photos]);
    const handled = handler.handle(new SignOutCommand());
    await Promise.resolve();
    // The browser is still deleting the directory, which leaving the page would cut short.
    expect(calls).toEqual(['photos forgotten']);

    deleteDirectory();
    await handled;
    expect(calls).toEqual(['photos forgotten', 'directory forgotten', 'signOut']);
  });
});
