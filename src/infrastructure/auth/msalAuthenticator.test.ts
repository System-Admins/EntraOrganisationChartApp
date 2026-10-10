// @vitest-environment jsdom
import type * as Msal from '@azure/msal-browser';
import {
  AuthError,
  BrowserAuthError,
  createNestablePublicClientApplication,
  InteractionRequiredAuthError,
  ServerError,
  type IPublicClientApplication,
} from '@azure/msal-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInFailedError, SignInRequiredError } from '@/application/abstractions/authenticator';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { HostKind } from '@/application/settings/hostKind';
import { plainHost } from '../host/hostEnvironment';
import { createMsalAuthenticator } from './msalAuthenticator';

vi.mock('@azure/msal-browser', async (importOriginal) => ({
  ...(await importOriginal<typeof Msal>()),
  createNestablePublicClientApplication: vi.fn(),
}));

const AUTH = { tenantId: '11111111-2222-3333-4444-555555555555', clientId: '66666666-7777-8888-9999-000000000000' };
const host = (kind: HostKind) => plainHost(kind, ['en-US']);
const account = { username: 'anna@contoso.com' };
const pending = <T,>(promise: Promise<T>) => Promise.race([promise.then(() => 'settled'), new Promise((resolve) => setTimeout(resolve, 20, 'pending'))]);

