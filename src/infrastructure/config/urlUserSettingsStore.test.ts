// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { UserSettings } from '@/application/settings/userSettings';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { parseAppConfig } from './appConfig';
import { UrlUserSettingsStore } from './urlUserSettingsStore';

const defaults: UserSettings = {
  hide: { ...SHOW_EVERYONE, guests: true, withoutManager: true, inManagerCycle: true },
  showLevels: true,
  language: 'auto',
  team: null,
  startAt: 'top',
  theme: 'auto',
  textSize: 'standard',
};

function saveAt(address: string, hide: Partial<UserSettings['hide']>, looks: Partial<UserSettings> = {}): string {
  window.history.replaceState(null, '', address);
  new UrlUserSettingsStore(defaults).save({ ...defaults, ...looks, hide: { ...defaults.hide, ...hide } });
  return window.location.pathname + window.location.search + window.location.hash;
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('UrlUserSettingsStore', () => {
  it('writes only what differs from config.json, as ?show= and ?hide=', () => {
    expect(saveAt('/', { guests: false, withoutManager: false, disabledAccounts: true })).toBe(
      '/?show=withoutManager,guests&hide=disabledAccounts',
    );
  });

  it('keeps the rest of the address readable, and leaves no parameter once the settings are config.json\'s again', () => {
    expect(saveAt('/?top=anna@contoso.com,bo@contoso.com&depth=2#x', { guests: false })).toBe(
      '/?top=anna@contoso.com,bo@contoso.com&depth=2&show=guests#x',
    );
    expect(saveAt('/?show=guests&hide=unlicensed&person=anna@contoso.com', {})).toBe('/?person=anna@contoso.com');
  });

  it('leaves how the chart looks and speaks out of the address, so a copied link does not carry it', () => {
    expect(saveAt('/?depth=2', {}, { showLevels: false, language: 'en' })).toBe('/?depth=2');
  });

  it('replaces the history entry, so Back leaves the chart instead of undoing a checkbox', () => {
    const entries = window.history.length;

    saveAt('/', { guests: false });
    saveAt('/', {}, { team: 'lead@contoso.com' });

    expect(window.history.length).toBe(entries);
  });

  it('writes an address that opens the chart with the same rules', () => {
    const json = { dataSource: 'demo', chart: { hide: defaults.hide } };
    const hide = { ...defaults.hide, guests: false, inManagerCycle: false, unattached: true };

    saveAt('/', hide);

    expect(parseAppConfig(json, window.location.search).settings.chart.options.hide).toEqual(hide);
  });

  it('writes the team the chart shows alone as ?team=, readable, and leaves the top persons it narrows alone', () => {
    expect(saveAt('/?top=ceo@contoso.com&person=dev@contoso.com', {}, { team: 'lead@contoso.com' })).toBe(
      '/?top=ceo@contoso.com&person=dev@contoso.com&team=lead@contoso.com',
    );
    expect(saveAt('/?top=ceo@contoso.com&team=lead@contoso.com', { guests: false }, { team: null })).toBe(
      '/?top=ceo@contoso.com&show=guests',
    );
  });

  it('writes the latest settings again into the address of an entry Back went to, and the history\'s state stays', () => {
    window.history.replaceState(null, '', '/?team=lead@contoso.com');
    const store = new UrlUserSettingsStore(defaults);
    store.restore();
    // Before a first change the address is the page's own.
    expect(window.location.search).toBe('?team=lead@contoso.com');

    store.save({ ...defaults, hide: { ...defaults.hide, guests: false } });
    window.history.replaceState({ orgappLayers: 0 }, '', '/?team=lead@contoso.com&depth=2');
    store.restore();

    expect(window.location.search).toBe('?depth=2&show=guests');
    expect(window.history.state).toEqual({ orgappLayers: 0 });
  });

  it('writes an address that opens the chart on the same team', () => {
    saveAt('/', {}, { team: 'lead@contoso.com' });

    const { settings } = parseAppConfig({ dataSource: 'demo' }, window.location.search);
    expect(settings.chart.team).toBe('lead@contoso.com');
    // The team narrows the chart only as the page builds it, so that Show everyone goes back to these options.
    expect(settings.chart.options.topPersons).toEqual([]);
  });
});
