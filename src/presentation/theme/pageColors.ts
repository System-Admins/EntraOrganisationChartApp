import type { ThemeName } from '@/application/settings/appSettings';
import { PAGE_COLOR_KEYS, type PageColors } from '@/application/settings/branding';
import { cssName } from './branding';
import { findContrastProblems, readThemeColors, type ThemeColors } from './brandingContrast';

const reported = new Set<string>();

/** The embedding page's colours over branding's in `theme`, each kept only where it adds no contrast problem; the high-contrast theme takes none. */
export function applyPageColors(
  colors: PageColors,
  theme: ThemeName,
  read: () => ThemeColors = readThemeColors,
  root: HTMLElement = document.documentElement,
): void {
  for (const key of PAGE_COLOR_KEYS) root.style.removeProperty(variableOf(key));
  if (theme === 'contrast') return;
  let known = problemsIn(read());
  for (const key of PAGE_COLOR_KEYS) {
    const value = colors[key];
    if (!value) continue;
    root.style.setProperty(variableOf(key), value);
    const now = problemsIn(read());
    const added = [...now].find((problem) => !known.has(problem));
    if (added === undefined) {
      known = now;
      continue;
    }
    root.style.removeProperty(variableOf(key));
    const message = `The embedding page's ${key} colour (${value}) is left out in the ${theme} theme, as it would put ${added}.`;
    if (!reported.has(message)) console.info(message);
    reported.add(message);
  }
}

/** By the colours they are between, as their values change with each colour tried. */
function problemsIn(colors: ThemeColors): Set<string> {
  return new Set(findContrastProblems(colors).map(({ color, on, minimum }) => `${color} below ${String(minimum)}:1 on ${on}`));
}

function variableOf(key: keyof PageColors): string {
  return `--page-${cssName(key)}`;
}