/** A client whose hidden-iframe sign-in fails, as it does in Firefox and Safari. */
function fakeClient(overrides: Record<string, unknown> = {}) {
  const client = {
    handleRedirectPromise: vi.fn(() => Promise.resolve(null)),
    getActiveAccount: vi.fn(() => null),
    getAllAccounts: vi.fn(() => []),
    setActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn(() => Promise.resolve({ accessToken: 'token' })),
    ssoSilent: vi.fn(() => Promise.reject(new BrowserAuthError('login_required', 'correlation'))),
    loginRedirect: vi.fn(() => Promise.resolve()),
    loginPopup: vi.fn(() => Promise.resolve({ account })),
    acquireTokenPopup: vi.fn(() => Promise.resolve({ accessToken: 'token' })),
    acquireTokenRedirect: vi.fn(() => Promise.resolve()),
    logoutRedirect: vi.fn(() => Promise.resolve()),
    clearCache: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  vi.mocked(createNestablePublicClientApplication).mockResolvedValue(client as unknown as IPublicClientApplication);
  return client;
}

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('createMsalAuthenticator', () => {
  it('signs in with a silent redirect when the hidden frame fails, once per tab', async () => {
    const client = fakeClient();
    const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));

    expect(await pending(authenticator.getAccessToken())).toBe('pending');
    expect(client.loginRedirect).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'none' }));

    // The page comes back without a session: the Sign in button, not another redirect.
    const again = await createMsalAuthenticator(AUTH, host('standalone'));
    await expect(again.getAccessToken()).rejects.toBeInstanceOf(SignInRequiredError);
    expect(client.loginRedirect).toHaveBeenCalledTimes(1);
  });

  it('lets a later page load try again once a token has arrived', async () => {
    sessionStorage.setItem('orgapp.silentRedirectTried', '1');
    fakeClient({ getAllAccounts: vi.fn(() => [account]) });
    const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));

    await expect(authenticator.getAccessToken()).resolves.toBe('token');

    expect(sessionStorage.getItem('orgapp.silentRedirectTried')).toBeNull();
  });

  it('never redirects inside an embedding page, or after the first request of a page', async () => {
    const client = fakeClient();
    const embedded = await createMsalAuthenticator(AUTH, host('embedded'));
    await expect(embedded.getAccessToken()).rejects.toBeInstanceOf(SignInRequiredError);

    client.getAllAccounts.mockReturnValue([account] as never);
    const standalone = await createMsalAuthenticator(AUTH, host('standalone'));
    await standalone.getAccessToken();
    client.acquireTokenSilent.mockRejectedValue(new BrowserAuthError('interaction_required', 'correlation'));
    client.getAllAccounts.mockReturnValue([]);
    await expect(standalone.getPresenceToken()).rejects.toBeInstanceOf(SignInRequiredError);

    expect(client.loginRedirect).not.toHaveBeenCalled();
  });

  it('keeps the next page load from signing straight back in after signing out', async () => {
    const client = fakeClient();
    const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));

    await authenticator.signOut();
    const after = await createMsalAuthenticator(AUTH, host('standalone'));

    await expect(after.getAccessToken()).rejects.toBeInstanceOf(SignInRequiredError);
    expect(client.logoutRedirect).toHaveBeenCalled();
    expect(client.loginRedirect).not.toHaveBeenCalled();
  });

  describe('forgetting the sign-in', () => {
    /** Held back: every authenticator this file creates listens, and would reload a page that jsdom can't reload. */
    const holdBroadcasts = () => vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation(() => undefined);

    it('deletes every account\'s sign-in in this browser without leaving the page, and has the other tabs reload', async () => {
      const told = holdBroadcasts();
      const client = fakeClient();
      const authenticator = await createMsalAuthenticator(AUTH, host('embedded'));

      await authenticator.forgetSignIn();

      expect(client.clearCache).toHaveBeenCalledExactlyOnceWith();
      expect(client.logoutRedirect).not.toHaveBeenCalled();
      expect(told).toHaveBeenCalledWith('signed-out');
    });

    it('deletes in Teams, whose nested app authentication refuses to clear, what MSAL keeps of the sign-in Teams handed it', async () => {
      holdBroadcasts();
      fakeClient({ clearCache: vi.fn(() => Promise.reject(new AuthError('unsupported_method', 'correlation'))) });
      const authenticator = await createMsalAuthenticator(AUTH, host('teams'));
      const annasAccount = `msal.2|anna-home-id|login.windows.net|account|${AUTH.tenantId}`;
      for (const key of ['msal.account.keys', annasAccount, `${AUTH.clientId}.active-account`, 'orgapp.userSettings']) {
        localStorage.setItem(key, '{}');
      }
      sessionStorage.setItem(`msal.${AUTH.clientId}.request.state`, '{}');

      await expect(authenticator.forgetSignIn()).resolves.toBeUndefined();

      expect(Object.keys(localStorage)).toEqual(['orgapp.userSettings']);
      expect(Object.keys(sessionStorage)).toEqual([]);
    });

    it('reports any other failure, after telling the other tabs all the same', async () => {
      const told = holdBroadcasts();
      const failure = new BrowserAuthError('storage_not_supported', 'correlation');
      fakeClient({ clearCache: vi.fn(() => Promise.reject(failure)) });
      const authenticator = await createMsalAuthenticator(AUTH, host('embedded'));

      await expect(authenticator.forgetSignIn()).rejects.toBe(failure);
      expect(told).toHaveBeenCalledWith('signed-out');
    });
  });

  describe('reading calendars', () => {
    const CALENDARS = ['https://graph.microsoft.com/Calendars.ReadBasic'];

    it('asks for the calendar token on its own, as presence\'s, so that a tenant without the permission loses only that', async () => {
      const client = fakeClient({ getAllAccounts: vi.fn(() => [account]) });
      const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));

      await expect(authenticator.getCalendarToken()).resolves.toBe('token');

      expect(client.acquireTokenSilent).toHaveBeenCalledExactlyOnceWith({ scopes: CALENDARS, account });
    });

    it('asks for consent in a popup in Teams and other pages, which Teams shows itself, and by a redirect on the chart\'s own site', async () => {
      const client = fakeClient({ getAllAccounts: vi.fn(() => [account]) });
      for (const kind of ['teams', 'embedded'] as const) await (await createMsalAuthenticator(AUTH, host(kind))).consentToCalendar();
      await (await createMsalAuthenticator(AUTH, host('standalone'))).consentToCalendar();

      expect(client.acquireTokenPopup.mock.calls).toEqual([
        [{ scopes: CALENDARS, account, overrideInteractionInProgress: true }],
        [{ scopes: CALENDARS, account, overrideInteractionInProgress: true }],
      ]);
      expect(client.acquireTokenRedirect).toHaveBeenCalledExactlyOnceWith({ scopes: CALENDARS, account });
    });

    it.each([
      ['user_cancelled', SignInFailedError, { reason: 'cancelled' }],
      ['popup_window_error', SignInFailedError, { reason: 'popupBlocked' }],
      ['access_denied', SignInFailedError, { reason: 'declined' }],
      ['no_network_connectivity', ServiceError, { failure: 'offline' }],
    ])('turns %s while asking for consent into a failure the row can word', async (code, type, expected) => {
      fakeClient({ acquireTokenPopup: vi.fn(() => Promise.reject(new BrowserAuthError(code, 'correlation'))) });
      const authenticator = await createMsalAuthenticator(AUTH, host('teams'));

      const failure: unknown = await authenticator.consentToCalendar().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(type);
      expect(failure).toMatchObject(expected);
    });
  });

  it('says who is signed in, under the id the directory has for them', async () => {
    const client = fakeClient();
    const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));
    expect(authenticator.getSignedInUser()).toBeNull();

    client.getActiveAccount.mockReturnValue({
      homeAccountId: `id-anna.${AUTH.tenantId}`,
      tenantId: AUTH.tenantId,
      localAccountId: 'id-anna',
      username: 'anna@contoso.com',
      name: 'Anna Jensen',
    } as never);
    expect(authenticator.getSignedInUser()).toEqual({
      id: 'id-anna',
      displayName: 'Anna Jensen',
      userPrincipalName: 'anna@contoso.com',
      isGuest: false,
    });

    // Accounts without a name claim still get a label.
    client.getActiveAccount.mockReturnValue({
      homeAccountId: `id-ola.${AUTH.tenantId}`,
      tenantId: AUTH.tenantId,
      localAccountId: 'id-ola',
      username: 'ola@contoso.com',
    } as never);
    expect(authenticator.getSignedInUser()?.displayName).toBe('ola@contoso.com');
  });

  it('knows a guest by the home tenant, another than the one the chart signs in to', async () => {
    const client = fakeClient();
    const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));

    // The home account names the guest's own organization; the local account is the guest's id in this directory.
    client.getActiveAccount.mockReturnValue({
      homeAccountId: 'home-id.99999999-8888-7777-6666-555555555555',
      tenantId: AUTH.tenantId,
      localAccountId: 'id-lea',
      username: 'lea@fabrikam.com',
      name: 'Lea Dahl',
    } as never);

    expect(authenticator.getSignedInUser()).toEqual({
      id: 'id-lea',
      displayName: 'Lea Dahl',
      userPrincipalName: 'lea@fabrikam.com',
      isGuest: true,
    });
  });

  describe('sign-in failures', () => {
    const declined = new ServerError('access_denied', 'correlation', 'AADSTS65004: User declined to consent to access the app.');

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('keeps what a sign-in the user started came back with, for the page it returns to', async () => {
      fakeClient();
      const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));
      await authenticator.signIn();

      const client = fakeClient({ handleRedirectPromise: vi.fn(() => Promise.reject(declined)) });
      const back = await createMsalAuthenticator(AUTH, host('standalone'));

      expect(back.returnedSignInError).toBeInstanceOf(SignInFailedError);
      expect(back.returnedSignInError).toMatchObject({
        reason: 'declined',
        message: 'Microsoft sign-in error access_denied (AADSTS65004).',
      });
      // Leaving for a silent sign-in now would lose the failure before the prompt has shown it.
      await expect(back.getAccessToken()).rejects.toBeInstanceOf(SignInRequiredError);
      expect(client.loginRedirect).not.toHaveBeenCalled();

      const reloaded = await createMsalAuthenticator(AUTH, host('standalone'));
      expect(reloaded.returnedSignInError).toBeNull();
    });

    it.each([
      ['nobody is signed in', new InteractionRequiredAuthError('login_required', 'correlation')],
      ['consent is missing', new InteractionRequiredAuthError('consent_required', 'correlation')],
      ['Microsoft has a problem', new ServerError('server_error', 'correlation')],
    ])('reports nothing when the silent redirect comes back because %s', async (_why, failure) => {
      fakeClient();
      const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));
      expect(await pending(authenticator.getAccessToken())).toBe('pending');

      fakeClient({ handleRedirectPromise: vi.fn(() => Promise.reject(failure)) });
      const back = await createMsalAuthenticator(AUTH, host('standalone'));

      expect(back.returnedSignInError).toBeNull();
      await expect(back.getAccessToken()).rejects.toBeInstanceOf(SignInRequiredError);
    });

    it('reports a redirect that never left the page at once, not on a later page', async () => {
      fakeClient({ loginRedirect: vi.fn(() => Promise.reject(new BrowserAuthError('interaction_in_progress', 'correlation'))) });
      const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));
      await expect(authenticator.signIn()).rejects.toMatchObject({ reason: 'other' });

      fakeClient({ handleRedirectPromise: vi.fn(() => Promise.reject(declined)) });
      const later = await createMsalAuthenticator(AUTH, host('standalone'));

      expect(later.returnedSignInError).toBeNull();
    });

    it.each([
      ['user_cancelled', SignInFailedError, { reason: 'cancelled' }],
      ['user_canceled', SignInFailedError, { reason: 'cancelled' }],
      ['popup_window_error', SignInFailedError, { reason: 'popupBlocked' }],
      ['access_denied', SignInFailedError, { reason: 'declined' }],
      ['no_network_connectivity', ServiceError, { failure: 'offline' }],
      ['temporarily_unavailable', ServiceError, { failure: 'busy' }],
      ['state_mismatch', SignInFailedError, { reason: 'other', message: 'Microsoft sign-in error state_mismatch.' }],
    ])('turns %s into a failure the UI can explain', async (code, type, expected) => {
      fakeClient({ loginPopup: vi.fn(() => Promise.reject(new BrowserAuthError(code, 'correlation'))) });
      const authenticator = await createMsalAuthenticator(AUTH, host('embedded'));

      const failure: unknown = await authenticator.signIn().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(type);
      expect(failure).toMatchObject(expected);
    });

    it('tells a blocked account from a declined permission by Entra ID\'s number', async () => {
      const blocked = new ServerError('access_denied', 'correlation', 'AADSTS50105: The signed in user is not assigned to a role.');
      fakeClient({ loginPopup: vi.fn(() => Promise.reject(blocked)) });
      const authenticator = await createMsalAuthenticator(AUTH, host('embedded'));

      await expect(authenticator.signIn()).rejects.toMatchObject({ reason: 'blocked' });
    });

    it.each([
      ['invalid_client', 'AADSTS700046: Invalid Reply Address. Reply address must have the scheme brk-multihub.'],
      ['invalid_request', "AADSTS50011: The redirect URI 'https://orgchart.contoso.com/redirect.html' does not match."],
      ['invalid_request', 'AADSTS9002326: Cross-origin token redemption is permitted only for the Single-Page Application client-type.'],
    ])('tells a missing redirect URI in the app registration, a setup error, from %s by Entra ID\'s number', async (code, description) => {
      fakeClient({ loginPopup: vi.fn(() => Promise.reject(new ServerError(code, 'correlation', description))) });
      const authenticator = await createMsalAuthenticator(AUTH, host('teams'));

      await expect(authenticator.signIn()).rejects.toMatchObject({
        reason: 'redirectUri',
        message: `Microsoft sign-in error ${code} (${description.split(':')[0] ?? ''}).`,
      });
    });

    it('explains a token that cannot be fetched for lack of a connection', async () => {
      fakeClient({
        getAllAccounts: vi.fn(() => [account]),
        acquireTokenSilent: vi.fn(() => Promise.reject(new BrowserAuthError('no_network_connectivity', 'correlation'))),
      });
      const authenticator = await createMsalAuthenticator(AUTH, host('standalone'));

      await expect(authenticator.getAccessToken()).rejects.toMatchObject({ failure: 'offline' });
    });
  });
});
