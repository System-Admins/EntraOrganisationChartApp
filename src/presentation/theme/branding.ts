import type { BrandColors, Branding } from '@/application/settings/branding';
import type { Language } from '@/application/settings/language';
import { THEME_STRINGS } from './strings';

/** config.json's title, else the chart's own name in the language: never empty, as a page and a tree need a name. */
export function chartTitle(branding: Branding | null, language: Language): string {
  return branding?.title || THEME_STRINGS[language].defaultTitle;
}

/** Publishes branding as CSS custom properties consumed by global.css; parseAppConfig has validated the colours. */
export function applyBranding(branding: Branding, root: HTMLElement = document.documentElement): void {
  setColors(root, '--brand-', branding.colors);
  setColors(root, '--brand-dark-', branding.darkColors);
  if (branding.fontFamily) root.style.setProperty('--brand-font-family', branding.fontFamily);
  if (branding.faviconUrl) document.querySelector('link[rel="icon"]')?.setAttribute('href', branding.faviconUrl);
}

/** Screen readers read the page in its lang; the title follows the language too, unless config.json gives one. */
export function applyLanguage(language: Language, branding: Branding | null): void {
  document.documentElement.lang = language;
  document.title = chartTitle(branding, language);
}

/** A colour key as global.css spells it: "headerBackground" becomes "header-background". */
export function cssName(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function setColors(root: HTMLElement, prefix: string, colors: BrandColors): void {
  for (const [key, value] of Object.entries(colors)) root.style.setProperty(`${prefix}${cssName(key)}`, value);
}
