import type { ProgressListener } from '@/application/abstractions/employeeDirectory';
import type { Language } from '@/application/settings/language';
import { formatPeople } from '../../shared/formatPeople';
import { PROGRESS_STRINGS } from './strings';

/** How far a full read of the directory is, as the loading screen and the status bar show it. */
export interface DirectoryProgress {
  readonly loaded: number;
  /** About how many people there are in all; null where the directory can't tell. */
  readonly total: number | null;
  /** About how long the rest takes at the pace so far; null until that can be told. */
  readonly remainingMs: number | null;
}

interface Sample {
  readonly count: number;
  readonly at: number;
}

/** A listener that adds the time left to what the directory reports, measured over each attempt's own pages. */
export function progressTracker(show: (progress: DirectoryProgress) => void, now: () => number = () => Date.now()): ProgressListener {
  let first: Sample | null = null;
  let latest: Sample | null = null;
  return (loaded, total = null) => {
    const sample = { count: loaded, at: now() };
    // An attempt reports first where it starts, never beyond where the last one stopped; the pages kept from that one took no time.
    if (!first || !latest || loaded <= latest.count) first = sample;
    latest = sample;
    show({ loaded, total, remainingMs: remainingMs(first, sample, total) });
  };
}

function remainingMs(first: Sample, latest: Sample, total: number | null): number | null {
  const read = latest.count - first.count;
  const elapsed = latest.at - first.at;
  if (total === null || latest.count >= total || read <= 0 || elapsed <= 0) return null;
  return ((total - latest.count) * elapsed) / read;
}

/** "1,200 of about 5,000 people loaded, about 2 minutes left", or as much of it as is known. */
export function describeProgress({ loaded, total, remainingMs: left }: DirectoryProgress, language: Language): string {
  const texts = PROGRESS_STRINGS[language];
  // An eventually consistent count can be passed, and the words then stop guessing.
  if (total === null || loaded >= total) return texts.loaded(formatPeople(loaded, language));
  const counted = texts.loadedOfAbout(loaded, formatPeople(total, language));
  if (left === null) return counted;
  return texts.withTimeLeft(counted, left < 60_000 ? texts.lessThanAMinuteLeft : texts.minutesLeft(Math.round(left / 60_000)));
}
