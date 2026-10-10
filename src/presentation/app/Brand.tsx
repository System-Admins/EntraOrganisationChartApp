import type { Branding } from '@/application/settings/branding';
import { useStrings } from '../shared/languageContext';
import { THEME_STRINGS } from '../theme/strings';
import styles from './Brand.module.css';
import { APP_STRINGS } from './strings';

interface BrandProps {
  readonly branding: Branding;
  /** Restarts the chart in place instead of linking to "/": an embedding's address carries its setup. */
  readonly onHome?: () => void;
  /** Just before the link to "/" leaves the page; not for a click that opens it in a new tab or window, as the page stays. */
  readonly onLeave?: () => void;
}

/** Logo and title from config.json. With a dark logo configured, CSS shows the one matching the theme. */
export function Brand({ branding, onHome, onLeave }: BrandProps) {
  const { home } = useStrings(APP_STRINGS);
  const { defaultTitle } = useStrings(THEME_STRINGS);
  const { logoUrl, logoUrlDark } = branding;
  const title = branding.title ?? defaultTitle;
  if (!logoUrl && !logoUrlDark && !title) return <div />;
  // Beside a title the logo is decorative; alone, it names the chart.
  const logoAlt = title ? '' : (branding.logoAlt ?? defaultTitle);
  const content = (
    <>
      {logoUrl && (
        <img className={logoUrlDark ? styles.lightOnly : styles.logo} src={logoUrl} alt={logoAlt} />
      )}
      {logoUrlDark && <img className={styles.darkOnly} src={logoUrlDark} alt={logoAlt} />}
      {title && <span className={styles.title}>{title}</span>}
    </>
  );
  // The heading wraps the control: a button may not contain a heading.
  return (
    <h1 className={styles.brand}>
      {onHome ? (
        <button type="button" className={styles.home} title={home} onClick={onHome}>
          {content}
        </button>
      ) : (
        <a
          className={styles.home}
          href="/"
          title={home}
          onClick={(event) => {
            if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) onLeave?.();
          }}
        >
          {content}
        </a>
      )}
    </h1>
  );
}
