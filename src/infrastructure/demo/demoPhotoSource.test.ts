import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoPhotoSource } from './demoPhotoSource';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const IDS = Array.from({ length: 45 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);

describe('DemoPhotoSource', () => {
  it('says who has a photo 20 people at a time, as Graph does, the same as the photos it draws', async () => {
    const source = new DemoPhotoSource();
    const onProgress = vi.fn();

    const asked = source.havePhotos(IDS, onProgress);
    await vi.runAllTimersAsync();
    const answers = await asked;

    expect(onProgress.mock.calls).toEqual([[20], [40], [45]]);
    expect(answers.size).toBe(45);
    const photos = await Promise.all(IDS.map((id) => source.getPhotoUrl(id)));
    expect(IDS.map((id) => answers.get(id))).toEqual(photos.map((photo) => photo !== null));
    // Two thirds of the demo company have a photo, so some have none.
    expect([...answers.values()]).toContain(false);
  });

  it('stops after the batch under way once the check is cancelled', async () => {
    const source = new DemoPhotoSource();
    const controller = new AbortController();

    const asked = source.havePhotos(IDS, undefined, controller.signal);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.runAllTimersAsync();

    expect((await asked).size).toBe(20);
  });
});
