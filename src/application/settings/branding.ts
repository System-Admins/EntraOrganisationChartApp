/** `onAccent` colours nothing any more; the key stays valid so older config files still load. */
export const BRAND_COLOR_KEYS = [
  'accent',
  'onAccent',
  'headerBackground',
  'headerText',
  'background',
  'surface',
  'text',
  'mutedText',
  'border',
  'connector',
] as const;

export type BrandColorKey = (typeof BRAND_COLOR_KEYS)[number];

export type BrandColors = Readonly<Partial<Record<BrandColorKey, string>>>;

/** The colours an embedding page may give the chart (?background= ?accent=), in the order they are tried. */
export const PAGE_COLOR_KEYS = ['background', 'accent'] as const satisfies readonly BrandColorKey[];

export type PageColors = Readonly<Partial<Record<(typeof PAGE_COLOR_KEYS)[number], string>>>;

export interface Branding {
  /** Header text and document title; null names the chart in the viewer's language, and an empty string shows the logo alone. */
  readonly title: string | null;
  readonly logoUrl: string | null;
  /** Falls back to logoUrl. */
  readonly logoUrlDark: string | null;
  /** The logo's text alternative when there is no title, normally the organization's name. */
  readonly logoAlt: string | null;
  readonly faviconUrl: string | null;
  readonly fontFamily: string | null;
  readonly colors: BrandColors;
  /** Dark theme overrides. The high-contrast theme ignores branding colors on purpose. */
  readonly darkColors: BrandColors;
}
