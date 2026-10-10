import type { TextSize, ThemeName, ThemePreference } from '@/application/settings/appSettings';
import type { PageColors } from '@/application/settings/branding';
import { warnAboutBrandingContrast } from './brandingContrast';
import { applyPageColors } from './pageColors';

export interface ThemeSource {
  /** Theme dictated by the host application (Teams), which overrides the preference. */
  readonly theme: ThemeName | null;
  onThemeChange(listener: (theme: ThemeName) => void): void;
}

/** What the page looks like for the person: the theme preference (resolveTheme) and the text size, both from Settings > Display. */
export interface ThemeChoice {
  readonly preference: ThemePreference;
  readonly textSize: TextSize;
}

/** Shows another choice at once, as the person makes it in Settings; the host's theme still wins over the preference. */
export type ThemeSetter = (choice: ThemeChoice) => void;

/** Call after applyBranding: every theme shown is checked for branding colours with too little contrast. */
export function syncTheme(
  initial: ThemeChoice,
  source: ThemeSource,
  /** The embedding page's colours (?background= ?accent=), tried anew in each theme shown. */
  pageColors: PageColors = {},
  /** Stops its listening to the window and the system: the page never needs to, its tests do. */
  signal?: AbortSignal,
): ThemeSetter {
  const root = document.documentElement;
  let { preference, textSize } = initial;
  let hostTheme = source.theme;
  let printing = false;
  let darkScheme: MediaQueryList | null = null;
  // Asked only once the preference is 'auto': the system's scheme matters to no other.
  const systemTheme = (): ThemeName => {
    if (!darkScheme) {
      darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
      darkScheme.addEventListener(
        'change',
        () => {
          if (preference === 'auto') update();
        },
        { signal },
      );
    }
    return darkScheme.matches ? 'dark' : 'light';
  };
  const show = () => {
    const theme = hostTheme ?? (preference === 'auto' ? systemTheme() : preference);
    root.dataset.theme = theme;
    root.dataset.textSize = textSize;
    applyPageColors(pageColors, theme);
    warnAboutBrandingContrast(theme);
  };
  const update = () => {
    if (!printing) show();
  };
  // Paper is white and gets the standard size; registered before the chart's own listeners, which then measure for paper.
  window.addEventListener(
    'beforeprint',
    () => {
      printing = true;
      root.dataset.theme = 'light';
      root.dataset.textSize = 'standard';
      applyPageColors(pageColors, 'light');
    },
    { signal },
  );
  window.addEventListener(
    'afterprint',
    () => {
      printing = false;
      show();
    },
    { signal },
  );

  if (hostTheme) {
    source.onThemeChange((theme) => {
      hostTheme = theme;
      update();
    });
  }
  show();
  return (choice) => {
    preference = choice.preference;
    textSize = choice.textSize;
    update();
  };
}
