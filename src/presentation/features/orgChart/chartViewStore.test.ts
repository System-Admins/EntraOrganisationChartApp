import { describe, expect, it, vi } from 'vitest';
import { SAVED_TOGGLES_LIMIT, type ChartView } from '@/application/abstractions/viewStateStore';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { ChartViewStore } from './chartViewStore';
import { headingKey, revealTargetOf, showMoreKey } from './treeItems';

const CHART = buildOrgChart(
  [makeEmployee('ceo'), makeEmployee('lead', 'ceo'), makeEmployee('dev', 'lead'), makeEmployee('aide', 'ceo')],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

/** `count` people named in order, `prefix001` on, under `managerId`, or without a manager. */
const crowd = (prefix: string, count: number, managerId: string | null): Employee[] =>
  Array.from({ length: count }, (_, index) => makeEmployee(`${prefix}${String(index + 1).padStart(3, '0')}`, managerId));

/** A lead with 120 agents, more than two pages, and 60 people without a manager, more than a heading opens with. */
const CROWDED = buildOrgChart(
  [makeEmployee('ceo'), makeEmployee('lead', 'ceo'), ...crowd('agent', 120, 'lead'), ...crowd('stray', 60, null)],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

const STRAYS = headingKey('noManager');

describe('ChartViewStore', () => {
  it('expands nodes above the default depth until they are toggled', () => {
    const store = new ChartViewStore(1);

    expect(store.isExpanded('ceo', 0)).toBe(true);
    expect(store.isExpanded('director', 1)).toBe(false);

    store.activate('ceo', 0, true);

    expect(store.isExpanded('ceo', 0)).toBe(false);
  });

  it('tells why each click asks for focus, with a new request every time', () => {
    const store = new ChartViewStore(0);

    store.activate('lead', 1, true);
    const unfold = store.focusRequest;
    store.activate('lead', 1, true);
    const fold = store.focusRequest;
    store.activate('dev', 2, false);

    expect(unfold).toMatchObject({ id: 'lead', reason: 'expand' });
    expect(fold).toMatchObject({ id: 'lead', reason: 'collapse' });
    expect(store.focusRequest).toMatchObject({ id: 'dev', reason: 'select' });
    expect(fold?.sequence).toBeGreaterThan(unfold?.sequence ?? Infinity);
    expect(store.isExpanded('dev', 2)).toBe(false);
    expect(store.selectedId).toBe('dev');
  });

  it('reveals a person by expanding their ancestors and selecting them', () => {
    const store = new ChartViewStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.revealEmployee({ id: 'dev', ancestorIds: ['ceo', 'lead'] });

    expect(store.isExpanded('ceo', 0)).toBe(true);
    expect(store.isExpanded('lead', 1)).toBe(true);
    expect(store.focusRequest).toMatchObject({ id: 'dev', reason: 'reveal' });
    expect(store.selectedId).toBe('dev');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('reveals a person past a page by showing that page, and one under a folded heading by unfolding it', () => {
    const store = new ChartViewStore(1);

    store.revealEmployee(revealTargetOf(CROWDED, 'agent117'));
    expect(store.shownCount('lead')).toBe(150);
    expect(store.isExpanded('lead', 1)).toBe(true);

    expect(store.isGroupExpanded(STRAYS, 60)).toBe(false);
    store.revealEmployee(revealTargetOf(CROWDED, 'stray055'));
    expect(store.isGroupExpanded(STRAYS, 60)).toBe(true);
    expect(store.shownCount(STRAYS)).toBe(100);
    expect(store.selectedId).toBe('stray055');
    expect(store.currentId).toBe('stray055');
  });

  it('never narrows a page that someone showed more of', () => {
    const store = new ChartViewStore(2);
    store.showMore(CROWDED, 'lead');
    store.showMore(CROWDED, 'lead');

    store.revealEmployee(revealTargetOf(CROWDED, 'agent060'));

    expect(store.shownCount('lead')).toBe(150);
  });

  it('shows the next page of a list, with the focus on the first person it adds, and selects nobody', () => {
    const store = new ChartViewStore(2);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.shownCount('lead')).toBe(50);

    store.showMore(CROWDED, 'lead');

    expect(store.shownCount('lead')).toBe(100);
    expect(store.currentId).toBe('agent051');
    expect(store.focusRequest).toMatchObject({ id: 'agent051', reason: 'showMore' });
    expect(store.selectedId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);

    store.showMore(CROWDED, STRAYS);
    expect(store.shownCount(STRAYS)).toBe(100);
    expect(store.currentId).toBe('stray051');
  });

  it('shows no further page of a list that its page already shows whole', () => {
    const store = new ChartViewStore(2);
    const listener = vi.fn();
    store.subscribe(listener);

    store.showMore(CHART, 'ceo');

    expect(store.shownCount('ceo')).toBe(50);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unfolds a heading over a group that one page holds, folds one over more, and toggles it without selecting anyone', () => {
    const store = new ChartViewStore(1);
    expect(store.isGroupExpanded(STRAYS, 50)).toBe(true);
    expect(store.isGroupExpanded(STRAYS, 51)).toBe(false);

    store.toggleGroup(STRAYS, 60);
    const unfold = store.focusRequest;
    expect(store.isGroupExpanded(STRAYS, 60)).toBe(true);
    store.toggleGroup(STRAYS, 60);

    expect(unfold).toMatchObject({ id: STRAYS, reason: 'expand' });
    expect(store.focusRequest).toMatchObject({ id: STRAYS, reason: 'collapse' });
    expect(store.isGroupExpanded(STRAYS, 60)).toBe(false);
    expect(store.currentId).toBe(STRAYS);
    expect(store.selectedId).toBeNull();
  });

  it('forgets the teams\' pages with Expand all or Collapse all, and leaves a heading and its page as they were', () => {
    const store = new ChartViewStore(1);
    store.toggleGroup(STRAYS, 60);
    store.showMore(CROWDED, STRAYS);
    store.toggle('lead', 1);
    store.showMore(CROWDED, 'lead');

    store.expandToDepth(0);

    expect(store.shownCount('lead')).toBe(50);
    expect(store.isExpanded('lead', 1)).toBe(false);
    expect(store.isGroupExpanded(STRAYS, 60)).toBe(true);
    expect(store.shownCount(STRAYS)).toBe(100);
  });

  it('restarts with the headings and the pages as the chart opens', () => {
    const store = new ChartViewStore(1);
    store.toggleGroup(STRAYS, 10);
    store.showMore(CROWDED, STRAYS);

    store.restart(1);

    expect(store.isGroupExpanded(STRAYS, 10)).toBe(true);
    expect(store.shownCount(STRAYS)).toBe(50);
  });

  it('opens the first chart on a linked person without notifying anyone, and only the first', () => {
    const store = new ChartViewStore(1);
    const listener = vi.fn();
    store.subscribe(listener);

    store.startFrom(0, { id: 'dev', ancestorIds: ['ceo', 'lead'] });
    store.startFrom(2, { id: 'other', ancestorIds: ['boss'] });

    expect(store.isExpanded('ceo', 0)).toBe(true);
    expect(store.isExpanded('lead', 1)).toBe(true);
    expect(store.isExpanded('peer', 1)).toBe(false);
    expect(store.isExpanded('boss', 0)).toBe(false);
    expect(store.selectedId).toBe('dev');
    expect(store.currentId).toBe('dev');
    expect(store.focusRequest).toMatchObject({ id: 'dev', reason: 'reveal' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('folds and unfolds from the report badge without selecting anyone', () => {
    const store = new ChartViewStore(0);

    store.toggle('lead', 1);
    const unfold = store.focusRequest;
    store.toggle('lead', 1);

    expect(unfold).toMatchObject({ id: 'lead', reason: 'expand' });
    expect(store.focusRequest).toMatchObject({ id: 'lead', reason: 'collapse' });
    expect(store.isExpanded('lead', 1)).toBe(false);
    expect(store.selectedId).toBeNull();
    expect(store.currentId).toBe('lead');
  });

  it('unfolds several teams at once, keeping the card it was asked from current and in view, and selects nobody', () => {
    const store = new ChartViewStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.expandMany(['lead', 'peer'], 'dev');

    expect(store.isExpanded('lead', 1)).toBe(true);
    expect(store.isExpanded('peer', 1)).toBe(true);
    expect(store.isExpanded('other', 1)).toBe(false);
    expect(store.currentId).toBe('dev');
    expect(store.focusRequest).toMatchObject({ id: 'dev', reason: 'expandMany' });
    expect(store.selectedId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('changes nothing, and tells nobody, when there is no team to unfold', () => {
    const store = new ChartViewStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.expandMany([], 'dev');

    expect(store.currentId).toBeNull();
    expect(store.focusRequest).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });

  it('restarts from the start: nobody selected, folded to the depth, the top persons centred', () => {
    const store = new ChartViewStore(0);
    store.activate('lead', 1, true);

    store.restart(0);

    expect(store.selectedId).toBeNull();
    expect(store.isExpanded('lead', 1)).toBe(false);
    expect(store.focusRequest).toMatchObject({ reason: 'overview' });
  });

  it('restarts a chart narrowed to one team with its head\'s details open, telling the listeners once', () => {
    const store = new ChartViewStore(0);
    store.revealEmployee({ id: 'dev', ancestorIds: ['ceo', 'lead'] });
    const listener = vi.fn();
    store.subscribe(listener);

    store.restart(1, 'lead');

    expect(store.selectedId).toBe('lead');
    expect(store.currentId).toBeNull();
    expect(store.isExpanded('lead', 0)).toBe(true);
    expect(store.isExpanded('dev', 1)).toBe(false);
    expect(store.focusRequest).toMatchObject({ reason: 'overview' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('forgets a selected and a current person who left the chart, and tells nobody when both are still in it', () => {
    const store = new ChartViewStore(2);
    store.select('lead');
    store.setCurrent('dev');
    const listener = vi.fn();
    store.subscribe(listener);
    const without = (...ids: string[]) =>
      buildOrgChart(
        [...CHART.nodes.values()].map((node) => node.employee).filter((employee) => !ids.includes(employee.id)),
        { topPersons: ['ceo'], hide: SHOW_EVERYONE },
      );

    store.retain(CHART);
    expect(listener).not.toHaveBeenCalled();

    store.retain(without('dev'));
    expect(store.selectedId).toBe('lead');
    expect(store.currentId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);

    store.retain(without('lead', 'dev'));
    expect(store.selectedId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('forgets a selected person whom other filters leave unnamed, and keeps their place in the tab order, which the tree renders', () => {
    const store = new ChartViewStore(2);
    store.select('lead');
    store.setCurrent('lead');
    const hidingLead = buildOrgChart(
      [...CHART.nodes.values()].map(({ employee }) => (employee.id === 'lead' ? { ...employee, hiddenFromAddressList: true } : employee)),
      { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } },
    );

    store.retain(hidingLead);

    expect([store.selectedId, store.currentId]).toEqual([null, 'lead']);
  });

  it('keeps the selected and the current item of a tree of other items as far as that tree says, such as the departments', () => {
    const store = new ChartViewStore(1);
    store.select('sales');
    store.setCurrent('sales/emea');
    const listener = vi.fn();
    store.subscribe(listener);

    store.retainWhere(() => true, () => true);
    expect(listener).not.toHaveBeenCalled();

    store.retainWhere((id) => id === 'sales', () => false);
    expect([store.selectedId, store.currentId]).toEqual(['sales', null]);
    store.retainWhere(() => false, () => true);
    expect(store.selectedId).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('forgets the item in the tab order where the tree no longer renders it, as no item would be in the tab order otherwise', () => {
    const shown = new ChartViewStore(2);
    shown.setCurrent('agent050');
    shown.retain(CROWDED);
    expect(shown.currentId).toBe('agent050');

    // A refresh brought someone whose name comes first, which moves the agent past the page.
    const refreshed = buildOrgChart(
      [...[...CROWDED.nodes.values()].map((node) => node.employee), makeEmployee('agent000', 'lead')],
      { topPersons: ['ceo'], hide: SHOW_EVERYONE },
    );
    shown.retain(refreshed);
    expect(shown.currentId).toBeNull();

    const folded = new ChartViewStore(1);
    folded.setCurrent('agent001');
    folded.retain(CROWDED);
    expect(folded.currentId).toBeNull();

    const more = new ChartViewStore(2);
    more.setCurrent(showMoreKey('lead'));
    more.retain(CROWDED);
    expect(more.currentId).toBe(showMoreKey('lead'));
    more.showMore(CROWDED, 'lead');
    more.showMore(CROWDED, 'lead');
    more.setCurrent(showMoreKey('lead'));
    more.retain(CROWDED);
    expect(more.currentId).toBeNull();

    const heading = new ChartViewStore(1);
    heading.setCurrent(STRAYS);
    heading.retain(CROWDED);
    expect(heading.currentId).toBe(STRAYS);
    heading.retain(CHART);
    expect(heading.currentId).toBeNull();
  });

  it('forgets individual toggles when expanding to a depth', () => {
    const store = new ChartViewStore(0);
    store.activate('ceo', 0, true);

    store.expandToDepth(0);

    expect(store.isExpanded('ceo', 0)).toBe(false);
  });

  describe('a saved view', () => {
    it('holds the depth, the teams folded or unfolded since in the order of the latest change, the selected and the current person', () => {
      const store = new ChartViewStore(1);
      store.startFrom(1);
      store.toggle('lead', 1);
      store.toggle('ceo', 0);
      store.revealEmployee({ id: 'dev', ancestorIds: ['ceo', 'lead'] });

      expect(store.toSnapshot()).toEqual({
        depth: 1,
        toggled: [
          ['ceo', true],
          ['lead', true],
        ],
        selectedId: 'dev',
        currentId: 'dev',
      });
    });

    it(`keeps the latest ${String(SAVED_TOGGLES_LIMIT)} teams folded or unfolded by hand`, () => {
      const store = new ChartViewStore(0);
      store.expandMany(
        Array.from({ length: SAVED_TOGGLES_LIMIT + 5 }, (_, index) => `t${String(index)}`),
        't0',
      );

      const { toggled } = store.toSnapshot();

      expect(toggled).toHaveLength(SAVED_TOGGLES_LIMIT);
      expect(toggled[0]).toEqual(['t5', true]);
    });

    it('opens the first chart as the view left it, telling nobody, with the selected person revealed and centred', () => {
      const store = new ChartViewStore(1);
      const listener = vi.fn();
      store.subscribe(listener);
      const view: ChartView = { depth: 0, toggled: [['aide', true]], selectedId: 'dev', currentId: 'aide' };

      store.restore(view, CHART);

      expect(store.hasStarted).toBe(true);
      expect(store.isExpanded('aide', 1)).toBe(true);
      // The managers above the selected person, which the view had folded: the person may have moved since.
      expect(store.isExpanded('ceo', 0)).toBe(true);
      expect(store.isExpanded('lead', 1)).toBe(true);
      expect(store.selectedId).toBe('dev');
      expect(store.currentId).toBe('dev');
      expect(store.focusRequest).toMatchObject({ id: 'dev', reason: 'reveal' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('leaves out the people who are no longer in the chart', () => {
      const store = new ChartViewStore(1);
      const view: ChartView = { depth: 2, toggled: [['gone', true], ['lead', false]], selectedId: 'left', currentId: 'moved' };

      store.restore(view, CHART);

      expect(store.toSnapshot()).toEqual({ depth: 2, toggled: [['lead', false]], selectedId: null, currentId: null });
      expect(store.focusRequest).toBeNull();
    });

    it('opens nobody\'s details that the chart now leaves unnamed, and keeps their place in the tab order', () => {
      const store = new ChartViewStore(1);
      const hidingLead = buildOrgChart(
        [...CHART.nodes.values()].map(({ employee }) => (employee.id === 'lead' ? { ...employee, hiddenFromAddressList: true } : employee)),
        { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } },
      );

      store.restore({ depth: 1, toggled: [], selectedId: 'lead', currentId: 'lead' }, hidingLead);

      expect([store.selectedId, store.currentId]).toEqual([null, 'lead']);
      expect(store.focusRequest).toBeNull();
    });

    it('keeps the card in the tab order of a view without a selected person, which asks for no focus', () => {
      const store = new ChartViewStore(1);

      store.restore({ depth: 1, toggled: [], selectedId: null, currentId: 'aide' }, CHART);

      expect(store.currentId).toBe('aide');
      expect(store.selectedId).toBeNull();
      expect(store.focusRequest).toBeNull();
    });

    it('puts the first top person in the tab order instead of a card that a folded manager keeps out of the tree', () => {
      const chart = buildOrgChart(
        [makeEmployee('ceo'), makeEmployee('lead', 'ceo'), makeEmployee('aide', 'ceo'), makeEmployee('dev', 'aide')],
        { topPersons: ['ceo'], hide: SHOW_EVERYONE },
      );
      const folded = new ChartViewStore(1);
      const unfolded = new ChartViewStore(1);

      folded.restore({ depth: 1, toggled: [['lead', true]], selectedId: null, currentId: 'dev' }, chart);
      unfolded.restore({ depth: 1, toggled: [['aide', true]], selectedId: null, currentId: 'dev' }, chart);

      expect(folded.isExpanded('aide', 1)).toBe(false);
      expect(folded.currentId).toBeNull();
      expect(unfolded.currentId).toBe('dev');
    });

    it('opens only the first chart, as startFrom does', () => {
      const store = new ChartViewStore(1);
      store.startFrom(1);

      store.restore({ depth: 3, toggled: [], selectedId: 'dev', currentId: 'dev' }, CHART);

      expect(store.selectedId).toBeNull();
      expect(store.toSnapshot().depth).toBe(1);
    });

    it('keeps the headings folded or unfolded, which it saves beside the teams, while their flag is in the chart', () => {
      const store = new ChartViewStore(1);
      store.toggleGroup(STRAYS, 60);
      expect(store.toSnapshot().toggled).toEqual([[STRAYS, true]]);
      const view: ChartView = {
        depth: 1,
        toggled: [
          [STRAYS, true],
          [headingKey('managerCycle'), true],
        ],
        selectedId: null,
        currentId: null,
      };

      const restored = new ChartViewStore(1);
      restored.restore(view, CROWDED);

      expect(restored.isGroupExpanded(STRAYS, 60)).toBe(true);
      expect(restored.toSnapshot().toggled).toEqual([[STRAYS, true]]);
    });

    it('opens on a selected person past a page with that page shown, as pages are found again rather than saved', () => {
      const store = new ChartViewStore(1);

      store.restore({ depth: 1, toggled: [], selectedId: 'agent117', currentId: 'agent117' }, CROWDED);

      expect(store.isExpanded('lead', 1)).toBe(true);
      expect(store.shownCount('lead')).toBe(150);
      expect(store.currentId).toBe('agent117');
      expect(store.focusRequest).toMatchObject({ id: 'agent117', reason: 'reveal' });
    });

    it('shows the page that the card in the tab order needs, where nothing folded keeps it out of the tree', () => {
      const unfolded = new ChartViewStore(1);
      const folded = new ChartViewStore(1);

      unfolded.restore({ depth: 2, toggled: [], selectedId: null, currentId: 'agent077' }, CROWDED);
      folded.restore({ depth: 1, toggled: [], selectedId: null, currentId: 'agent077' }, CROWDED);

      expect(unfolded.currentId).toBe('agent077');
      expect(unfolded.shownCount('lead')).toBe(100);
      expect(folded.currentId).toBeNull();
      expect(folded.shownCount('lead')).toBe(50);
    });

    it('keeps a heading or a Show more item in the tab order where the tree renders it', () => {
      const heading = new ChartViewStore(1);
      const more = new ChartViewStore(1);
      const gone = new ChartViewStore(1);

      heading.restore({ depth: 1, toggled: [], selectedId: null, currentId: STRAYS }, CROWDED);
      more.restore({ depth: 2, toggled: [], selectedId: null, currentId: showMoreKey('lead') }, CROWDED);
      gone.restore({ depth: 1, toggled: [], selectedId: null, currentId: showMoreKey('lead') }, CROWDED);

      expect(heading.currentId).toBe(STRAYS);
      expect(more.currentId).toBe(showMoreKey('lead'));
      expect(gone.currentId).toBeNull();
    });
  });
});
