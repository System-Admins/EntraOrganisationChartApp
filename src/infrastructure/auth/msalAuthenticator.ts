import {
  ApiId,
  AuthError,
  BrowserAuthError,
  createNestablePublicClientApplication,
  InteractionRequiredAuthError,
  NavigationClient,
  PromptValue,
  type AccountInfo,
  type IPublicClientApplication,
  type NavigationOptions,
} from '@azure/msal-browser';
import { SignInFailedError, SignInRequiredError, type SignInFailure } from '@/application/abstractions/authenticator';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { AuthConfig } from '../config/appConfig';
import type { HostEnvironment } from '../host/hostEnvironment';
import { ACCOUNT_BLOCKED, entraErrorNumber } from './entraErrors';
import type { GraphAuthenticator } from './graphAuthenticator';

/** Delegated; needs admin consent. Covers phones, manager, account state and licenses of all users. */
const GRAPH_SCOPES = ['https://graph.microsoft.com/User.Read.All'];
/** Delegated; asked for separately, so a tenant that hasn't granted it only loses the presence dots. */
const PRESENCE_SCOPES = ['https://graph.microsoft.com/Presence.Read.All'];
/** Delegated, for getSchedule; separate too, so a tenant that hasn't granted it only loses the local time and working hours. */
const CALENDAR_SCOPES = ['https://graph.microsoft.com/Calendars.ReadBasic'];
/** Set once a silent redirect has been tried, so neither a failed one nor a sign-out starts another. */
const SILENT_REDIRECT_TRIED = 'orgapp.silentRedirectTried';
/** Set while a sign-in the user started is away at Microsoft; only then is a returning failure shown. */
const SIGN_IN_STARTED = 'orgapp.signInStarted';
/** Tells the chart's other tabs about a sign-out, so they don't keep showing the directory. */
const SIGN_OUT_CHANNEL = 'orgapp.signOut';

/** Replaces this page in the history, so Back can't restore the chart from the back/forward cache. */
class SignOutReplacesPage extends NavigationClient {
  override navigateExternal(url: string, options: NavigationOptions): Promise<boolean> {
    return super.navigateExternal(url, options.apiId === ApiId.logout ? { ...options, noHistory: true } : options);
  }
}

