import type { ContactDestination } from '@/application/abstractions/contactLauncher';
import type { Language } from '@/application/settings/language';
import { DESTINATION_STRINGS } from './strings';

/** The advance notice a contact button gives about the app, tab or window it opens (WCAG 3.2.5). */
export function describeDestination(destination: ContactDestination, language: Language): string {
  return DESTINATION_STRINGS[language][destination];
}
