import { formatList } from '@/application/common/intl';
import type { Language } from '@/application/settings/language';
import { HIDE_CATEGORIES, type HideRules } from '@/domain/orgChart/hideRules';
import { FILTER_CHANGE_STRINGS, FILTER_LABELS } from './strings';

/** How the filters differ from config.json's, in the checkboxes' words; null when they don't. */
export function describeFilterChanges(defaults: HideRules, hide: HideRules, language: Language): string | null {
  const labels = FILTER_LABELS[language];
  const words = FILTER_CHANGE_STRINGS[language];
  const switchedTo = (hidden: boolean) =>
    HIDE_CATEGORIES.filter((category) => hide[category] === hidden && defaults[category] !== hidden).map(
      (category) => labels[category].charAt(0).toLowerCase() + labels[category].slice(1),
    );
  const shown = switchedTo(false);
  const hidden = switchedTo(true);
  const changes = [
    shown.length > 0 ? words.alsoShowing(formatList(language, shown, 'conjunction')) : null,
    hidden.length > 0 ? words.hiding(formatList(language, hidden, 'conjunction')) : null,
  ].filter((change) => change !== null);
  return changes.length > 0 ? words.changed(changes.join('; ')) : null;
}
