import { describe, expect, it } from 'vitest';
import type { ChartView, SavedView, ViewStateStore } from '@/application/abstractions/viewStateStore';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { ForgetViewCommand, ForgetViewHandler } from './forgetView';
import { GetSavedViewHandler, GetSavedViewQuery, RECENT_VIEW_MS } from './getSavedView';
import { SaveViewCommand, SaveViewHandler } from './saveView';
import { viewScope } from './viewScope';

/** A store in memory, a view per scope. */
function storeOf(): ViewStateStore & { readonly views: Map<string, SavedView> } {
  const views = new Map<string, SavedView>();
  return {
    views,
    get: (scope) => views.get(scope) ?? null,
    save: (scope, view) => {
      views.set(scope, view);
    },
    remove: (scope) => {
      views.delete(scope);
    },
    forget: () => Promise.resolve(),
  };
}

const VIEW: ChartView = { depth: 1, toggled: [['lead', true]], selectedId: 'dev', currentId: 'dev' };
const EVERYONE: OrgChartOptions = { topPersons: ['ceo@contoso.com'], hide: SHOW_EVERYONE };
const SAVED_AT = new Date(2026, 9, 1, 9, 0).getTime();

describe('viewScope', () => {
  it('tells charts apart by their top persons and those of the chart they narrow, in any letter case', () => {
    const team: OrgChartOptions = { topPersons: ['lead@contoso.com'], hide: { ...SHOW_EVERYONE, unattached: true }, within: EVERYONE };

    expect(viewScope(team)).not.toBe(viewScope(EVERYONE));
    expect(viewScope({ ...team, topPersons: [' Lead@Contoso.com'] })).toBe(viewScope(team));
    expect(viewScope({ topPersons: [], hide: SHOW_EVERYONE })).not.toBe(viewScope(EVERYONE));
  });

  it('keeps one scope for a chart whatever its filters, as a view outlives them', () => {
    expect(viewScope({ ...EVERYONE, hide: { ...SHOW_EVERYONE, guests: true } })).toBe(viewScope(EVERYONE));
  });
});

describe('SaveViewHandler and GetSavedViewHandler', () => {
  const saveAt = (store: ViewStateStore, options: OrgChartOptions) =>
    new SaveViewHandler(store, () => SAVED_AT).handle(new SaveViewCommand(options, VIEW));
  const askAt = (store: ViewStateStore, minutesLater: number, startAt: GetSavedViewQuery['startAt'] = 'top') =>
    new GetSavedViewHandler(store, () => SAVED_AT + minutesLater * 60_000).handle(new GetSavedViewQuery(EVERYONE, startAt));

  it('save the view with the time it was saved, under the scope of its chart', async () => {
    const store = storeOf();

    await saveAt(store, EVERYONE);

    expect(store.views.get(viewScope(EVERYONE))).toEqual({ ...VIEW, savedAt: new Date(SAVED_AT) });
  });

  it('open with a view left less than 30 minutes ago, whatever the person chose', async () => {
    const store = storeOf();
    await saveAt(store, EVERYONE);

    expect(await askAt(store, 29, 'top')).toMatchObject(VIEW);
    expect(await askAt(store, 29, 'me')).toMatchObject(VIEW);
    expect(RECENT_VIEW_MS).toBe(30 * 60_000);
  });

  it('open with an older view only for someone who starts where they left off', async () => {
    const store = storeOf();
    await saveAt(store, EVERYONE);

    expect(await askAt(store, 30, 'top')).toBeNull();
    expect(await askAt(store, 30, 'me')).toBeNull();
    expect(await askAt(store, 60 * 24 * 7, 'lastView')).toMatchObject(VIEW);
  });

  it('take a view saved by a clock ahead of this one for an old one', async () => {
    const store = storeOf();
    await saveAt(store, EVERYONE);

    expect(await askAt(store, -5, 'top')).toBeNull();
    expect(await askAt(store, -5, 'lastView')).toMatchObject(VIEW);
  });

  it('open with no view where none was saved for the chart, as for a team saved on its own', async () => {
    const store = storeOf();
    await saveAt(store, { topPersons: ['lead@contoso.com'], hide: SHOW_EVERYONE, within: EVERYONE });

    expect(await askAt(store, 1, 'lastView')).toBeNull();
  });

  it('open with no view once the logo has forgotten it, which leaves the other charts\' views alone', async () => {
    const store = storeOf();
    const team: OrgChartOptions = { topPersons: ['lead@contoso.com'], hide: SHOW_EVERYONE, within: EVERYONE };
    await saveAt(store, EVERYONE);
    await saveAt(store, team);

    await new ForgetViewHandler(store).handle(new ForgetViewCommand({ ...EVERYONE, hide: { ...SHOW_EVERYONE, guests: true } }));

    expect(await askAt(store, 1, 'lastView')).toBeNull();
    expect(store.views.has(viewScope(team))).toBe(true);
  });
});
