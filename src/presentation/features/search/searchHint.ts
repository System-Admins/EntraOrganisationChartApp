import { formatList } from '@/application/common/intl';
import type { ExtraField } from '@/application/settings/extraFields';
import type { Language } from '@/application/settings/language';
import { SEARCH_HINT_STRINGS } from './strings';

/** The search field's description for assistive technology: the field itself only says "Search". The organization's own fields come last, by their labels. */
export function searchHint(language: Language, extraFields: readonly ExtraField[] = []): string {
  const { name, fields, hint } = SEARCH_HINT_STRINGS[language];
  const labels = extraFields.filter((field) => field.search).map(({ label }) => label);
  return hint(formatList(language, [name, ...new Set([...Object.values(fields), ...labels])], 'disjunction'));
}
