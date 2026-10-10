import { useCallback, useState } from 'react';
import { SignInCommand } from '@/application/features/authentication/signIn';
import { describeError, errorDetail } from '../../shared/errors';
import { useLanguage } from '../../shared/languageContext';
import { useMediator } from '../../shared/mediatorContext';

export interface SignInState {
  /** Call from a click handler; embedded hosts block popups not opened by a user gesture. */
  readonly signIn: () => void;
  readonly busy: boolean;
  /** In everyday words (describeError); what actually happened is in `errorDetail`. */
  readonly error: string | null;
  readonly errorDetail: string | null;
  /** The failure behind `error`, the same object whatever language its words are in; null when none. */
  readonly failure: unknown;
}

/** `earlierFailure`, what a sign-in that left the page came back with, is shown until the first attempt here. */
export function useSignIn(onSignedIn: () => void, earlierFailure?: unknown): SignInState {
  const mediator = useMediator();
  const language = useLanguage();
  const [state, setState] = useState<{ busy: boolean; attempted: boolean; failure: unknown }>({
    busy: false,
    attempted: false,
    failure: null,
  });

  const signIn = useCallback(() => {
    setState({ busy: true, attempted: true, failure: null });
    mediator.send(new SignInCommand()).then(
      () => {
        setState({ busy: false, attempted: true, failure: null });
        onSignedIn();
      },
      (failure: unknown) => {
        setState({ busy: false, attempted: true, failure });
      },
    );
  }, [mediator, onSignedIn]);

  const failure = (state.attempted ? state.failure : earlierFailure) ?? null;
  return {
    signIn,
    busy: state.busy,
    error: failure === null ? null : describeError(failure, language),
    errorDetail: errorDetail(failure),
    failure,
  };
}
