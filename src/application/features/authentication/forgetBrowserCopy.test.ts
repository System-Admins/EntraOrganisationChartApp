import { describe, expect, it, vi } from 'vitest';
import type { Authenticator } from '../../abstractions/authenticator';
import type { BrowserCopy } from '../../abstractions/browserCopy';
import type { RequestHandler } from '../../common/mediator';
import { ForgetBrowserCopyCommand, ForgetBrowserCopyHandler } from './forgetBrowserCopy';

describe('ForgetBrowserCopyHandler', () => {
  it('deletes what the chart keeps in the browser and its own sign-in there, never the host\'s, then starts the page afresh', async () => {
    const calls: string[] = [];
    const authenticator = {
      forgetSignIn: () => Promise.resolve(void calls.push('forgetSignIn')),
      signOut: () => Promise.resolve(void calls.push('signOut')),
    } as Authenticator;
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
    const recentPeople: BrowserCopy = { forget: () => Promise.resolve(void calls.push('recent people forgotten')) };

    const handler: RequestHandler<ForgetBrowserCopyCommand> = new ForgetBrowserCopyHandler(
      authenticator,
      [directory, recentPeople],
      () => calls.push('reload'),
    );
    const handled = handler.handle(new ForgetBrowserCopyCommand());
    await Promise.resolve();
    // The browser is still deleting the directory, which a reload would cut short.
    expect(calls).toEqual(['recent people forgotten']);

    deleteDirectory();
    await handled;
    expect(calls).toEqual(['recent people forgotten', 'directory forgotten', 'forgetSignIn', 'reload']);
  });

  it('stays on the page when the sign-in could not be deleted, so that the page can say so', async () => {
    const failure = new Error('The browser refused.');
    const authenticator = { forgetSignIn: () => Promise.reject(failure) } as unknown as Authenticator;
    const reload = vi.fn();

    const handler = new ForgetBrowserCopyHandler(authenticator, [], reload);

    await expect(handler.handle()).rejects.toBe(failure);
    expect(reload).not.toHaveBeenCalled();
  });
});