/** Teams hosts use nested app authentication, other iframes a popup through the relay page, standalone a redirect. */
export async function createMsalAuthenticator(auth: AuthConfig, host: HostEnvironment): Promise<GraphAuthenticator> {
  const embedded = host.kind !== 'standalone';
  const redirectUri = new URL('/redirect.html', window.location.origin).href;
  const client = await createNestablePublicClientApplication({
    auth: {
      clientId: auth.clientId,
      authority: `https://login.microsoftonline.com/${auth.tenantId}`,
      redirectUri,
      ...(embedded ? { popupRelayUri: '/popup-relay.html' } : {}),
    },
    cache: { cacheLocation: 'localStorage' },
    system: { navigationClient: new SignOutReplacesPage() },
  });

  const signOuts = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SIGN_OUT_CHANNEL);
  if (signOuts) {
    signOuts.onmessage = () => {
      window.location.reload();
    };
  }

  let returnedSignInError: Error | null = null;
  if (!embedded) {
    const startedByUser = takeSignInStarted();
    try {
      const result = await client.handleRedirectPromise();
      if (result) client.setActiveAccount(result.account);
    } catch (error) {
      // Declined consent and other sign-in failures come back on the redirect; start anyway so the user can retry.
      console.warn('Sign-in did not complete.', error);
      if (startedByUser) returnedSignInError = toSignInError(error);
    }
  }

  const loginHint = host.loginHint ? { loginHint: host.loginHint } : {};

  // ssoSilent needs a third-party cookie that Firefox and Safari block, so fall back once to a prompt=none redirect.
  let firstRequest = !embedded && !returnedSignInError;
  let redirectMarkCleared = false;
  const acquire = async (scopes: string[]): Promise<string> => {
    const mayRedirect = firstRequest;
    firstRequest = false;
    try {
      const token = await acquireSilently(client, loginHint, scopes);
      // Signed in: a later page load in this tab may use the silent redirect again.
      if (!redirectMarkCleared) redirectMarkCleared = unmarkSilentRedirect();
      return token;
    } catch (error) {
      if (!(error instanceof SignInRequiredError) || !mayRedirect || !markSilentRedirect()) throw error;
      const account = currentAccount(client);
      try {
        await client.loginRedirect({
          scopes: GRAPH_SCOPES,
          prompt: PromptValue.NONE,
          ...(account ? { loginHint: account.username } : loginHint),
        });
      } catch (redirectError) {
        console.warn('Could not start a silent sign-in.', redirectError);
        throw error;
      }
      // On its way to Microsoft: nothing waiting for the token should run before the page comes back.
      return new Promise<string>(() => undefined);
    }
  };

  /** A permission of its own, asked for from a click: in a popup where the page is embedded (Teams shows its own), else by a redirect. */
  const consentTo = async (scopes: string[]): Promise<void> => {
    const account = currentAccount(client);
    const request = { scopes, ...(account ? { account } : loginHint) };
    try {
      if (embedded) await client.acquireTokenPopup({ ...request, overrideInteractionInProgress: true });
      else await client.acquireTokenRedirect(request);
    } catch (error) {
      throw toSignInError(error);
    }
  };

  return {
    getAccessToken: () => acquire(GRAPH_SCOPES),
    getPresenceToken: () => acquire(PRESENCE_SCOPES),
    getCalendarToken: () => acquire(CALENDAR_SCOPES),
    signIn: async () => {
      const request = { scopes: GRAPH_SCOPES, ...loginHint };
      try {
        // A reload during a popup leaves MSAL's in-progress flag set for the tab, so it is overridden.
        if (embedded) {
          client.setActiveAccount((await client.loginPopup({ ...request, overrideInteractionInProgress: true })).account);
        } else {
          markSignInStarted();
          await client.loginRedirect(request);
        }
      } catch (error) {
        // The page never left, so the failure is reported here, not after a return.
        takeSignInStarted();
        throw toSignInError(error);
      }
    },
    returnedSignInError,
    getSignedInUser: () => {
      const account = currentAccount(client);
      if (!account) return null;
      return {
        // The account's object id in its own tenant, which is the user's id in Microsoft Graph.
        id: account.localAccountId,
        displayName: account.name ?? account.username,
        userPrincipalName: account.username,
        isGuest: isGuestAccount(account),
      };
    },
    signOut: async () => {
      markSilentRedirect();
      const account = currentAccount(client);
      const request = account ? { account } : {};
      signOuts?.postMessage('signed-out');
      // Embedded hosts own the Microsoft sign-in (the UI offers no sign-out there), so only this app's cache goes.
      if (embedded) {
        await client.clearCache(request);
        return;
      }
      // In case the page is still restored from the back/forward cache (a browser that ignores the replace).
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) window.location.reload();
      });
      // Entra ID only returns to a registered redirect URI; the redirect bridge forwards from there to the app.
      await client.logoutRedirect({ ...request, postLogoutRedirectUri: redirectUri });
    },
    forgetSignIn: async () => {
      try {
        // Without an account, every account's tokens go: on a shared computer several people may have signed in.
        await client.clearCache();
      } catch (error) {
        if (!(error instanceof AuthError && error.errorCode === 'unsupported_method')) throw error;
        // Nested app authentication (Teams) refuses to clear, yet caches what Teams hands it, which Teams hands back on the reload.
        removeMsalEntries(auth.clientId);
      } finally {
        // The other tabs reload as after a sign-out, so that none of them writes the directory back.
        signOuts?.postMessage('signed-out');
      }
    },
    consentToPresence: () => consentTo(PRESENCE_SCOPES),
    consentToCalendar: () => consentTo(CALENDAR_SCOPES),
  };
}

/** Entra ID codes for a redirect URI the app registration lacks: the site's own, the broker's brk-multihub one that Teams needs, or one registered as Web rather than SPA. */
const REDIRECT_NOT_REGISTERED: ReadonlySet<string> = new Set(['50011', '700046', '9002326']);

