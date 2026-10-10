import { describe, expect, it } from 'vitest';

/** Every stylesheet of the app, as written. */
const stylesheets = Object.entries(
  import.meta.glob<string>('/src/**/*.css', { query: '?raw', import: 'default', eager: true }),
).map(([path, css]) => [path.replace('/src/', ''), css] as const);

/** The value of each declaration of the property, comments aside. */
function declarations(css: string, property: string): string[] {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...code.matchAll(new RegExp(`(?:^|[\\s;{])${property}\\s*:\\s*([^;}]+)`, 'g'))].map((match) => (match[1] ?? '').trim());
}

describe('the stylesheets', () => {
  it('are found in every layer of the interface, as written', () => {
    expect(stylesheets.map(([path]) => path)).toEqual(
      expect.arrayContaining(['presentation/theme/global.css', 'presentation/features/orgChart/EmployeeCard.module.css']),
    );
    const card = stylesheets.find(([path]) => path.endsWith('EmployeeCard.module.css'))?.[1] ?? '';
    expect(declarations(card, 'font-size')).toContain('calc(14px * var(--text-scale))');
  });

  it.each(stylesheets)('%s scales every font size by the text size chosen in Settings', (_path, css) => {
    for (const size of declarations(css, 'font-size')) {
      if (size !== 'inherit') expect(size).toMatch(/^calc\(\d+(?:\.\d+)?px \* var\(--text-scale\)\)$/);
    }
    // The shorthand would set a size of its own.
    for (const font of declarations(css, 'font')) expect(font).toBe('inherit');
  });

  it('widens the cards with the text, so that a name keeps its room', () => {
    const chart = stylesheets.find(([path]) => path.endsWith('OrgChart.module.css'))?.[1] ?? '';

    expect(declarations(chart, '--card-width')).toContain('calc(272px * var(--text-scale))');
  });
});
