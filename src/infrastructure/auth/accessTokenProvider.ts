/** Rejects with SignInRequiredError when only an interactive sign-in can produce a token. */
export type AccessTokenProvider = () => Promise<string>;
