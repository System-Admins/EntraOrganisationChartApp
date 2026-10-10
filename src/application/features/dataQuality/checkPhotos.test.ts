import { describe, expect, it, vi } from 'vitest';
import type { EmployeePhotos } from '@/application/abstractions/employeePhotos';
import { CheckPhotosCommand, CheckPhotosHandler } from './checkPhotos';
import { PhotoAnswers } from './photoAnswers';

/** A photo source that answers for everyone but `unanswered`, a photo for those not in `without`. */
function photoSource({ without = [] as readonly string[], unanswered = [] as readonly string[] } = {}) {
  const havePhotos = vi.fn<EmployeePhotos['havePhotos']>((employeeIds, onProgress) => {
    onProgress?.(employeeIds.length);
    return Promise.resolve(
      new Map(employeeIds.filter((id) => !unanswered.includes(id)).map((id) => [id, !without.includes(id)] as const)),
    );
  });
  const photos: EmployeePhotos = { forget: () => Promise.resolve(), getPhotoUrl: () => Promise.resolve(null), havePhotos };
  return { photos, havePhotos };
}

describe('CheckPhotosHandler', () => {
  it('asks about the people, keeps the answers for the session, and says how many have none', async () => {
    const answers = new PhotoAnswers();
    const { photos, havePhotos } = photoSource({ without: ['erik'], unanswered: ['ola'] });
    const onProgress = vi.fn();
    const signal = new AbortController().signal;

    const result = await new CheckPhotosHandler(photos, answers).handle(
      new CheckPhotosCommand(['anna', 'erik', 'ola'], onProgress, signal),
    );

    expect(result).toEqual({ answered: 2, withoutPhoto: 1 });
    expect([...answers.answers]).toEqual([
      ['anna', true],
      ['erik', false],
    ]);
    expect(havePhotos).toHaveBeenCalledExactlyOnceWith(['anna', 'erik', 'ola'], expect.any(Function), signal);
    expect(onProgress.mock.calls).toEqual([[0], [3]]);
  });

  it('asks only about the people without an answer yet, counting the others as checked', async () => {
    const answers = new PhotoAnswers();
    answers.keep(new Map([['anna', false]]));
    const { photos, havePhotos } = photoSource();
    const onProgress = vi.fn();

    const result = await new CheckPhotosHandler(photos, answers).handle(new CheckPhotosCommand(['anna', 'erik'], onProgress));

    expect(havePhotos.mock.calls[0]?.[0]).toEqual(['erik']);
    expect(onProgress.mock.calls).toEqual([[1], [2]]);
    expect(result).toEqual({ answered: 2, withoutPhoto: 1 });
  });

  it('keeps the answers a cancelled check found, and asks the rest next time', async () => {
    const answers = new PhotoAnswers();
    const controller = new AbortController();
    const havePhotos = vi.fn<EmployeePhotos['havePhotos']>((employeeIds) => {
      controller.abort();
      // The source answers for those asked before the abort and leaves out the others.
      return Promise.resolve(new Map([[employeeIds[0] ?? '', true]]));
    });
    const handler = new CheckPhotosHandler({ forget: () => Promise.resolve(), getPhotoUrl: () => Promise.resolve(null), havePhotos }, answers);

    const result = await handler.handle(new CheckPhotosCommand(['anna', 'erik', 'ola'], undefined, controller.signal));
    expect(result).toEqual({ answered: 1, withoutPhoto: 0 });
    await handler.handle(new CheckPhotosCommand(['anna', 'erik', 'ola']));

    expect(havePhotos.mock.calls[1]?.[0]).toEqual(['erik', 'ola']);
  });

  it('keeps nothing from a check that failed, so a later one asks again', async () => {
    const answers = new PhotoAnswers();
    const failure = new Error('Microsoft Graph could not be reached.');
    const photos: EmployeePhotos = {
      forget: () => Promise.resolve(),
      getPhotoUrl: () => Promise.resolve(null),
      havePhotos: () => Promise.reject(failure),
    };

    await expect(new CheckPhotosHandler(photos, answers).handle(new CheckPhotosCommand(['anna']))).rejects.toBe(failure);
    expect(answers.answers.size).toBe(0);
  });
});
