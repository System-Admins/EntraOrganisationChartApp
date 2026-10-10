import { formatNumber, plural } from '@/application/common/intl';
import type { Language } from '@/application/settings/language';
import { SHARED_STRINGS } from './strings';

/** "1 person", "1,234 people": the count and its word in the language. */
export function formatPeople(count: number, language: Language): string {
  return `${formatNumber(language, count)} ${plural(language, count, SHARED_STRINGS[language].people)}`;
}
