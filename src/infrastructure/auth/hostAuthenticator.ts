import type { HostSignIn } from '../host/hostEnvironment';
import type { GraphAuthenticator } from './graphAuthenticator';

/** The host's sign-in as the chart's: one token serves every permission, and a fresh one is all a sign-in or a consent can ask for. */
export function createHostAuthenticator(host: HostSignIn): GraphAuthenticator {
  const token = () => host.graphToken(false);
  const refresh = async () => {
    await host.graphToken(true);
  };
  return {
    getAccessToken: token,
    getPresenceToken: token,
    getCalendarToken: token,
    signIn: refresh,
    returnedSignInError: null,
    consentToPresence: refresh,
    consentToCalendar: refresh,
    // The host keeps the Microsoft sign-in and the chart none of its own, so there is nothing to end or forget here.
    signOut: () => Promise.resolve(),
    forgetSignIn: () => Promise.resolve(),
    getSignedInUser: () => host.user,
  };
}
