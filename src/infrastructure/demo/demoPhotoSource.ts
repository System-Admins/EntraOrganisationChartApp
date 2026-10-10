import type { EmployeePhotos } from '@/application/abstractions/employeePhotos';

const PALETTE = [
  ['#c7e0f4', '#6a8caf'],
  ['#f4d9c7', '#b07a5a'],
  ['#d6ecd2', '#6f9868'],
  ['#e6d7f0', '#8b6aa8'],
  ['#f6e7b5', '#a88a3a'],
] as const;

/** People per answer, as Graph's photo source asks them. */
const BATCH_SIZE = 20;
/** Slow enough for the progress of a photo check or an export to show, and for Cancel to be pressed. */
const BATCH_DELAY_MS = 60;

/** Placeholder silhouettes for two thirds of the demo company; the rest fall back to initials. */
export class DemoPhotoSource implements EmployeePhotos {
  /** Drawn on demand, so nothing is kept to forget. */
  forget(): Promise<void> {
    return Promise.resolve();
  }

  getPhotoUrl(employeeId: string): Promise<string | null> {
    const colors = silhouetteColors(employeeId);
    if (!colors) return Promise.resolve(null);
    const [background, figure] = colors;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${background}"/>` +
      `<circle cx="48" cy="38" r="18" fill="${figure}"/><path d="M14 96c4-22 18-32 34-32s30 10 34 32Z" fill="${figure}"/></svg>`;
    return Promise.resolve(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  /** Answers 20 people at a time, as Graph does; a batch whose wait has begun still answers after an abort, like a request under way. */
  async havePhotos(
    employeeIds: readonly string[],
    onProgress?: (askedCount: number) => void,
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, boolean>> {
    const answers = new Map<string, boolean>();
    for (let start = 0; start < employeeIds.length && !signal?.aborted; start += BATCH_SIZE) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      const batch = employeeIds.slice(start, start + BATCH_SIZE);
      for (const employeeId of batch) answers.set(employeeId, silhouetteColors(employeeId) !== null);
      onProgress?.(start + batch.length);
    }
    return answers;
  }
}

/** Null for the people without a photo; the same person always gets the same answer. */
function silhouetteColors(employeeId: string): readonly [background: string, figure: string] | null {
  let hash = 7;
  for (let index = 0; index < employeeId.length; index++) hash = (hash * 31 + employeeId.charCodeAt(index)) >>> 0;
  return hash % 3 === 0 ? null : (PALETTE[hash % PALETTE.length] ?? null);
}
