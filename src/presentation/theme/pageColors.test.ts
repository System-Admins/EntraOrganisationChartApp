// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeColors } from './brandingContrast';
import { parseColor, type Rgb } from './contrast';
import { applyPageColors } from './pageColors';

const hex = (value: string): Rgb => {
  const channels = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
  const color = parseColor(`rgb(${channels.join(', ')})`);
  if (!color) throw new Error(`Not a colour: ${value}`);
  return color;
};

/** The light theme's colours as global.css resolves them without branding. */
const LIGHT = {
  accent: '#0f548c',
  background: '#f5f5f5',
  surface: '#ffffff',
  text: '#242424',
  mutedText: '#505050',
  connector: '#858585',
  headerText: '#242424',
  headerBackground: '#ffffff',
};

/** Reads the theme as the browser would, with the page's colours where the root has them; text in the accent is the accent itself. */
function reader(own: Readonly<Record<string, string>> = LIGHT) {
  return (): ThemeColors => {
    const page = (key: string) => document.documentElement.style.getPropertyValue(`--page-${key}`) || undefined;
    const accent = page('accent') ?? own.accent ?? '';
    const colors = { ...own, accent, accentText: accent, background: page('background') ?? own.background ?? '' };
    return Object.fromEntries(Object.entries(colors).map(([name, value]) => [name, hex(value)]));
  };
}

const pageColor = (key: string) => document.documentElement.style.getPropertyValue(`--page-${key}`);

afterEach(() => {
  document.documentElement.removeAttribute('style');
  vi.restoreAllMocks();
});

describe('applyPageColors', () => {
  it("takes a section's background and the site's accent where the chart stays readable on them", () => {
    applyPageColors({ background: '#faf9f8', accent: '#0078d4' }, 'light', reader());

    expect(pageColor('background')).toBe('#faf9f8');
    expect(pageColor('accent')).toBe('#0078d4');
  });

  it("leaves out a strong section's background and an accent the cards would lose, and says why", () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    applyPageColors({ background: '#0078d4', accent: '#ffffff' }, 'light', reader());

    expect(pageColor('background')).toBe('');
    expect(pageColor('accent')).toBe('');
    expect(info.mock.calls.map(([message]) => String(message))).toEqual([
      "The embedding page's background colour (#0078d4) is left out in the light theme, as it would put accent below 3:1 on background.",
      "The embedding page's accent colour (#ffffff) is left out in the light theme, as it would put accent below 3:1 on surface.",
    ]);
  });

  it("holds against the page's colours only the problems they bring, not those config.json's colours already have", () => {
    applyPageColors({ background: '#ffffff' }, 'light', reader({ ...LIGHT, connector: '#d0d0d0' }));

    expect(pageColor('background')).toBe('#ffffff');
  });

  it('takes none in the high-contrast theme, and none of those the theme before took', () => {
    applyPageColors({ background: '#faf9f8' }, 'light', reader());
    applyPageColors({ background: '#faf9f8' }, 'contrast', reader());

    expect(pageColor('background')).toBe('');
  });

  it('says once why it leaves a colour out, however often the theme comes back', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    applyPageColors({ accent: '#fefefe' }, 'light', reader());
    applyPageColors({ accent: '#fefefe' }, 'light', reader());

    expect(info).toHaveBeenCalledOnce();
  });
});
