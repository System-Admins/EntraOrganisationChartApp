import { describe, expect, it } from 'vitest';
import { parseCssColor } from './configReader';

describe('parseCssColor', () => {
  it('hands over what can only be a colour', () => {
    for (const value of ['#0f548c', '#abc', 'rebeccapurple', 'rgb(15 84 140 / 50%)', 'hsl(210, 80%, 30%)', 'color-mix(in srgb, red, blue)']) {
      expect(parseCssColor(value, 'test')).toBe(value);
    }
  });

  it('refuses substitutions and escapes, which could smuggle a url() past the browser\'s colour check', () => {
    for (const value of ['var(--x, url(https://evil.example/))', 'VAR(--x)', 'attr(data-x)', 'env(safe-area-inset-top)', '\\76 ar(--x)']) {
      expect(() => parseCssColor(value, '?background', false)).toThrow('?background must be a CSS colour such as "#0f548c".');
    }
  });

  it('echoes the value only where it is config.json\'s own', () => {
    expect(() => parseCssColor('var(--x)', 'branding.colors.accent')).toThrow('(got "var(--x)")');
    expect(() => parseCssColor('var(--x)', '?accent', false)).not.toThrow('got');
  });
});
