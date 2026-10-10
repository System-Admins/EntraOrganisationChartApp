import { errorDetail } from '../shared/errors';
import { useStrings } from '../shared/languageContext';
import { Panel } from '../shared/Panel';
import { SupportLink } from '../shared/SupportLink';
import { APP_STRINGS } from './strings';

/** Shown when config.json or the host could not be initialized; usually a deployment problem. */
export function StartupError({ error }: { error: unknown }) {
  const { title, text } = useStrings(APP_STRINGS).startupError;
  return (
    <main style={{ display: 'flex', minHeight: '100%' }}>
      <Panel title={title} headingLevel={1} tone="error" detail={errorDetail(error)}>
        <p>
          {text}
          <SupportLink />
        </p>
      </Panel>
    </main>
  );
}
