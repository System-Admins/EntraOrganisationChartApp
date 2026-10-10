import type { Language } from '@/application/settings/language';
import type { Presence } from '@/domain/presence/presence';
import { PRESENCE_STRINGS } from './strings';

/** For example "Busy · In a meeting", or "Out of office · Offline"; "Status unknown" only where nothing else is known. */
export function describePresence(presence: Presence, language: Language): string {
  const { availability, activity } = PRESENCE_STRINGS[language];
  const activities: Readonly<Record<string, string | undefined>> = activity;
  const current = presence.activity === null ? null : (activities[presence.activity] ?? spaced(presence.activity));
  const known = presence.availability === 'unknown' ? null : availability[presence.availability];
  const parts = [presence.outOfOffice ? activity.OutOfOffice : null, known, current].filter((part): part is string => part !== null);
  return parts.length === 0 ? availability.unknown : [...new Set(parts)].join(' · ');
}

/** The dot's colour follows Teams: out of office wins over the availability. */
export function presenceTone(presence: Presence): 'available' | 'busy' | 'doNotDisturb' | 'away' | 'offline' | 'outOfOffice' | null {
  if (presence.outOfOffice) return 'outOfOffice';
  return presence.availability === 'unknown' ? null : presence.availability;
}

function spaced(identifier: string): string {
  const words = identifier.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
