// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { UserSettings } from '@/application/settings/userSettings';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { BrowserChartEmbedding } from './browserChartEmbedding';

/** config.json's: guests hidden. */
const defaults: UserSettings = {
  hide: { ...SHOW_EVERYONE, guests: true },
  showLevels: false,
  language: 'auto',
  team: null,
  startAt: 'top',
  theme: 'auto',
  textSize: 'standard',
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('BrowserChartEmbedding', () => {
  it('writes the filters and the team as the address holds them, beside its top persons, without the person open', () => {
    window.history.replaceState(null, '', '/?top=ceo@contoso.com&person=anna@contoso.com&depth=2');

    const address = new BrowserChartEmbedding(defaults).address({
      ...defaults,
      hide: { ...defaults.hide, guests: false, disabledAccounts: true },
      team: 'lead@contoso.com',
      showLevels: true,
    });

    expect(address).toBe(`${window.location.origin}/?top=ceo@contoso.com&team=lead@contoso.com&show=guests&hide=disabledAccounts`);
  });

  it('follows the settings over an address that still names a team and filters the person has left since', () => {
    window.history.replaceState(null, '', '/?show=guests&team=lead@contoso.com');

    expect(new BrowserChartEmbedding(defaults).address(defaults)).toBe(`${window.location.origin}/`);
  });
});
