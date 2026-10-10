/** The account the app reads the directory with. */
export interface SignedInUser {
  /** The account's directory id: the id of the person's Employee, when the directory has one. */
  readonly id: string;
  readonly displayName: string;
  readonly userPrincipalName: string;
  /** A guest (B2B) account, whose home is another organization: a directory can be closed to guests whatever the consent. */
  readonly isGuest: boolean;
}

export interface SignedInUserSource {
  /** Null until a sign-in has completed; known by the time the directory has been read. */
  getSignedInUser(): SignedInUser | null;
}