/** MSAL's and Entra ID's error codes as the failures the UI can explain; the code itself stays in the message. */
function toSignInError(error: unknown): Error {
  if (!(error instanceof AuthError)) return error instanceof Error ? error : new Error(String(error));
  const entraNumber = entraErrorNumber(error.errorMessage);
  const detail = `Microsoft sign-in error ${error.errorCode}${entraNumber ? ` (AADSTS${entraNumber})` : ''}.`;
  const failed = (reason: SignInFailure) => new SignInFailedError(reason, detail, { cause: error });
  if (entraNumber && ACCOUNT_BLOCKED.has(entraNumber)) return failed('blocked');
  if (entraNumber && REDIRECT_NOT_REGISTERED.has(entraNumber)) return failed('redirectUri');
  switch (error.errorCode) {
    case 'popup_window_error':
    case 'empty_window_error':
      return failed('popupBlocked');
    // BrowserAuthError spells it with two l's; nested app authentication (Teams, Outlook) with one.
    case 'user_cancelled':
    case 'user_canceled':
      return failed('cancelled');
    case 'access_denied':
      return failed('declined');
    case 'no_network_connectivity':
    case 'network_error':
    case 'post_request_failed':
    case 'get_request_failed':
      return new ServiceError('offline', detail, { cause: error });
    case 'server_error':
    case 'temporarily_unavailable':
      return new ServiceError('busy', detail, { cause: error });
    default:
      return failed('other');
  }
}

/** The account of the last sign-in, or the one an earlier visit left in the cache. */
function currentAccount(client: IPublicClientApplication): AccountInfo | undefined {
  return client.getActiveAccount() ?? client.getAllAccounts()[0];
}

/** A guest signed in to this tenant from another: the home account id ends with the home tenant's id, as MSAL's own check reads it. */
function isGuestAccount(account: AccountInfo): boolean {
  const homeTenantId = account.homeAccountId.split('.')[1];
  return homeTenantId !== undefined && account.tenantId !== '' && homeTenantId !== account.tenantId;
}

async function acquireSilently(
  client: IPublicClientApplication,
  loginHint: { loginHint?: string },
  scopes: string[],
): Promise<string> {
  const account = currentAccount(client);
  try {
    if (account) {
      return (await client.acquireTokenSilent({ scopes, account })).accessToken;
    }
    // Reuses the Microsoft 365 session the user already has (e.g. from SharePoint) when third-party cookies allow it.
    const result = await client.ssoSilent({ scopes, ...loginHint });
    client.setActiveAccount(result.account);
    return result.accessToken;
  } catch (error) {
    const silentSsoFailed = !account && error instanceof BrowserAuthError;
    if (error instanceof InteractionRequiredAuthError || silentSsoFailed) throw new SignInRequiredError();
    throw toSignInError(error);
  }
}

/** What MSAL's own cache clear removes: every key in its stores that holds "msal" or the app's client ID. */
function removeMsalEntries(clientId: string): void {
  for (const area of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[area];
      // Collected first, as removing a key renumbers the keys after it.
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index) ?? '');
      for (const key of keys) if (key.includes('msal') || key.includes(clientId)) storage.removeItem(key);
    } catch {
      // A store the browser blocks holds nothing either.
    }
  }
}

/** False when it was already set, or storage is unavailable: without the mark a silent redirect could loop. */
function markSilentRedirect(): boolean {
  try {
    if (sessionStorage.getItem(SILENT_REDIRECT_TRIED)) return false;
    sessionStorage.setItem(SILENT_REDIRECT_TRIED, '1');
    return true;
  } catch {
    return false;
  }
}

function unmarkSilentRedirect(): boolean {
  try {
    sessionStorage.removeItem(SILENT_REDIRECT_TRIED);
    return true;
  } catch {
    return false;
  }
}

function markSignInStarted(): void {
  try {
    sessionStorage.setItem(SIGN_IN_STARTED, '1');
  } catch {
    // Without storage, a failure that comes back is only logged.
  }
}

function takeSignInStarted(): boolean {
  try {
    const started = sessionStorage.getItem(SIGN_IN_STARTED) !== null;
    sessionStorage.removeItem(SIGN_IN_STARTED);
    return started;
  } catch {
    return false;
  }
}
