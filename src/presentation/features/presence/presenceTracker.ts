import { PresenceUnavailableError } from '@/application/abstractions/presenceSource';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { Presence } from '@/domain/presence/presence';

/** How often the people on screen are refreshed; Graph allows 1,500 presence requests per 30 s per tenant. */
export const POLL_MS = 60_000;
/** Up to this much more is waited at random, so that pages opened together don't keep asking Graph at the same moment. */
export const POLL_JITTER_MS = 5_000;
/** Without pointer, key or touch input for this long nobody seems to be there, and the polls pause until the next input. */
export const IDLE_MS = 10 * 60_000;
/** Each busy answer in a row doubles the wait, up to this. */
export const MAX_BUSY_WAIT_MS = 16 * 60_000;
/** Cards scrolled into view together are fetched in one request. */
const COLLECT_MS = 300;
/** Someone at the page; a wheel scrolls or zooms the chart. */
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const;
/** Captured, so that no handler that stops an event hides it from the tracker. */
const LISTENING = { capture: true, passive: true } as const;

type Load = (ids: readonly string[]) => Promise<ReadonlyMap<string, Presence>>;

/** 'needsConsent' and 'denied' mirror PresenceUnavailableError's reasons; nothing is fetched in either. */
export type PresenceStatus = 'active' | 'needsConsent' | 'denied';

/** Shared by every avatar: watched people are fetched shortly after they appear, then about every POLL_MS while someone looks. */
export class PresenceTracker {
  private readonly watchers = new Map<string, number>();
  private readonly presences = new Map<string, Presence>();
  private readonly listeners = new Set<() => void>();
  private readonly unfetched = new Set<string>();
  private collectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the polls and the listeners run; watching starts them again after dispose. */
  private polling = false;
  /** Set where a poll found the page hidden or nobody at it; the next input, or the page shown again, polls at once. */
  private paused = false;
  private lastInput = 0;
  /** Busy answers in a row, each of which doubles the wait for the next poll. */
  private busyAnswers = 0;
  private presenceStatus: PresenceStatus = 'active';

  constructor(
    private readonly load: Load,
    private readonly now: () => number = () => Date.now(),
    private readonly random: () => number = () => Math.random(),
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  get(id: string): Presence | undefined {
    return this.presences.get(id);
  }

  get status(): PresenceStatus {
    return this.presenceStatus;
  }

  /** Starts again after the user consented, fetching everyone who is watched. */
  retry(): void {
    if (this.presenceStatus === 'active') return;
    this.presenceStatus = 'active';
    for (const id of this.watchers.keys()) this.unfetched.add(id);
    this.collect();
    this.startPolling();
    this.emit();
  }

  watch(id: string): () => void {
    const count = this.watchers.get(id) ?? 0;
    this.watchers.set(id, count + 1);
    if (count === 0 && !this.presences.has(id)) {
      this.unfetched.add(id);
      this.collect();
    }
    this.startPolling();
    return () => {
      const remaining = (this.watchers.get(id) ?? 1) - 1;
      if (remaining > 0) this.watchers.set(id, remaining);
      else this.watchers.delete(id);
    };
  }

  /** Stops the timers and the listening; watching again restarts them. */
  dispose(): void {
    if (this.collectTimer) clearTimeout(this.collectTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.collectTimer = null;
    this.pollTimer = null;
    this.paused = false;
    if (!this.polling) return;
    this.polling = false;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    for (const type of INPUT_EVENTS) window.removeEventListener(type, this.onInput, LISTENING);
  }

  private collect(): void {
    if (this.presenceStatus !== 'active') return;
    this.collectTimer ??= setTimeout(() => {
      this.collectTimer = null;
      const ids = [...this.unfetched].filter((id) => this.watchers.has(id));
      this.unfetched.clear();
      void this.fetch(ids);
    }, COLLECT_MS);
  }

  private startPolling(): void {
    if (this.polling || this.presenceStatus !== 'active') return;
    this.polling = true;
    // The page has just shown the people, so someone is there.
    this.lastInput = this.now();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    for (const type of INPUT_EVENTS) window.addEventListener(type, this.onInput, LISTENING);
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const wait = this.busyAnswers === 0 ? POLL_MS : Math.min(POLL_MS * 2 ** this.busyAnswers, MAX_BUSY_WAIT_MS);
    this.pollTimer = setTimeout(this.poll, wait + this.random() * POLL_JITTER_MS);
  }

  private readonly poll = (): void => {
    this.pollTimer = null;
    if (document.visibilityState !== 'visible' || this.now() - this.lastInput >= IDLE_MS) {
      this.paused = true;
      return;
    }
    void this.fetch([...this.watchers.keys()]).then(() => {
      // Unless disposed meanwhile, as when presence turned out to be unavailable, or started again with a poll of its own.
      if (this.polling && !this.pollTimer) this.scheduleNext();
    });
  };

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.poll();
  }

  private readonly onInput = (): void => {
    this.lastInput = this.now();
    this.resume();
  };

  /** Coming back to the page means someone is there, and a poll that found it hidden waits for that. */
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return;
    this.lastInput = this.now();
    this.resume();
  };

  private async fetch(ids: readonly string[]): Promise<void> {
    if (ids.length === 0 || this.presenceStatus !== 'active') return;
    try {
      const result = await this.load(ids);
      this.busyAnswers = 0;
      let changed = false;
      for (const [id, presence] of result) {
        if (isSamePresence(this.presences.get(id), presence)) continue;
        this.presences.set(id, presence);
        changed = true;
      }
      if (!changed) return;
    } catch (error) {
      // Graph throttles the whole tenant, so asking again soon would only add to it.
      if (error instanceof ServiceError && error.failure === 'busy') this.busyAnswers++;
      if (!(error instanceof PresenceUnavailableError)) return; // Kept as is until the next poll.
      this.presenceStatus = error.reason === 'consent' ? 'needsConsent' : 'denied';
      this.dispose();
      this.presences.clear();
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Every field is a plain value, so this sees a change in any of them, also in one added later. */
function isSamePresence(known: Presence | undefined, next: Presence): boolean {
  return known !== undefined && (Object.keys(next) as (keyof Presence)[]).every((key) => known[key] === next[key]);
}
