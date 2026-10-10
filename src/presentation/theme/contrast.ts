/** An sRGB colour with every channel and the alpha from 0 to 1. */
export interface Rgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/** Reads `rgb()`, `rgba()` and `color(srgb ...)` as getComputedStyle writes them; null for anything else. */
export function parseColor(computed: string): Rgb | null {
  const match = /^(rgba?\(|color\(srgb\s)(.+)\)$/.exec(computed.trim());
  if (!match) return null;
  const scale = match[1]?.startsWith('rgb') ? 255 : 1;
  const parts = (match[2] ?? '').split(/[\s,/]+/).filter(Boolean);
  // A missing channel ("none") counts as 0.
  const [red, green, blue, alpha = 1] = parts.map((part) => (part === 'none' ? 0 : Number(part)));
  if (parts.length < 3 || parts.length > 4 || red === undefined || green === undefined || blue === undefined) return null;
  if ([red, green, blue, alpha].some(Number.isNaN)) return null;
  return { red: clamp(red / scale), green: clamp(green / scale), blue: clamp(blue / scale), alpha: clamp(alpha) };
}

/** WCAG 2's relative luminance, from 0 (black) to 1 (white); the alpha is ignored. */
export function relativeLuminance({ red, green, blue }: Rgb): number {
  const linear = (channel: number): number => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG 2's contrast ratio, from 1 to 21. A translucent foreground is seen mixed with the background. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const over = (front: number, back: number): number => front * foreground.alpha + back * (1 - foreground.alpha);
  const seen: Rgb = {
    red: over(foreground.red, background.red),
    green: over(foreground.green, background.green),
    blue: over(foreground.blue, background.blue),
    alpha: 1,
  };
  const [lighter, darker] = [relativeLuminance(seen), relativeLuminance(background)].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

export function toHex({ red, green, blue }: Rgb): string {
  const channel = (value: number): string => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
