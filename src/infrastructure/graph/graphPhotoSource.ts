import type { EmployeePhotos } from '@/application/abstractions/employeePhotos';
import type { PhotoStore } from '../directory/photoStore';
import type { GraphClient } from './graphClient';

/** Sharp at 40px on high-density screens, slightly soft at 72px, for one download per person. */
const PHOTO_SIZE = '96x96';
/** Microsoft Graph JSON batching limit. */
const BATCH_SIZE = 20;
/** Cards mounting in the same render ask within a few ms; waiting briefly fills batches. */
const COLLECT_MS = 25;
/** Sub-responses that a later attempt can turn into a photo. */
const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 503, 504]);
const MAX_RETRIES = 3;
/** $batch calls in flight while an export asks who has a photo; more would get throttled. */
const HAVE_PHOTOS_CONCURRENCY = 4;

interface PendingPhoto {
  readonly employeeId: string;
  readonly resolve: (url: string | null) => void;
  readonly attempt: number;
}

interface BatchResponse {
  readonly responses: readonly {
    readonly id: string;
    readonly status: number;
    readonly headers?: Readonly<Record<string, string>>;
    /** Binary bodies arrive base64-encoded inside a batch. */
    readonly body?: unknown;
  }[];
}

/** Loads profile photos on demand, 20 per Graph $batch call, and keeps them for the session, and with a store between visits. */
export class GraphPhotoSource implements EmployeePhotos {
  private readonly photos = new Map<string, Promise<string | null>>();
  private queue: PendingPhoto[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the console has heard of a failing store this page: one that fails tends to fail at every batch. */
  private storeFailed = false;

  /** `store` keeps the photos between visits; null where config.json keeps nothing in the browser. */
  constructor(
    private readonly graph: GraphClient,
    private store: PhotoStore | null = null,
  ) {}

  /** The page keeps nothing more once forgotten, as batches still under way answer after the deletion. */
  async forget(): Promise<void> {
    const { store } = this;
    this.store = null;
    this.photos.clear();
    await store?.clear().catch((error: unknown) => {
      console.warn('Could not delete the cached photos.', error);
    });
  }

  getPhotoUrl(employeeId: string): Promise<string | null> {
    let photo = this.photos.get(employeeId);
    if (!photo) {
      photo = new Promise((resolve) => {
        this.enqueue({ employeeId, resolve, attempt: 0 });
      });
      this.photos.set(employeeId, photo);
    }
    return photo;
  }

  async havePhotos(
    employeeIds: readonly string[],
    onProgress?: (askedCount: number) => void,
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, boolean>> {
    const answers = new Map<string, boolean>();
    const batches: string[][] = [];
    for (let start = 0; start < employeeIds.length; start += BATCH_SIZE) {
      batches.push(employeeIds.slice(start, start + BATCH_SIZE));
    }
    // Stops the batches as `signal` aborts, and as one fails, which rejects the check at once.
    const stop = new AbortController();
    const cancel = () => {
      stop.abort();
    };
    signal?.addEventListener('abort', cancel);
    if (signal?.aborted) cancel();
    let failed = false;
    let asked = 0;
    let next = 0;
    const work = async () => {
      // An abort starts no more batches; those under way still answer, and their answers count.
      for (let batch = batches[next++]; batch && !stop.signal.aborted; batch = batches[next++]) {
        const found = await this.askForPhotos(batch, 0, stop.signal).catch((error: unknown) => {
          failed = true;
          stop.abort();
          throw error;
        });
        // The check rejected as another batch failed: progress after that would show it running again.
        if (failed) return;
        for (const [employeeId, hasPhoto] of found) answers.set(employeeId, hasPhoto);
        asked += batch.length;
        onProgress?.(asked);
      }
    };
    try {
      await Promise.all(Array.from({ length: HAVE_PHOTOS_CONCURRENCY }, work));
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
    return answers;
  }

  /** Asks for the photo's description instead of the photo: 200 means there is one, 404 that there is none. */
  private async askForPhotos(employeeIds: readonly string[], attempt: number, signal?: AbortSignal): Promise<Map<string, boolean>> {
    const { responses } = await this.graph.postJson<BatchResponse>('/$batch', {
      requests: employeeIds.map((employeeId, index) => ({
        id: String(index),
        method: 'GET',
        url: `/users/${employeeId}/photos/${PHOTO_SIZE}`,
      })),
    });
    const byId = new Map(responses.map((response) => [response.id, response]));
    const answers = new Map<string, boolean>();
    const throttled: string[] = [];
    let delayMs = 0;
    employeeIds.forEach((employeeId, index) => {
      const response = byId.get(String(index));
      if (response?.status === 200) answers.set(employeeId, true);
      else if (response?.status === 404) answers.set(employeeId, false);
      else if (response && RETRY_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
        throttled.push(employeeId);
        delayMs = Math.max(delayMs, retryDelayMs(response.headers, attempt));
      }
    });
    if (throttled.length > 0 && !signal?.aborted) {
      await pause(delayMs, signal);
      // Throttled people are asked no more once the check is cancelled during the wait: they are left out, as unanswered.
      if (!signal?.aborted) {
        for (const [employeeId, hasPhoto] of await this.askForPhotos(throttled, attempt + 1, signal)) answers.set(employeeId, hasPhoto);
      }
    }
    return answers;
  }

  private enqueue(pending: PendingPhoto): void {
    this.queue.push(pending);
    this.flushTimer ??= setTimeout(() => {
      this.flush();
    }, COLLECT_MS);
  }

  private flush(): void {
    this.flushTimer = null;
    const pending = this.queue;
    this.queue = [];
    void this.serve(pending);
  }

  /** What the store keeps comes from one read of it; Graph is asked for the rest, 20 at a time. */
  private async serve(pending: readonly PendingPhoto[]): Promise<void> {
    // A retry goes to Graph because the store had nothing the first time.
    const kept = await this.readStore(pending.filter(({ attempt }) => attempt === 0).map(({ employeeId }) => employeeId));
    const missing: PendingPhoto[] = [];
    for (const item of pending) {
      const photo = kept.get(item.employeeId);
      if (photo === undefined) missing.push(item);
      else item.resolve(photo);
    }
    for (let start = 0; start < missing.length; start += BATCH_SIZE) {
      void this.load(missing.slice(start, start + BATCH_SIZE));
    }
  }

  /** A broken or blocked browser store must not keep the photos from loading. */
  private async readStore(employeeIds: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
    if (!this.store || employeeIds.length === 0) return new Map();
    try {
      return await this.store.read(employeeIds);
    } catch (error) {
      this.warnOfStore('Could not read the cached photos.', error);
      return new Map();
    }
  }

  /** Not awaited: the photos show while the browser keeps them for the next visit. */
  private keep(answers: ReadonlyMap<string, string | null>): void {
    if (!this.store || answers.size === 0) return;
    this.store.write(answers).catch((error: unknown) => {
      this.warnOfStore('Could not cache the photos in the browser.', error);
    });
  }

  private warnOfStore(message: string, error: unknown): void {
    if (this.storeFailed) return;
    this.storeFailed = true;
    console.warn(message, error);
  }

  private async load(batch: readonly PendingPhoto[]): Promise<void> {
    try {
      const { responses } = await this.graph.postJson<BatchResponse>('/$batch', {
        requests: batch.map(({ employeeId }, index) => ({
          id: String(index),
          method: 'GET',
          url: `/users/${employeeId}/photos/${PHOTO_SIZE}/$value`,
        })),
      });
      const byId = new Map(responses.map((response) => [response.id, response]));
      const answers = new Map<string, string | null>();
      batch.forEach((pending, index) => {
        const { employeeId, resolve } = pending;
        const response = byId.get(String(index));
        if (response?.status === 200 && typeof response.body === 'string') {
          const photo = `data:${header(response.headers, 'content-type') ?? 'image/jpeg'};base64,${response.body}`;
          answers.set(employeeId, photo);
          resolve(photo);
          return;
        }
        // Graph throttles parts of a batch on their own; the batch call itself succeeded.
        if (response && RETRY_STATUSES.has(response.status) && pending.attempt < MAX_RETRIES) {
          setTimeout(() => {
            this.enqueue({ ...pending, attempt: pending.attempt + 1 });
          }, retryDelayMs(response.headers, pending.attempt));
          return;
        }
        // 404 means no photo, which is kept as an answer too; anything else may succeed on a later render.
        if (response?.status === 404) answers.set(employeeId, null);
        else this.photos.delete(employeeId);
        resolve(null);
      });
      this.keep(answers);
    } catch (error) {
      console.warn('Could not load profile photos.', error);
      for (const { employeeId, resolve } of batch) {
        this.photos.delete(employeeId);
        resolve(null);
      }
    }
  }
}

/** Batch sub-responses don't normalize header names. */
function header(headers: Readonly<Record<string, string>> | undefined, name: string): string | undefined {
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];
}

/** Waits, or less where `signal` aborts meanwhile. */
function pause(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    signal?.addEventListener('abort', done);
  });
}

/** Graph's Retry-After, in seconds, when it gives one; otherwise 1, 2, then 4 seconds. */
function retryDelayMs(headers: Readonly<Record<string, string>> | undefined, attempt: number): number {
  const seconds = Number(header(headers, 'retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000 * 2 ** attempt;
}
