import { GetReturnedSignInErrorQuery } from '@/application/features/authentication/getReturnedSignInError';
import { pointsToSupport } from '../../shared/errors';
import { useStrings } from '../../shared/languageContext';
import { Panel } from '../../shared/Panel';
import { SupportLink } from '../../shared/SupportLink';
import { useQuery } from '../../shared/useQuery';
import { SIGN_IN_STRINGS } from './strings';
import { useSignIn } from './useSignIn';

/** One instance, so that useQuery sends it once. */
const RETURNED_SIGN_IN_ERROR = new GetReturnedSignInErrorQuery();

export function SignInPrompt({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useStrings(SIGN_IN_STRINGS);
  // A standalone sign-in leaves the page, so its failure is only known once the page is back on this prompt.
  const returnedError = useQuery(RETURNED_SIGN_IN_ERROR).data;
  const { signIn, busy, error, errorDetail, failure } = useSignIn(onSignedIn, returnedError);
  return (
    <Panel title={t.title} detail={errorDetail}>
      <p>{t.text}</p>
      <button type="button" onClick={signIn} disabled={busy}>
        {busy ? t.signingIn : t.signIn}
      </button>
      {error && (
        <p role="alert">
          {error}
          {pointsToSupport(failure) && <SupportLink />}
        </p>
      )}
    </Panel>
  );
}
