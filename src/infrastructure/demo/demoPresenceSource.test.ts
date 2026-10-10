import { describe, expect, it } from 'vitest';
import type { Presence } from '@/domain/presence/presence';
import { CHANGE_EVERY_MS, DemoPresenceSource } from './demoPresenceSource';

describe('DemoPresenceSource', () => {
  it('cycles a person through statuses with every detail the panel shows: a note, an automatic reply and work locations', async () => {
    let now = 0;
    const source = new DemoPresenceSource(() => now);
    const seen: Presence[] = [];
    for (let period = 0; period < 20; period++) {
      now = period * CHANGE_EVERY_MS;
      const presence = (await source.getPresences(['ase'])).get('ase');
      if (presence) seen.push(presence);
    }

    expect(seen).toHaveLength(20);
    const replies = seen.filter((presence) => presence.outOfOfficeMessage !== null);
    expect(replies.length).toBeGreaterThan(0);
    // Graph has a reply only while the person is out of office.
    expect(replies.every((presence) => presence.outOfOffice)).toBe(true);
    expect(seen.some((presence) => presence.statusMessage !== null)).toBe(true);
    expect(new Set(seen.map((presence) => presence.workLocation))).toEqual(new Set(['office', 'remote', 'timeOff', null]));
  });
});
