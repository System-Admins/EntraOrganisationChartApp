import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Catalog, Language } from '@/application/settings/language';

/** English where no provider says otherwise, which is how components render in tests that set no language. */
const LanguageContext = createContext<Language>('en');

export function LanguageProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <LanguageContext value={language}>{children}</LanguageContext>;
}

export function useLanguage(): Language {
  return useContext(LanguageContext);
}

/** The catalogue's texts in the language of the page around the component. */
export function useStrings<T>(catalog: Catalog<T>): T {
  return catalog[useLanguage()];
}

/** The language as it is when read: for words found after an await, or in an effect that a change of language must not rerun. */
export function useLanguageRef(): { readonly current: Language } {
  const language = useLanguage();
  const ref = useRef(language);
  useLayoutEffect(() => {
    ref.current = language;
  }, [language]);
  return ref;
}
