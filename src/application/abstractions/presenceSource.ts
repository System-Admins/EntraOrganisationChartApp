import type { Presence } from '@/domain/presence/presence';

/** 'consent': nobody has consented to Presence.Read.All yet. 'denied': Graph refuses even so. */
export class PresenceUnavailableError extends Error {
  constructor(
    readonly reason: 'consent' | 'denied',
    options?: ErrorOptions,
  ) {
    super('Teams presence is not available.', options);
    this.name = 'PresenceUnavailableError';
  }
}

export interface PresenceSource {
  /** Anyone the source has no answer for is left out. */
  getPresences(ids: readonly string[]): Promise<ReadonlyMap<string, Presence>>;
}
