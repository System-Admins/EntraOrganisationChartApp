import { describe, expect, it } from 'vitest';
import { describeProgress, progressTracker, type DirectoryProgress } from './directoryProgress';

/** A tracker on a clock the test moves, and what it showed. */
function tracked() {
  let now = 0;
  const shown: DirectoryProgress[] = [];
  const report = progressTracker(
    (progress) => shown.push(progress),
    () => now,
  );
  return {
    shown,
    reportAt: (seconds: number, loaded: number, total?: number | null) => {
      now = seconds * 1000;
      report(loaded, total);
    },
  };
}

describe('progressTracker', () => {
  it('says how far a read is, and from its second report how long the rest takes at its pace so far', () => {
    const { shown, reportAt } = tracked();

    reportAt(0, 0, 1000);
    reportAt(2, 100, 1000);
    reportAt(4, 200, 1000);

    expect(shown).toEqual([
      { loaded: 0, total: 1000, remainingMs: null },
      { loaded: 100, total: 1000, remainingMs: 18_000 },
      { loaded: 200, total: 1000, remainingMs: 16_000 },
    ]);
  });

  it('times an attempt that goes on where another stopped by its own pages, not by those read before', () => {
    const { shown, reportAt } = tracked();
    reportAt(0, 0, 1000);
    reportAt(1, 500, 1000);

    // The read failed, and the person tried again a minute later.
    reportAt(61, 500, 1000);
    reportAt(63, 600, 1000);

    expect(shown.slice(-2).map(({ remainingMs }) => remainingMs)).toEqual([null, 8_000]);
  });

  it('tells no time left without a total, or once the count is reached', () => {
    const { shown, reportAt } = tracked();
    reportAt(0, 0);
    reportAt(1, 100);
    reportAt(2, 0, 150);
    reportAt(3, 200, 150);

    expect(shown.map(({ total, remainingMs }) => [total, remainingMs])).toEqual([
      [null, null],
      [null, null],
      [150, null],
      [150, null],
    ]);
  });
});

describe('describeProgress', () => {
  it.each([
    ['the people loaded where there is no total', { loaded: 1234, total: null, remainingMs: null }, '1,234 people loaded'],
    ['one person in the singular', { loaded: 1, total: null, remainingMs: null }, '1 person loaded'],
    ['the total as about', { loaded: 1200, total: 5000, remainingMs: null }, '1,200 of about 5,000 people loaded'],
    [
      'less than a minute left',
      { loaded: 1200, total: 5000, remainingMs: 59_000 },
      '1,200 of about 5,000 people loaded, less than a minute left',
    ],
    ['one minute', { loaded: 1200, total: 5000, remainingMs: 60_000 }, '1,200 of about 5,000 people loaded, about 1 minute left'],
    [
      'the nearest number of minutes',
      { loaded: 1200, total: 5000, remainingMs: 150_000 },
      '1,200 of about 5,000 people loaded, about 3 minutes left',
    ],
    ['no guess once more were read than counted', { loaded: 5100, total: 5000, remainingMs: null }, '5,100 people loaded'],
  ])('says %s', (_case, progress: DirectoryProgress, words) => {
    expect(describeProgress(progress, 'en')).toBe(words);
  });
});
