import { useId, useState } from 'react';
import type { FilterEffects } from '@/application/features/orgChart/getFilterEffects';
import { HIDE_CATEGORIES, type HideCategory, type HideRules } from '@/domain/orgChart/hideRules';
import controls from '../../shared/DialogControls.module.css';
import { DialogSection } from '../../shared/DialogSection';
import { formatPeople } from '../../shared/formatPeople';
import { useLanguage, useStrings } from '../../shared/languageContext';
import styles from './SettingsDialog.module.css';
import { FILTER_LABELS, FILTER_STRINGS } from './strings';

interface FilterSettingsProps {
  readonly hide: HideRules;
  /** config.json's rules, which Reset goes back to. */
  readonly defaults: HideRules;
  /** Whether the chart names top persons; without them `unattached` does nothing, so it isn't offered. */
  readonly hasTopPersons: boolean;
  /** People in the chart under the current rules; null while no chart is loaded. */
  readonly peopleCount: number | null;
  /** How many people each rule hides, or shows while it is off; missing until they are counted. */
  readonly effects?: FilterEffects;
  readonly onChange: (hide: HideRules) => void;
}

/** One checkbox per hide rule, ticked meaning shown. A change applies at once. */
export function FilterSettings({ hide, defaults, hasTopPersons, peopleCount, effects, onChange }: FilterSettingsProps) {
  const language = useLanguage();
  const labels = useStrings(FILTER_LABELS);
  const t = useStrings(FILTER_STRINGS);
  const hintId = useId();
  const categories = HIDE_CATEGORIES.filter((category) => category !== 'unattached' || hasTopPersons);
  // In the label, which screen readers say with the checkbox, and never in the count's live region below.
  const labelOf = (category: HideCategory) => {
    const count = effects?.[category];
    if (count === undefined) return labels[category];
    return hide[category] ? t.hidden(labels[category], count) : t.shown(labels[category], count);
  };
  const changed = HIDE_CATEGORIES.some((category) => hide[category] !== defaults[category]);
  const count = peopleCount === null ? '' : t.inChart(formatPeople(peopleCount, language));
  // The count is said when it changes; a change of language only empties the region, which screen readers leave unsaid.
  const [countStatus, setCountStatus] = useState({ peopleCount, language, said: false });
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the language can change once LANGUAGES has two
  if (countStatus.peopleCount !== peopleCount || countStatus.language !== language) {
    setCountStatus({ peopleCount, language, said: countStatus.peopleCount !== peopleCount });
  }
  return (
    <DialogSection title={t.title}>
      <fieldset className={styles.group} aria-describedby={effects && hintId}>
        <legend className={styles.legend}>{t.legend}</legend>
        {categories.map((category) => (
          <label key={category} className={styles.option}>
            <input
              type="checkbox"
              checked={!hide[category]}
              onChange={(event) => {
                onChange({ ...hide, [category]: !event.target.checked });
              }}
            />
            {labelOf(category)}
          </label>
        ))}
      </fieldset>
      {effects && (
        <p id={hintId} className={controls.hint}>
          {t.countsHint}
        </p>
      )}
      {/* Left to the region below while that says the same, so that screen readers read the count once. */}
      <p className={styles.count} aria-hidden={countStatus.said || undefined}>
        {count}
      </p>
      {/* In the dialog from the start, so that screen readers say the count each change leads to. */}
      <p className="visually-hidden" role="status">
        {countStatus.said ? count : ''}
      </p>
      <div className={controls.actions}>
        {/* Not `disabled`: pressing the button switches it off, and a disabled button drops the focus it has. */}
        <button
          type="button"
          className={controls.button}
          aria-disabled={!changed}
          onClick={() => {
            if (changed) onChange(defaults);
          }}
        >
          {t.reset}
        </button>
      </div>
    </DialogSection>
  );
}
