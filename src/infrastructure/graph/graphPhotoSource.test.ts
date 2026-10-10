import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoStore } from '../directory/photoStore';
import type { GraphClient } from './graphClient';
import { GraphPhotoSource } from './graphPhotoSource';

interface BatchRequest {
  readonly requests: readonly { readonly id: string; readonly url: string }[];
}

const PHOTO = 'data:image/png;base64,QUJD';

/** `statusFor` answers each request for a photo; `attempt` counts earlier requests for the same URL. */
function photoSource(
  statusFor: (url: string, attempt: number) => number,
  headers: Record<string, string> = {},
  store: PhotoStore | null = null,
) {
  const attempts = new Map<string, number>();
  const postJson = vi.fn((_path: string, body: BatchRequest) =>
    Promise.resolve({
      responses: body.requests.map(({ id, url }) => {
        const attempt = attempts.get(url) ?? 0;
        attempts.set(url, attempt + 1);
        const status = statusFor(url, attempt);
        return status === 200
          ? { id, status, headers: { 'content-type': 'image/png' }, body: 'QUJD' }
          : { id, status, headers };
      }),
    }),
  );
  const source = new GraphPhotoSource({ postJson } as unknown as GraphClient, store);
  return { source, postJson };
}

/** A store that keeps `kept` from an earlier visit. */
function storeKeeping(kept: ReadonlyMap<string, string | null> = new Map()) {
  return {
    read: vi.fn<PhotoStore['read']>((ids) => Promise.resolve(new Map([...kept].filter(([id]) => ids.includes(id))))),
    write: vi.fn<PhotoStore['write']>(() => Promise.resolve()),
    clear: vi.fn<PhotoStore['clear']>(() => Promise.resolve()),
  };
}

