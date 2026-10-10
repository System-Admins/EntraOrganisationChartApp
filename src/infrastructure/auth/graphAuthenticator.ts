import type { Authenticator } from '@/application/abstractions/authenticator';
import type { SignedInUserSource } from '@/application/abstractions/signedInUser';
import type { AccessTokenProvider } from './accessTokenProvider';

/** A sign-in as the Graph sources need it: a token for the directory, and one each for the permissions consented to apart. */
export interface GraphAuthenticator extends Authenticator, SignedInUserSource {
  readonly getAccessToken: AccessTokenProvider;
  readonly getPresenceToken: AccessTokenProvider;
  readonly getCalendarToken: AccessTokenProvider;
}
