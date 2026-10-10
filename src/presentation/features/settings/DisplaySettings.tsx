import { useId } from 'react';
import { RECENT_VIEW_MS } from '@/application/features/chartView/getSavedView';
import { START_POSITIONS, TEXT_SIZES, THEME_PREFERENCES } from '@/application/settings/appSettings';
import { LANGUAGE_PREFERENCES, LANGUAGES, type Language } from '@/application/settings/language';
import type { UserSettings } from '@/application/settings/userSettings';
import controls from '../../shared/DialogControls.module.css';
import { DialogSection } from '../../shared/DialogSection';
import { useStrings } from '../../shared/languageContext';
import styles from './SettingsDialog.module.css';
import { DISPLAY_STRINGS, LANGUAGE_NAMES } from './strings';

interface DisplaySettingsProps {
  readonly settings: UserSettings;
  readonly onChange: (settings: UserSettings) => void;
  /** Teams sets the theme, which no choice here could change: a note stands in for the choice. */
  readonly themeFromTeams: boolean;
}

/** A list of any length, as LANGUAGES may grow: with a single language there is nothing to choose, so no choice shows. */
const SPOKEN_LANGUAGES: readonly Language[] = LANGUAGES;

/** How the chart looks, speaks and opens for the person. A change applies at once, a start choice from the next visit on. */
export function DisplaySettings({ settings, onChange, themeFromTeams }: DisplaySettingsProps) {
  const t = useStrings(DISPLAY_STRINGS);
  const languageGroup = useId();
  const languageHintId = useId();
  const themeGroup = useId();
  const themeHintId = useId();
  const textSizeGroup = useId();
  const textSizeHintId = useId();
  const levelsHintId = useId();
  const startGroup = useId();
  const startHintId = useId();
  return (
    <DialogSection title={t.title}>
      {SPOKEN_LANGUAGES.length > 1 && (
        <>
          <fieldset className={styles.group} aria-describedby={languageHintId}>
            <legend className={styles.legend}>{t.language}</legend>
            {LANGUAGE_PREFERENCES.map((language) => (
              <label key={language} className={styles.option}>
                <input
                  type="radio"
                  name={languageGroup}
                  checked={settings.language === language}
                  onChange={() => {
                    onChange({ ...settings, language });
                  }}
                />
                {/* A language's own name is in that language, which screen readers then pronounce as such. */}
                {language === 'auto' ? t.automatic : <span lang={language}>{LANGUAGE_NAMES[language]}</span>}
              </label>
            ))}
          </fieldset>
          <p id={languageHintId} className={controls.hint}>
            {t.languageHint}
          </p>
        </>
      )}
      {themeFromTeams ? (
        <p className={styles.note}>{t.themeFromTeams}</p>
      ) : (
        <>
          <fieldset className={styles.group} aria-describedby={themeHintId}>
            <legend className={styles.legend}>{t.theme}</legend>
            {THEME_PREFERENCES.map((theme) => (
              <label key={theme} className={styles.option}>
                <input
                  type="radio"
                  name={themeGroup}
                  checked={settings.theme === theme}
                  onChange={() => {
                    onChange({ ...settings, theme });
                  }}
                />
                {theme === 'auto' ? t.automatic : t.themes[theme]}
              </label>
            ))}
          </fieldset>
          <p id={themeHintId} className={controls.hint}>
            {t.themeHint}
          </p>
        </>
      )}
      <fieldset className={styles.group} aria-describedby={textSizeHintId}>
        <legend className={styles.legend}>{t.textSize}</legend>
        {TEXT_SIZES.map((textSize) => (
          <label key={textSize} className={styles.option}>
            <input
              type="radio"
              name={textSizeGroup}
              checked={settings.textSize === textSize}
              onChange={() => {
                onChange({ ...settings, textSize });
              }}
            />
            {t.textSizes[textSize]}
          </label>
        ))}
      </fieldset>
      <p id={textSizeHintId} className={controls.hint}>
        {t.textSizeHint}
      </p>
      <label className={styles.option}>
        <input
          type="checkbox"
          checked={settings.showLevels}
          aria-describedby={levelsHintId}
          onChange={(event) => {
            onChange({ ...settings, showLevels: event.target.checked });
          }}
        />
        {t.showLevels}
      </label>
      <p id={levelsHintId} className={controls.hint}>
        {t.levelsHint}
      </p>
      <fieldset className={styles.group} aria-describedby={startHintId}>
        <legend className={styles.legend}>{t.startAt}</legend>
        {START_POSITIONS.map((position) => (
          <label key={position} className={styles.option}>
            <input
              type="radio"
              name={startGroup}
              checked={settings.startAt === position}
              onChange={() => {
                onChange({ ...settings, startAt: position });
              }}
            />
            {t.startPositions[position]}
          </label>
        ))}
      </fieldset>
      <p id={startHintId} className={controls.hint}>
        {t.startHint(RECENT_VIEW_MS / 60_000)}
      </p>
    </DialogSection>
  );
}
