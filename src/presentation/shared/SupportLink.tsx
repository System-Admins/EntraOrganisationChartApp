import { useId } from 'react';
import { Icon } from './Icon';
import { useStrings } from './languageContext';
import { SUPPORT_STRINGS } from './strings';
import styles from './SupportLink.module.css';
import { useSupportDesk } from './supportDesk';

/** config.json's support desk at the end of the text that sends people to their IT support, which makes it an inline target. */
export function SupportLink() {
  const desk = useSupportDesk();
  const t = useStrings(SUPPORT_STRINGS);
  const hintId = useId();
  if (!desk) return null;
  // A mail address opens the mail app, which would leave a new tab empty.
  const mail = /^mailto:/i.test(desk.url);
  const label = desk.label ?? t.label;
  // A line may break before an icon, which would stand alone: it keeps to the label's last word.
  const lastWord = label.lastIndexOf(' ') + 1;
  // The space comes with the link, so that text without one doesn't end in a space.
  return (
    <>
      {' '}
      <a
        className={styles.link}
        href={desk.url}
        target={mail ? undefined : '_blank'}
        rel={mail ? undefined : 'noopener noreferrer'}
        aria-describedby={hintId}
      >
        {label.slice(0, lastWord)}
        <span className={styles.lastWord}>
          {label.slice(lastWord)}
          <Icon name={mail ? 'mail' : 'external'} size={14} />
        </span>
      </a>{' '}
      {/* A link that leaves the chart says so before it is pressed, visibly too (WCAG 3.2.5). */}
      <span id={hintId}>{mail ? t.mailApp : t.newTab}</span>
    </>
  );
}
