// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEB_PART_MESSAGES } from '../sharepoint/webPartMessages';
import { WebPartSignIn } from '../sharepoint/webPartHost';
import { detectHostEnvironment } from './hostEnvironment';

const USER = { id: 'anna', displayName: 'Anna', userPrincipalName: 'anna@contoso.com', isGuest: false };

/** The chart in a frame, whose window around it jsdom gives as the window itself. */
function framed() {
  vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('detectHostEnvironment', () => {
  it('leaves the theme and the language to the browser on a page of its own', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'en']);

    expect(await detectHostEnvironment('')).toMatchObject({
      kind: 'standalone',
      theme: null,
      subPageId: null,
      languages: ['de-DE', 'en'],
      signIn: null,
    });
  });

  it("asks no web part on a page of its own, even at the web part's address", async () => {
    const posted = vi.spyOn(window, 'postMessage');

    expect(await detectHostEnvironment('?host=sharepoint')).toMatchObject({ kind: 'standalone', signIn: null });
    expect(posted).not.toHaveBeenCalled();
  });

  it('takes the sign-in of the SharePoint web part around it', async () => {
    framed();
    vi.spyOn(window, 'postMessage').mockImplementation(() => {
      const data = { type: WEB_PART_MESSAGES.hello, user: USER, locale: 'en-US' };
      window.dispatchEvent(new MessageEvent('message', { data, origin: 'https://contoso.sharepoint.com', source: window }));
    });

    const host = await detectHostEnvironment('?host=sharepoint');

    expect(host.kind).toBe('sharepoint');
    expect(host.signIn).toBeInstanceOf(WebPartSignIn);
    expect(host.signIn?.user).toEqual(USER);
    (host.signIn as WebPartSignIn).dispose();
  });

  it('runs as a plain embedded page, signing in itself, where the web part does not answer', async () => {
    vi.useFakeTimers();
    framed();
    const posted = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = detectHostEnvironment('?host=sharepoint');
    await vi.waitFor(() => {
      expect(posted).toHaveBeenCalledOnce();
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(await host).toMatchObject({ kind: 'embedded', signIn: null });
    expect(warn).toHaveBeenCalledOnce();
  });
});
