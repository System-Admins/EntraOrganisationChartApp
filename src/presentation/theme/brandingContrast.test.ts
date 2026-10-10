import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeContrastProblem, findContrastProblems, warnAboutBrandingContrast, type ThemeColors } from './brandingContrast';
import { parseColor, type Rgb } from './contrast';

const hex = (value: string): Rgb => {
  const channels = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
  const color = parseColor(`rgb(${channels.join(', ')})`);
  if (!color) throw new Error(`Not a colour: ${value}`);
  return color;
};

const colorsOf = (values: Record<string, string>): ThemeColors =>
  Object.fromEntries(Object.entries(values).map(([name, value]) => [name, hex(value)]));

const LIGHT = {
  accent: '#0f548c',
  accentText: '#074f87',
  onAccent: '#ffffff',
  headerBackground: '#ffffff',
  headerText: '#242424',
  background: '#f5f5f5',
  surface: '#ffffff',
  text: '#242424',
  mutedText: '#505050',
  border: '#e0e0e0',
  connector: '#858585',
};

const DARK = {
  accent: '#479ef5',
  accentText: '#a3d9ff',
  onAccent: '#0a0a0a',
  headerBackground: '#292929',
  headerText: '#ffffff',
  background: '#1f1f1f',
  surface: '#292929',
  text: '#ffffff',
  mutedText: '#cccccc',
  border: '#3d3d3d',
  connector: '#6b6b6b',
};

const found = (values: Record<string, string>) => findContrastProblems(colorsOf(values)).map(({ color, on }) => `${color} on ${on}`);

describe('findContrastProblems', () => {
  it('finds nothing wrong with readable themes', () => {
    expect(found(LIGHT)).toEqual([]);
    expect(found(DARK)).toEqual([]);
  });

  it('catches a dark accent left on the dark theme with its default text', () => {
    const problems = findContrastProblems(colorsOf({ ...DARK, accent: '#002756', accentText: '#abd7ff' }));

    expect(problems.map(({ color, on }) => `${color} on ${on}`)).toEqual(['accent on surface', 'accent on background']);
    expect(problems[0]).toMatchObject({ minimum: 3 });
    expect(problems[0]?.ratio).toBeCloseTo(1.01, 2);
  });

  it('holds each colour to the minimum of its use', () => {
    // 3.5:1 on white is enough for the selection, icons and lines, but not for text.
    const grey = '#888888';

    expect(found({ ...LIGHT, accent: grey, accentText: grey, onAccent: '#000000' })).toEqual(['accentText on surface']);
    expect(found({ ...LIGHT, connector: '#c0c0c0' })).toEqual(['connector on background']);
    expect(found({ ...LIGHT, text: grey })).toEqual(['text on background', 'text on surface']);
    expect(found({ ...LIGHT, mutedText: grey })).toEqual(['mutedText on background', 'mutedText on surface']);
    expect(found({ ...LIGHT, headerBackground: '#002756' })).toEqual(['headerText on headerBackground']);
    // No fill carries onAccent any more, so it can't be too faint.
    expect(found({ ...LIGHT, onAccent: '#8fb8dc' })).toEqual([]);
  });

  it('skips colours the browser could not resolve', () => {
    expect(findContrastProblems({ accent: hex('#ffffff') })).toEqual([]);
  });
});

describe('describeContrastProblem', () => {
  it('names the config keys, the theme, the colours and the ratio needed', () => {
    const [problem] = findContrastProblems(colorsOf({ ...DARK, accent: '#002756' }));
    if (!problem) throw new Error('Expected a problem.');

    expect(describeContrastProblem(problem, 'dark')).toBe(
      'Low contrast in the dark theme: branding.darkColors.accent (#002756) is 1.0:1 on branding.darkColors.surface (#292929); ' +
        'the selection and icons need at least 3:1. Adjust these colours in config.json.',
    );
  });

  it('traces text in the accent colour back to the accent', () => {
    const [problem] = findContrastProblems(colorsOf({ ...LIGHT, accentText: '#888888' }));
    if (!problem) throw new Error('Expected a problem.');

    expect(describeContrastProblem(problem, 'light')).toBe(
      'Low contrast in the light theme: text in the accent colour (#888888, derived from branding.colors.accent) is 3.5:1 on ' +
        'branding.colors.surface (#ffffff); links, buttons and the report badge need at least 4.5:1. Adjust these colours in config.json.',
    );
  });

  it('never rounds a failing ratio up to the minimum', () => {
    // 2.995:1 on white.
    const [problem] = findContrastProblems(colorsOf({ ...LIGHT, connector: '#959595', background: '#ffffff' }));
    if (!problem) throw new Error('Expected a problem.');

    expect(describeContrastProblem(problem, 'light')).toContain('is 2.9:1 on');
  });
});

describe('warnAboutBrandingContrast', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns once per problem, however often the theme comes back', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const navy = () => colorsOf({ ...DARK, accent: '#002756' });

    warnAboutBrandingContrast('dark', navy);
    warnAboutBrandingContrast('light', () => colorsOf(LIGHT));
    warnAboutBrandingContrast('dark', navy);

    expect(warn.mock.calls.map(([message]) => String(message).split(';')[0])).toEqual([
      'Low contrast in the dark theme: branding.darkColors.accent (#002756) is 1.0:1 on branding.darkColors.surface (#292929)',
      'Low contrast in the dark theme: branding.darkColors.accent (#002756) is 1.1:1 on branding.darkColors.background (#1f1f1f)',
    ]);
  });

  it('leaves the high-contrast theme alone, which ignores branding', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const read = vi.fn(() => colorsOf({ ...DARK, text: '#292929' }));

    warnAboutBrandingContrast('contrast', read);

    expect(read).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
