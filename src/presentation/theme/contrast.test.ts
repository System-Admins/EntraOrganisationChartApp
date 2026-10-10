import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, relativeLuminance, toHex, type Rgb } from './contrast';

const rgb = (red: number, green: number, blue: number, alpha = 1): Rgb => ({ red: red / 255, green: green / 255, blue: blue / 255, alpha });
const WHITE = rgb(255, 255, 255);
const BLACK = rgb(0, 0, 0);

describe('parseColor', () => {
  it('reads the notations a computed colour comes in', () => {
    expect(parseColor('rgb(15, 84, 140)')).toEqual(rgb(15, 84, 140));
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual(rgb(0, 0, 0, 0.5));
    expect(parseColor('rgb(15 84 140 / 0.25)')).toEqual(rgb(15, 84, 140, 0.25));
    expect(parseColor('color(srgb 0.2 0.4 0.6)')).toEqual({ red: 0.2, green: 0.4, blue: 0.6, alpha: 1 });
    expect(parseColor('color(srgb 0 0 0 / 0.5)')).toEqual({ red: 0, green: 0, blue: 0, alpha: 0.5 });
  });

  it('clips channels outside sRGB, as the screen does', () => {
    expect(parseColor('color(srgb -0.101061 0.309781 1.09431)')).toEqual({ red: 0, green: 0.309781, blue: 1, alpha: 1 });
    expect(parseColor('color(srgb none 0.5 0.5)')).toEqual({ red: 0, green: 0.5, blue: 0.5, alpha: 1 });
  });

  it.each(['', 'oklch(0.43 0.15 250)', 'color(display-p3 1 0 0)', 'color(srgb-linear 1 0 0)', 'rgb(1, 2)', 'rgb(a, b, c)', 'red'])('gives up on %j', (value) => {
    expect(parseColor(value)).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('runs from black to white', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
    expect(relativeLuminance(rgb(128, 128, 128))).toBeCloseTo(0.2159, 4);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values in either order', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 10);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    // #767676 is the lightest grey that passes AA on white.
    expect(contrastRatio(rgb(118, 118, 118), WHITE)).toBeCloseTo(4.54, 2);
  });

  it('sees a translucent foreground mixed with the background', () => {
    expect(contrastRatio(rgb(0, 0, 0, 0.5), WHITE)).toBeCloseTo(contrastRatio(rgb(127.5, 127.5, 127.5), WHITE), 10);
    expect(contrastRatio(rgb(0, 0, 0, 0), WHITE)).toBe(1);
  });
});

describe('toHex', () => {
  it('writes a colour the way config.json does', () => {
    expect(toHex(rgb(0, 39, 86))).toBe('#002756');
    expect(toHex({ red: 0.2, green: 0.4, blue: 0.6, alpha: 1 })).toBe('#336699');
  });
});
