import { useId } from 'react';
import { useStrings } from '../../shared/languageContext';
import styles from './LayoutChoice.module.css';
import { PEOPLE_LAYOUTS, type PeopleLayout } from './PeopleList';
import { PEOPLE_LIST_STRINGS } from './strings';

interface LayoutChoiceProps {
  readonly layout: PeopleLayout;
  readonly onChange: (layout: PeopleLayout) => void;
}

/** Whether a list of people shows as rows or as a board of photos, above the list. */
export function LayoutChoice({ layout, onChange }: LayoutChoiceProps) {
  const t = useStrings(PEOPLE_LIST_STRINGS);
  const group = useId();
  return (
    <fieldset className={styles.layouts}>
      <legend className={styles.legend}>{t.layout}</legend>
      {PEOPLE_LAYOUTS.map((option) => (
        <label key={option} className={styles.layout}>
          <input
            type="radio"
            name={group}
            checked={layout === option}
            onChange={() => {
              onChange(option);
            }}
          />
          {t.layouts[option]}
        </label>
      ))}
    </fieldset>
  );
}
