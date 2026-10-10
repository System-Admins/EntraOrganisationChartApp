// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextSize, ThemeName, ThemePreference } from '@/application/settings/appSettings';
import { syncTheme, type ThemeChoice, type ThemeSource } from './themeSync';

const NO_HOST: ThemeSource = { theme: null, onThemeChange: () => undefined };

/** Ends each test's listening, so that the print events of a later test reach its own listeners only. */
let listening = new AbortController();
const sync = (initial: ThemeChoice, source: ThemeSource) => syncTheme(initial, source, {}, listening.signal);

const shown = () => document.documentElement.dataset.theme;
const textSize = () => document.documentElement.dataset.textSize;

const choice = (preference: ThemePreference, size: TextSize = 'standard') => ({ preference, textSize: size });

/** A host that sets the theme, as Teams does, and changes it when the test says so. */
function teams(theme: ThemeName) {
  let listener: (theme: ThemeName) => void = () => undefined;
  const source: ThemeSource = { theme, onThemeChange: (next) => (listener = next) };
  return {
    source,
    change: (next: ThemeName) => {
      listener(next);
    },
  };
}

function stubColorScheme(dark: boolean) {
  const listeners: (() => void)[] = [];
  const query = { matches: dark, addEventListener: (_type: string, listener: () => void) => listeners.push(listener) };
  vi.stubGlobal('matchMedia', () => query);
  return (nowDark: boolean) => {
    query.matches = nowDark;
    listeners.forEach((listener) => {
      listener();
    });
  };
}

describe('syncTheme', () => {
  afterEach(() => {
    listening.abort();
    listening = new AbortController();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.textSize;
    document.documentElement.removeAttribute('style');
  });

  it.each(['light', 'dark', 'contrast'] as const)('shows the configured %s theme', (preference) => {
    sync(choice(preference), NO_HOST);

    expect(shown()).toBe(preference);
  });

  it('follows the operating system when the preference is auto', () => {
    const change = stubColorScheme(true);

    sync(choice('auto'), NO_HOST);
    expect(shown()).toBe('dark');

    change(false);
    expect(shown()).toBe('light');
  });

  it('lets the host decide, whatever the preference', () => {
    const host = teams('dark');
    sync(choice('light'), host.source);
    expect(shown()).toBe('dark');

    host.change('contrast');
    expect(shown()).toBe('contrast');
  });

  it('switches to another choice while the page is open, and from it back to the system', () => {
    const change = stubColorScheme(false);
    const setTheme = sync(choice('auto'), NO_HOST);
    expect([shown(), textSize()]).toEqual(['light', 'standard']);

    setTheme(choice('contrast', 'larger'));
    expect([shown(), textSize()]).toEqual(['contrast', 'larger']);
    // The system's scheme no longer counts while the person has chosen a theme.
    change(true);
    expect(shown()).toBe('contrast');

    setTheme(choice('auto', 'large'));
    expect([shown(), textSize()]).toEqual(['dark', 'large']);
    change(false);
    expect(shown()).toBe('light');
  });

  it('asks nothing of the system until the preference is auto', () => {
    const matchMedia = vi.fn(() => ({ matches: true, addEventListener: () => undefined }));
    vi.stubGlobal('matchMedia', matchMedia);

    const setTheme = sync(choice('light'), NO_HOST);
    expect(matchMedia).not.toHaveBeenCalled();

    setTheme(choice('auto'));
    expect(shown()).toBe('dark');
    expect(matchMedia).toHaveBeenCalledOnce();
  });

  it('keeps the host\'s theme over any choice made while the page is open, and still takes the text size', () => {
    const host = teams('light');
    const setTheme = sync(choice('auto'), host.source);

    setTheme(choice('dark', 'larger'));

    expect([shown(), textSize()]).toEqual(['light', 'larger']);
    host.change('contrast');
    expect(shown()).toBe('contrast');
  });

  it('prints in the light theme and the standard size, and returns to those of the moment', () => {
    const host = teams('dark');
    const setTheme = sync(choice('auto', 'large'), host.source);

    window.dispatchEvent(new Event('beforeprint'));
    expect([shown(), textSize()]).toEqual(['light', 'standard']);

    host.change('contrast');
    setTheme(choice('auto', 'larger'));
    expect([shown(), textSize()]).toEqual(['light', 'standard']);

    window.dispatchEvent(new Event('afterprint'));
    expect([shown(), textSize()]).toEqual(['contrast', 'larger']);
  });

  it('stops listening to printing once its signal is aborted, which only tests need', () => {
    const stopped = new AbortController();
    syncTheme(choice('dark', 'large'), NO_HOST, {}, stopped.signal);

    stopped.abort();
    window.dispatchEvent(new Event('beforeprint'));

    expect([shown(), textSize()]).toEqual(['dark', 'large']);
  });

  it("tries the embedding page's colours in each theme shown, and in the light theme on paper", () => {
    const background = () => document.documentElement.style.getPropertyValue('--page-background');
    const setTheme = syncTheme(choice('light'), NO_HOST, { background: '#faf9f8' }, listening.signal);
    expect(background()).toBe('#faf9f8');

    setTheme(choice('contrast'));
    expect(background()).toBe('');

    window.dispatchEvent(new Event('beforeprint'));
    expect(background()).toBe('#faf9f8');
    window.dispatchEvent(new Event('afterprint'));
    expect(background()).toBe('');
  });
});
