import { useMemo } from 'react';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import { GetSignedInUserQuery } from '@/application/features/authentication/getSignedInUser';
import { useQuery } from '../../shared/useQuery';

export interface SignedInUserState {
  /** Null until known, and where nobody is signed in or the account could not be read. */
  readonly user: SignedInUser | null;
  /** Until the account is known, or known to be none: what waits for it, such as starting at one's own card, waits as long. */
  readonly isLoading: boolean;
}

/** Pass false until the directory has been read: the account is only known once a token was issued. */
export function useSignedInUser(directoryRead: boolean): SignedInUserState {
  const query = useMemo(() => (directoryRead ? new GetSignedInUserQuery() : null), [directoryRead]);
  const { data, isLoading } = useQuery(query);
  return { user: data ?? null, isLoading: query === null || isLoading };
}
