// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StartupError } from './StartupError';

afterEach(cleanup);

describe('StartupError', () => {
  it('is a page of its own: a main landmark with the top-level heading', () => {
    render(<StartupError error={new Error('chart.expandDepth must be a whole number from 0 to 6.')} />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('The organization chart could not start');
    expect(screen.getByRole('main').contains(heading)).toBe(true);
  });

  it('tells staff what to do and keeps the cause for IT in a line of its own', () => {
    render(<StartupError error={new Error('chart.expandDepth must be a whole number from 0 to 6.')} />);

    const [explanation, detail] = Array.from(screen.getByRole('alert').querySelectorAll('p'), (p) => p.textContent);
    expect(explanation).toContain('Contact your IT support');
    expect(explanation).not.toContain('expandDepth');
    expect(detail).toBe('Technical details: chart.expandDepth must be a whole number from 0 to 6.');
  });

  it('marks the cause for IT as English', () => {
    render(<StartupError error={new Error('chart.expandDepth must be a whole number from 0 to 6.')} />);

    expect(screen.getByText('chart.expandDepth must be a whole number from 0 to 6.').getAttribute('lang')).toBe('en');
  });
});
