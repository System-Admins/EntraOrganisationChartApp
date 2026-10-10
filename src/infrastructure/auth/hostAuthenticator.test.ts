import { describe, expect, it, vi } from 'vitest';
import type { HostSignIn } from '../host/hostEnvironment';
import { createHostAuthenticator } from './hostAuthenticator';

const USER = { id: 'anna', displayName: 'Anna', userPrincipalName: 'anna@contoso.com', isGuest: false };

function host() {
  const graphToken = vi.fn((fresh: boolean) => Promise.resolve(fresh ? 'fresh' : 'cached'));
  const signIn: HostSignIn = { user: USER, graphToken };
  return { authenticator: createHostAuthenticator(signIn), graphToken };
}

describe('createHostAuthenticator', () => {
  it("gives the host's token for every permission, and the host's user", async () => {
    const { authenticator } = host();

    await expect(authenticator.getAccessToken()).resolves.toBe('cached');
    await expect(authenticator.getPresenceToken()).resolves.toBe('cached');
    await expect(authenticator.getCalendarToken()).resolves.toBe('cached');
    expect(authenticator.getSignedInUser()).toBe(USER);
    expect(authenticator.returnedSignInError).toBeNull();
  });

  it('asks the host for a fresh token where a sign-in or a consent is called for', async () => {
    const { authenticator, graphToken } = host();

    await authenticator.signIn();
    await authenticator.consentToPresence();
    await authenticator.consentToCalendar();

    expect(graphToken.mock.calls).toEqual([[true], [true], [true]]);
  });

  it("passes on the host's failure to sign in", async () => {
    const { authenticator, graphToken } = host();
    const failure = new Error('No token.');
    graphToken.mockRejectedValue(failure);

    await expect(authenticator.signIn()).rejects.toBe(failure);
    await expect(authenticator.getAccessToken()).rejects.toBe(failure);
  });

  it("leaves the host's Microsoft sign-in alone on Sign out and Forget this browser's copy", async () => {
    const { authenticator, graphToken } = host();

    await authenticator.signOut();
    await authenticator.forgetSignIn();

    expect(graphToken).not.toHaveBeenCalled();
    expect(authenticator.getSignedInUser()).toBe(USER);
  });
});