/** The people each request to Graph asked for. */
const askedOf = (postJson: ReturnType<typeof photoSource>['postJson']) =>
  postJson.mock.calls.map(([, body]) => body.requests.map(({ url }) => url.split('/')[2]));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GraphPhotoSource', () => {
  it('collects requests into $batch calls of at most 20 and returns data URLs', async () => {
    const { source, postJson } = photoSource(() => 200);

    const photos = Array.from({ length: 25 }, (_, index) => source.getPhotoUrl(`user${String(index)}`));
    await vi.runAllTimersAsync();

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson.mock.calls[0]?.[1].requests).toHaveLength(20);
    expect(postJson.mock.calls[0]?.[1].requests[0]?.url).toBe('/users/user0/photos/96x96/$value');
    await expect(photos[0]).resolves.toBe('data:image/png;base64,QUJD');
  });

  it('remembers people without a photo', async () => {
    const { source, postJson } = photoSource(() => 404);

    await vi.runAllTimersAsync();
    const first = source.getPhotoUrl('none');
    await vi.runAllTimersAsync();
    await expect(first).resolves.toBeNull();
    void source.getPhotoUrl('none');
    await vi.runAllTimersAsync();

    expect(postJson).toHaveBeenCalledTimes(1);
  });

  it('asks again for a throttled photo after the delay Graph gives', async () => {
    const { source, postJson } = photoSource((_url, attempt) => (attempt === 0 ? 429 : 200), { 'Retry-After': '2' });

    const photo = source.getPhotoUrl('busy');
    await vi.advanceTimersByTimeAsync(1999);
    expect(postJson).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();

    expect(postJson).toHaveBeenCalledTimes(2);
    await expect(photo).resolves.toBe('data:image/png;base64,QUJD');
  });

  it('asks who has a photo by the photos\' descriptions, 20 people per $batch call, and reports how far it is', async () => {
    const { source, postJson } = photoSource((url) => (url.includes('/users/user3/') ? 404 : 200));
    const onProgress = vi.fn();
    const ids = Array.from({ length: 45 }, (_, index) => `user${String(index)}`);

    const asked = source.havePhotos(ids, onProgress);
    await vi.runAllTimersAsync();
    const answers = await asked;

    expect(postJson).toHaveBeenCalledTimes(3);
    expect(postJson.mock.calls.map(([, body]) => body.requests.length)).toEqual([20, 20, 5]);
    expect(postJson.mock.calls[0]?.[1].requests[0]?.url).toBe('/users/user0/photos/96x96');
    expect(answers.size).toBe(45);
    expect(answers.get('user3')).toBe(false);
    expect(answers.get('user44')).toBe(true);
    expect(onProgress.mock.calls.map(([count]) => count as number).sort((a, b) => a - b)).toEqual([20, 40, 45]);
  });

  it('asks again for the people Graph throttled, and leaves out those it gave no answer for', async () => {
    const { source, postJson } = photoSource(
      (url, attempt) => (url.includes('/busy/') ? (attempt === 0 ? 429 : 200) : url.includes('/broken/') ? 500 : 404),
      { 'Retry-After': '2' },
    );

    const asked = source.havePhotos(['busy', 'broken', 'none']);
    await vi.advanceTimersByTimeAsync(1999);
    expect(postJson).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();

    expect(postJson).toHaveBeenCalledTimes(2);
    expect(postJson.mock.calls[1]?.[1].requests.map(({ url }) => url)).toEqual(['/users/busy/photos/96x96']);
    expect([...(await asked)]).toEqual([
      ['none', false],
      ['busy', true],
    ]);
  });

  it('runs at most four $batch calls at a time while asking who has a photo', async () => {
    let running = 0;
    let most = 0;
    const postJson = vi.fn(async (_path: string, body: BatchRequest) => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 10));
      running--;
      return { responses: body.requests.map(({ id }) => ({ id, status: 404 })) };
    });
    const source = new GraphPhotoSource({ postJson } as unknown as GraphClient);

    const asked = source.havePhotos(Array.from({ length: 200 }, (_, index) => `user${String(index)}`));
    await vi.runAllTimersAsync();

    expect((await asked).size).toBe(200);
    expect(postJson).toHaveBeenCalledTimes(10);
    expect(most).toBe(4);
  });

  it('starts no more batches once the check is cancelled, and keeps the answers of those under way', async () => {
    const controller = new AbortController();
    const postJson = vi.fn(async (_path: string, body: BatchRequest) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { responses: body.requests.map(({ id }) => ({ id, status: 404 })) };
    });
    const source = new GraphPhotoSource({ postJson } as unknown as GraphClient);
    const onProgress = vi.fn();

    const asked = source.havePhotos(
      Array.from({ length: 200 }, (_, index) => `user${String(index)}`),
      onProgress,
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(5);
    controller.abort();
    await vi.runAllTimersAsync();

    // The four batches under way as the check was cancelled still answer; the six after them are never asked.
    expect(postJson).toHaveBeenCalledTimes(4);
    expect((await asked).size).toBe(80);
    expect(onProgress).toHaveBeenLastCalledWith(80);
  });

  it('stops at a batch that fails: those under way report nothing more, and no others are asked', async () => {
    const failure = new Error('Microsoft Graph request failed (500).');
    let calls = 0;
    const postJson = vi.fn(async (_path: string, body: BatchRequest) => {
      const call = ++calls;
      // The second batch fails while the first, the third and the fourth are still under way.
      await new Promise((resolve) => setTimeout(resolve, call === 2 ? 5 : 10));
      if (call === 2) throw failure;
      return { responses: body.requests.map(({ id }) => ({ id, status: 404 })) };
    });
    const source = new GraphPhotoSource({ postJson } as unknown as GraphClient);
    const onProgress = vi.fn();

    const asked = source.havePhotos(
      Array.from({ length: 100 }, (_, index) => `user${String(index)}`),
      onProgress,
    );
    const rejected = expect(asked).rejects.toBe(failure);
    await vi.runAllTimersAsync();
    await rejected;

    expect(postJson).toHaveBeenCalledTimes(4);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('ends a throttled wait as another batch fails, without asking Graph again', async () => {
    const failure = new Error('Microsoft Graph request failed (500).');
    let calls = 0;
    const postJson = vi.fn(async (_path: string, body: BatchRequest) => {
      if (++calls === 2) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw failure;
      }
      return { responses: body.requests.map(({ id }) => ({ id, status: 429, headers: { 'Retry-After': '30' } })) };
    });
    const source = new GraphPhotoSource({ postJson } as unknown as GraphClient);

    const asked = source.havePhotos(Array.from({ length: 40 }, (_, index) => `user${String(index)}`));
    const rejected = expect(asked).rejects.toBe(failure);
    await vi.runAllTimersAsync();
    await rejected;

    // The first batch's people would be asked again after 30 seconds, a wait that ends with the second batch's failure.
    expect(postJson).toHaveBeenCalledTimes(2);
  });

  it('asks no more about throttled people once the check is cancelled during the wait, leaving them out as unanswered', async () => {
    const controller = new AbortController();
    const { source, postJson } = photoSource((url) => (url.includes('/busy/') ? 429 : 200), { 'Retry-After': '30' });

    const asked = source.havePhotos(['busy', 'anna'], undefined, controller.signal);
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();

    // The wait of 30 seconds ends with the cancel.
    expect([...(await asked)]).toEqual([['anna', true]]);
    expect(postJson).toHaveBeenCalledOnce();
  });

  it('gives up on a photo that stays throttled, until a later render asks again', async () => {
    const { source, postJson } = photoSource(() => 429);

    const photo = source.getPhotoUrl('busy');
    await vi.runAllTimersAsync();
    await expect(photo).resolves.toBeNull();
    expect(postJson).toHaveBeenCalledTimes(4);

    void source.getPhotoUrl('busy');
    await vi.runAllTimersAsync();
    expect(postJson).toHaveBeenCalledTimes(8);
  });

  describe('with a store for the next visit', () => {
    it('serves what the store keeps, photos and people without one, in one read of it and without asking Graph', async () => {
      const store = storeKeeping(
        new Map([
          ['anna', PHOTO],
          ['erik', null],
        ]),
      );
      const { source, postJson } = photoSource(() => 200, {}, store);

      const photos = [source.getPhotoUrl('anna'), source.getPhotoUrl('erik')];
      await vi.runAllTimersAsync();

      await expect(Promise.all(photos)).resolves.toEqual([PHOTO, null]);
      expect(store.read).toHaveBeenCalledExactlyOnceWith(['anna', 'erik']);
      expect(postJson).not.toHaveBeenCalled();
    });

    it('asks Graph for the rest and keeps its answers, that someone has no photo too, but not a failure', async () => {
      const store = storeKeeping(new Map([['anna', PHOTO]]));
      const { source, postJson } = photoSource((url) => (url.includes('/erik/') ? 404 : url.includes('/ola/') ? 500 : 200), {}, store);

      const photos = ['anna', 'erik', 'ola', 'nora'].map((id) => source.getPhotoUrl(id));
      await vi.runAllTimersAsync();

      await expect(Promise.all(photos)).resolves.toEqual([PHOTO, null, null, PHOTO]);
      expect(askedOf(postJson)).toEqual([['erik', 'ola', 'nora']]);
      expect(store.write).toHaveBeenCalledExactlyOnceWith(
        new Map([
          ['erik', null],
          ['nora', PHOTO],
        ]),
      );
    });

    it('asks Graph again for a throttled photo without reading the store again', async () => {
      const store = storeKeeping();
      const { source, postJson } = photoSource((_url, attempt) => (attempt === 0 ? 429 : 200), { 'Retry-After': '1' }, store);

      const photo = source.getPhotoUrl('busy');
      await vi.runAllTimersAsync();

      await expect(photo).resolves.toBe(PHOTO);
      expect(postJson).toHaveBeenCalledTimes(2);
      expect(store.read).toHaveBeenCalledOnce();
    });

    it('loads from Graph when the store fails, and tells the console once', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const store = storeKeeping();
      store.read.mockRejectedValue(new DOMException('The database is blocked.', 'InvalidStateError'));
      store.write.mockRejectedValue(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
      const { source } = photoSource(() => 200, {}, store);

      const first = source.getPhotoUrl('anna');
      await vi.runAllTimersAsync();
      const second = source.getPhotoUrl('erik');
      await vi.runAllTimersAsync();

      await expect(Promise.all([first, second])).resolves.toEqual([PHOTO, PHOTO]);
      expect(warn).toHaveBeenCalledExactlyOnceWith('Could not read the cached photos.', expect.any(DOMException));
    });

    it('forgets the photos in memory and in the store, and keeps nothing that a batch answers after that', async () => {
      const store = storeKeeping();
      let answer = (): void => undefined;
      const postJson = vi.fn(
        (_path: string, body: BatchRequest) =>
          new Promise((resolve) => {
            const responses = body.requests.map(({ id }) => ({ id, status: 200, headers: { 'content-type': 'image/png' }, body: 'QUJD' }));
            answer = () => {
              resolve({ responses });
            };
          }),
      );
      const source = new GraphPhotoSource({ postJson } as unknown as GraphClient, store);
      const photo = source.getPhotoUrl('anna');
      await vi.advanceTimersByTimeAsync(25);
      expect(postJson).toHaveBeenCalledOnce();

      await source.forget();
      answer();

      await expect(photo).resolves.toBe(PHOTO);
      expect(store.clear).toHaveBeenCalledOnce();
      expect(store.write).not.toHaveBeenCalled();
      // Asked again, the photo comes from Graph anew, without the store.
      const again = source.getPhotoUrl('anna');
      await vi.advanceTimersByTimeAsync(25);
      answer();
      await expect(again).resolves.toBe(PHOTO);
      expect(postJson).toHaveBeenCalledTimes(2);
      expect(store.read).toHaveBeenCalledOnce();
    });

    it('never rejects on forget, even where the browser refuses to delete', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const store = storeKeeping();
      const refusal = new DOMException('The database is blocked.', 'InvalidStateError');
      store.clear.mockRejectedValue(refusal);
      const { source } = photoSource(() => 200, {}, store);

      await expect(source.forget()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledExactlyOnceWith('Could not delete the cached photos.', refusal);
    });
  });
});
