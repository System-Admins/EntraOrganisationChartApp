/** Thrown when an access token cannot be obtained without user interaction. */
export class SignInRequiredError extends Error {
  constructor() {
    super('Sign-in required.');
    this.name = 'SignInRequiredError';
  }
}

/** 'declined': a permission Microsoft asked for was not given. 'blocked': the account may not use the app. 'redirectUri': the app registration lacks this site's redirect URI. */
export const SIGN_IN_FAILURES = ['cancelled', 'popupBlocked', 'declined', 'blocked', 'redirectUri', 'other'] as const;

export type SignInFailure = (typeof SIGN_IN_FAILURES)[number];

/** The UI explains `reason`; `message` carries Microsoft's error code for the console. */
export class SignInFailedError extends Error {
  constructor(
    readonly reason: SignInFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SignInFailedError';
  }
}

export interface Authenticator {
  /** Call from a click handler: embedded hosts block popups. Standalone the page leaves for Microsoft instead. */
  signIn(): Promise<void>;
  /** Why the sign-in that led back to this page failed; null otherwise, also after a silent attempt. */
  readonly returnedSignInError: Error | null;
  /** Call from a click handler, like signIn. */
  consentToPresence(): Promise<void>;
  /** For the local time and working hours; call from a click handler, like signIn. */
  consentToCalendar(): Promise<void>;
  /** Also ends the Microsoft sign-in, so a silent sign-in can't restore the session. The page may navigate away. */
  signOut(): Promise<void>;
  /** Deletes the chart's own sign-in in this browser, every account's, and stays on the page: the host owns the Microsoft one. */
  forgetSignIn(): Promise<void>;
}
