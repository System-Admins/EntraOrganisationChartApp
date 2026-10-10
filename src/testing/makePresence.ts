import type { Presence } from '@/domain/presence/presence';

/** Test fixture: Available, with no activity, note, automatic reply or work location unless the overrides give them. */
export function makePresence(overrides: Partial<Presence> = {}): Presence {
  return {
    availability: 'available',
    activity: null,
    outOfOffice: false,
    outOfOfficeMessage: null,
    statusMessage: null,
    workLocation: null,
    ...overrides,
  };
}
