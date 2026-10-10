// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SignInFailedError } from '@/application/abstractions/authenticator';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { HostEnvironment } from '../host/hostEnvironment';
import { WEB_PART_MESSAGES } from './webPartMessages';
import { connectToWebPart, WebPartSignIn } from './webPartHost';

const SHAREPOINT = 'https://contoso.sharepoint.com';
const USER = { id: 'anna', displayName: 'Anna', userPrincipalName: 'anna@contoso.com', isGuest: false };

/** The window around the chart, which posts what the web part would. */
let parent: { postMessage: Mock<(message: unknown, targetOrigin: string) => void> };
const hosts: HostEnvironment[] = [];

const post = (data: unknown, source: unknown = parent, origin = SHAREPOINT) => {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
};

/** The chart connected to a web part that answered as SharePoint's would. */
async function connected(locale = 'nb-NO'): Promise<HostEnvironment> {
  const host = connectToWebPart(parent as unknown as Window, 1000);
  post({ type: WEB_PART_MESSAGES.hello, user: USER, locale });
  hosts.push(await host);
  return host;
}

function signInOf(host: HostEnvironment): WebPartSignIn {
  if (!(host.signIn instanceof WebPartSignIn)) throw new Error('The host has no web part sign-in.');
  return host.signIn;
}

/** The token request the chart posted last, answered with `answer`. */
function answerLastRequest(answer: object, origin = SHAREPOINT) {
  const [request] = parent.postMessage.mock.lastCall as [{ id: number }, string];
  post({ type: WEB_PART_MESSAGES.token, id: request.id, ...answer }, parent, origin);
}

beforeEach(() => {
  parent = { postMessage: vi.fn() };
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB', 'en']);
});

afterEach(() => {
  for (const host of hosts.splice(0)) signInOf(host).dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('connectToWebPart', () => {
  it('asks the window around it who is viewing the page, and speaks the page\'s language first', async () => {
    const host = await connected();

    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith({ type: WEB_PART_MESSAGES.hello }, '*');
    expect(host).toMatchObject({ kind: 'sharepoint', theme: null, subPageId: null, languages: ['nb-NO', 'en-GB', 'en'] });
    expect(host.signIn?.user).toEqual(USER);
  });

  it('leaves the language to the browser where the page names none', async () => {
    expect((await connected('')).languages).toEqual(['en-GB', 'en']);
  });

  it('takes the answer of the window around it alone, and only a whole one', async () => {
    const host = connectToWebPart(parent as unknown as Window, 1000);
    post({ type: WEB_PART_MESSAGES.hello, user: { ...USER, id: 'mallory' }, locale: 'en' }, window);
    post({ type: WEB_PART_MESSAGES.hello, user: { id: 'anna' }, locale: 'en' });
    post({ type: WEB_PART_MESSAGES.hello, user: USER, locale: 'en' });
    const reached = await host;
    hosts.push(reached);

    expect(reached.signIn?.user.id).toBe('anna');
  });

  it('gives up where no web part answers, and listens no more', async () => {
    vi.useFakeTimers();
    const removed = vi.spyOn(window, 'removeEventListener');
    const host = connectToWebPart(parent as unknown as Window, 1000);
    const failed = expect(host).rejects.toThrow('No answer within 1000 ms.');

    await vi.advanceTimersByTimeAsync(1000);

    await failed;
    expect(removed).toHaveBeenCalledWith('message', expect.any(Function));
  });
});

describe('WebPartSignIn', () => {
  it("asks for each token at the web part's origin alone, and takes the answer from there only", async () => {
    const signIn = signInOf(await connected());
    parent.postMessage.mockClear();
    const token = signIn.graphToken(false);

    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith({ type: WEB_PART_MESSAGES.token, id: 1, fresh: false }, SHAREPOINT);
    answerLastRequest({ token: 'forged' }, 'https://fabrikam.example');
    answerLastRequest({ token: 'graph-token' });
    await expect(token).resolves.toBe('graph-token');
  });

  it('keeps the requests apart, whatever order the answers come in', async () => {
    const signIn = signInOf(await connected());
    const first = signIn.graphToken(false);
    const second = signIn.graphToken(true);

    post({ type: WEB_PART_MESSAGES.token, id: 2, token: 'fresh' });
    post({ type: WEB_PART_MESSAGES.token, id: 1, token: 'cached' });

    await expect(first).resolves.toBe('cached');
    await expect(second).resolves.toBe('fresh');
    expect(parent.postMessage).toHaveBeenLastCalledWith({ type: WEB_PART_MESSAGES.token, id: 2, fresh: true }, SHAREPOINT);
  });

  it('tells API access that SharePoint has not approved, the IT support\'s to give, from other failures', async () => {
    const signIn = signInOf(await connected());
    const failure = async (error: string) => {
      const token = signIn.graphToken(false);
      answerLastRequest({ error });
      return token.catch((reason: unknown) => reason);
    };

    const notApproved = await failure('AADSTS65001: The user or administrator has not consented to use the application.');
    expect(notApproved).toBeInstanceOf(ServiceError);
    expect(notApproved).toMatchObject({ failure: 'accessDenied' });
    expect(String(notApproved)).toContain('SharePoint admin center');
    expect(await failure('AADSTS53003: Access has been blocked by Conditional Access policies.')).toMatchObject({
      reason: 'blocked',
    });
    const other = await failure('Token request previously failed');
    expect(other).toBeInstanceOf(SignInFailedError);
    expect(other).toMatchObject({ reason: 'other', message: 'SharePoint gave no token for Microsoft Graph: Token request previously failed' });
  });
});
