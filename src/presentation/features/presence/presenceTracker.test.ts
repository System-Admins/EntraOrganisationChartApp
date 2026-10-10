// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceUnavailableError } from '@/application/abstractions/presenceSource';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { Presence } from '@/domain/presence/presence';
import { makePresence } from '@/testing/makePresence';
import { IDLE_MS, MAX_BUSY_WAIT_MS, POLL_JITTER_MS, POLL_MS, PresenceTracker } from './presenceTracker';

const busy = makePresence({ availability: 'busy' });

type Load = (ids: readonly string[]) => Promise<ReadonlyMap<string, Presence>>;

/** Every tracker a test made, which stops listening on the window once the test is over. */
const made: PresenceTracker[] = [];

/** `random` picks the extra wait of each poll; none without it, so that polls come every POLL_MS. */
function tracker(load = vi.fn<Load>((ids) => Promise.resolve(new Map(ids.map((id) => [id, busy])))), random = () => 0) {
  const created = new PresenceTracker(load, () => Date.now(), random);
  made.push(created);
  return { tracker: created, load };
}

let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  for (const created of made.splice(0)) created.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PresenceTracker', () => {
  it('fetches people who appear together in one request and tells subscribers', async () => {
    const { tracker: presence, load } = tracker();
    const listener = vi.fn();
    presence.subscribe(listener);

    presence.watch('a');
    presence.watch('b');
    await vi.advanceTimersByTimeAsync(400);

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(['a', 'b']);
    expect(presence.get('a')).toEqual(busy);
    expect(listener).toHaveBeenCalled();
    presence.dispose();
  });

  it('refreshes only the people still watched, and only while the page is visible', async () => {
    const { tracker: presence, load } = tracker();
    const stopA = presence.watch('a');
    presence.watch('b');
    await vi.advanceTimersByTimeAsync(400);
    stopA();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(load).toHaveBeenLastCalledWith(['b']);

    visibility = 'hidden';
    const calls = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(load.mock.calls.length).toBe(calls);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(load.mock.calls.length).toBe(calls + 1);
    presence.dispose();
  });

  it('stops for good and clears everything when presence is not available', async () => {
    const load = vi.fn<Load>(() => Promise.reject(new PresenceUnavailableError('consent')));
    const { tracker: presence } = tracker(load);

    presence.watch('a');
    await vi.advanceTimersByTimeAsync(400);
    presence.watch('b');
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(load).toHaveBeenCalledTimes(1);
    expect(presence.get('a')).toBeUndefined();
    expect(presence.status).toBe('needsConsent');
  });

  it('fetches everyone watched again after consent', async () => {
    const load = vi
      .fn<Load>()
      .mockRejectedValueOnce(new PresenceUnavailableError('consent'))
      .mockResolvedValue(new Map([['a', busy]]));
    const { tracker: presence } = tracker(load);
    presence.watch('a');
    await vi.advanceTimersByTimeAsync(400);

    presence.retry();
    await vi.advanceTimersByTimeAsync(400);

    expect(presence.status).toBe('active');
    expect(presence.get('a')).toEqual(busy);
    presence.dispose();
  });

  it('keeps the last known presence when a refresh fails for another reason', async () => {
    const load = vi
      .fn<Load>()
      .mockResolvedValueOnce(new Map([['a', busy]]))
      .mockRejectedValue(new Error('network'));
    const { tracker: presence } = tracker(load);

    presence.watch('a');
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(load).toHaveBeenCalledTimes(2);
    expect(presence.get('a')).toEqual(busy);
    presence.dispose();
  });

  it('keeps an unchanged status as it is, so nobody re-renders, and tells subscribers about changes', async () => {
    let availability: Presence['availability'] = 'busy';
    const { tracker: presence, load } = tracker(
      vi.fn<Load>((ids) => Promise.resolve(new Map(ids.map((id) => [id, { ...busy, availability }])))),
    );
    presence.watch('a');
    await vi.advanceTimersByTimeAsync(400);
    const first = presence.get('a');
    const listener = vi.fn();
    presence.subscribe(listener);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(load).toHaveBeenCalledTimes(2);
    expect(presence.get('a')).toBe(first);
    expect(listener).not.toHaveBeenCalled();

    availability = 'away';
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(presence.get('a')?.availability).toBe('away');
    expect(listener).toHaveBeenCalledTimes(1);
    presence.dispose();
  });

  it('tells subscribers when only the note, the automatic reply or the work location changes', async () => {
    let current = busy;
    const { tracker: presence } = tracker(vi.fn<Load>((ids) => Promise.resolve(new Map(ids.map((id) => [id, current])))));
    presence.watch('a');
    await vi.advanceTimersByTimeAsync(400);
    const listener = vi.fn();
    presence.subscribe(listener);
    const changes: Partial<Presence>[] = [{ statusMessage: 'Back at noon' }, { outOfOfficeMessage: 'On holiday' }, { workLocation: 'remote' }];

    for (const [index, change] of changes.entries()) {
      current = { ...current, ...change };
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(listener).toHaveBeenCalledTimes(index + 1);
    }
    expect(presence.get('a')).toEqual(
      makePresence({ availability: 'busy', statusMessage: 'Back at noon', outOfOfficeMessage: 'On holiday', workLocation: 'remote' }),
    );
    presence.dispose();
  });

  describe('when nobody is there', () => {
    it('pauses after ten minutes without input, and polls at once on the next', async () => {
      const { tracker: presence, load } = tracker();
      presence.watch('a');
      await vi.advanceTimersByTimeAsync(400);
      // Input a minute in: the ten minutes count from there.
      await vi.advanceTimersByTimeAsync(POLL_MS - 400);
      window.dispatchEvent(new Event('pointermove'));

      await vi.advanceTimersByTimeAsync(IDLE_MS);
      const polled = load.mock.calls.length;
      expect(polled).toBe(11);
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
      expect(load).toHaveBeenCalledTimes(polled);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      await vi.advanceTimersByTimeAsync(0);
      expect(load).toHaveBeenCalledTimes(polled + 1);
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(load).toHaveBeenCalledTimes(polled + 2);
    });

    it.each(['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'])('takes %s for someone being there', async (type) => {
      const { tracker: presence, load } = tracker();
      presence.watch('a');
      await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS);
      const polled = load.mock.calls.length;

      // Even where a handler on the way stops the event.
      const button = document.body.appendChild(document.createElement('button'));
      button.addEventListener(type, (event) => {
        event.stopPropagation();
      });
      button.dispatchEvent(new Event(type, { bubbles: true }));
      button.remove();
      await vi.advanceTimersByTimeAsync(0);

      expect(load).toHaveBeenCalledTimes(polled + 1);
    });

    it('takes the page shown again for someone coming back', async () => {
      const { tracker: presence, load } = tracker();
      presence.watch('a');
      await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS);
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      const polled = load.mock.calls.length;

      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);

      expect(load).toHaveBeenCalledTimes(polled + 1);
    });

    it('stops listening for input once disposed, as there is nothing left to poll', async () => {
      const { tracker: presence, load } = tracker();
      presence.watch('a');
      await vi.advanceTimersByTimeAsync(IDLE_MS + POLL_MS);
      const polled = load.mock.calls.length;

      presence.dispose();
      window.dispatchEvent(new Event('pointerdown'));
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);

      expect(load).toHaveBeenCalledTimes(polled);
    });
  });

  it('waits a little longer at random, so that pages opened together part ways', async () => {
    const { tracker: presence, load } = tracker(undefined, () => 1);
    presence.watch('a');
    await vi.advanceTimersByTimeAsync(400);

    await vi.advanceTimersByTimeAsync(POLL_MS + POLL_JITTER_MS - 401);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('waits twice as long after each busy answer in a row, up to a limit, and a minute again after an answer', async () => {
    const throttled = new ServiceError('busy', 'Microsoft Graph request failed (429): Too many requests');
    const start = Date.now();
    const askedAt: number[] = [];
    let answer = 0;
    const load = vi.fn<Load>(() => {
      askedAt.push(Date.now() - start);
      // The first fetch is answered, the five polls after it are throttled, and the rest are answered again.
      answer++;
      return answer >= 2 && answer <= 6 ? Promise.reject(throttled) : Promise.resolve(new Map([['a', busy]]));
    });
    const { tracker: presence } = tracker(load);
    presence.watch('a');

    // Someone uses the page all the while, so it never pauses.
    for (let minute = 0; minute < 48; minute++) {
      window.dispatchEvent(new Event('pointermove'));
      await vi.advanceTimersByTimeAsync(60_000);
    }

    const polls = askedAt.slice(1);
    expect(polls.slice(1).map((at, index) => at - (polls[index] ?? 0))).toEqual([
      POLL_MS * 2,
      POLL_MS * 4,
      POLL_MS * 8,
      MAX_BUSY_WAIT_MS,
      MAX_BUSY_WAIT_MS,
      POLL_MS,
    ]);
  });
});
