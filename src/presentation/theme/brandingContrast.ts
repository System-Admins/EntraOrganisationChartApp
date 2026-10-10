import type { ThemeName } from '@/application/settings/appSettings';
import { BRAND_COLOR_KEYS, type BrandColorKey } from '@/application/settings/branding';
import { cssName } from './branding';
import { contrastRatio, parseColor, toHex, type Rgb } from './contrast';

/** --accent-text is derived from the accent in global.css, so it has no branding key of its own. */
const THEME_COLOR_NAMES = [...BRAND_COLOR_KEYS, 'accentText'] as const;

type ThemeColorName = (typeof THEME_COLOR_NAMES)[number];

/** The colours a theme resolves to on screen; one the browser could not resolve is missing. */
export type ThemeColors = Readonly<Partial<Record<ThemeColorName, Rgb>>>;

interface ContrastRule {
  readonly color: ThemeColorName;
  readonly on: readonly BrandColorKey[];
  /** WCAG 2.2 AA: 4.5:1 for text (1.4.3), 3:1 for what is needed to read the interface (1.4.11). */
  readonly minimum: number;
  readonly use: string;
}

const RULES: readonly ContrastRule[] = [
  { color: 'accent', on: ['surface', 'background'], minimum: 3, use: 'the selection and icons need' },
  { color: 'accentText', on: ['surface'], minimum: 4.5, use: 'links, buttons and the report badge need' },
  { color: 'text', on: ['background', 'surface'], minimum: 4.5, use: 'text needs' },
  { color: 'mutedText', on: ['background', 'surface'], minimum: 4.5, use: 'secondary text needs' },
  { color: 'headerText', on: ['headerBackground'], minimum: 4.5, use: 'the title and toolbar need' },
  { color: 'connector', on: ['background'], minimum: 3, use: 'the reporting lines need' },
];

export interface ContrastProblem {
  readonly color: ThemeColorName;
  readonly on: BrandColorKey;
  readonly foreground: Rgb;
  readonly background: Rgb;
  readonly ratio: number;
  readonly minimum: number;
  readonly use: string;
}

export function findContrastProblems(colors: ThemeColors): ContrastProblem[] {
  const problems: ContrastProblem[] = [];
  for (const { color, on, minimum, use } of RULES) {
    const foreground = colors[color];
    if (!foreground) continue;
    for (const key of on) {
      const background = colors[key];
      if (!background) continue;
      const ratio = contrastRatio(foreground, background);
      if (ratio < minimum) problems.push({ color, on: key, foreground, background, ratio, minimum, use });
    }
  }
  return problems;
}

type BrandedTheme = Exclude<ThemeName, 'contrast'>;

const CONFIG_SECTIONS: Readonly<Record<BrandedTheme, string>> = { light: 'branding.colors', dark: 'branding.darkColors' };

/** Names the config.json keys to change and the theme, with the colours as the browser resolved them. */
export function describeContrastProblem(problem: ContrastProblem, theme: BrandedTheme): string {
  const section = CONFIG_SECTIONS[theme];
  const foreground = toHex(problem.foreground);
  const subject =
    problem.color === 'accentText'
      ? `text in the accent colour (${foreground}, derived from ${section}.accent)`
      : `${section}.${problem.color} (${foreground})`;
  // Floored: "3.0:1" must not describe a ratio that fails 3:1.
  const ratio = (Math.floor(problem.ratio * 10) / 10).toFixed(1);
  return (
    `Low contrast in the ${theme} theme: ${subject} is ${ratio}:1 on ${section}.${problem.on} (${toHex(problem.background)}); ` +
    `${problem.use} at least ${String(problem.minimum)}:1. Adjust these colours in config.json.`
  );
}

/** Read back from the browser, so global.css stays the only place that knows the defaults. */
export function readThemeColors(): ThemeColors {
  const declared = getComputedStyle(document.documentElement);
  const probe = document.createElement('span');
  const colors: Partial<Record<ThemeColorName, Rgb>> = {};
  document.body.append(probe);
  try {
    for (const name of THEME_COLOR_NAMES) {
      const variable = `--${cssName(name)}`;
      // Without a value the probe would report the colour it inherits.
      if (!declared.getPropertyValue(variable).trim()) continue;
      probe.style.color = '';
      // Mixing in sRGB makes the browser convert any notation (a name, hsl(), oklch()) to the one parseColor reads.
      probe.style.color = `color-mix(in srgb, var(${variable}) 100%, transparent)`;
      // A browser without color-mix() drops the declaration, which leaves the inherited colour again.
      if (!probe.style.color) continue;
      const color = parseColor(getComputedStyle(probe).color);
      if (color) colors[name] = color;
    }
  } finally {
    probe.remove();
  }
  return colors;
}

const reported = new Set<string>();

/** Warns in the console, once per problem, about branding colours with too little contrast. */
export function warnAboutBrandingContrast(theme: ThemeName, read: () => ThemeColors = readThemeColors): void {
  // The high-contrast theme ignores branding colours.
  if (theme === 'contrast') return;
  for (const problem of findContrastProblems(read())) {
    const message = describeContrastProblem(problem, theme);
    if (reported.has(message)) continue;
    reported.add(message);
    console.warn(message);
  }
}
