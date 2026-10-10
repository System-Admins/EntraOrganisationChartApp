import { describe, expect, it } from 'vitest';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import {
  firstAdded,
  firstTreeItem,
  hasTreeItem,
  headingKey,
  isShown,
  listMembers,
  listOf,
  opensUnfolded,
  pageShowing,
  revealTargetOf,
  showMoreKey,
  shownPage,
  treeRoots,
  type TreeState,
} from './treeItems';

/** `count` people named in order, `prefix001` on, under `managerId`, or without a manager. */
const crowd = (prefix: string, count: number, managerId: string | null): Employee[] =>
  Array.from({ length: count }, (_, index) => makeEmployee(`${prefix}${String(index + 1).padStart(3, '0')}`, managerId));

/** A lead with 120 agents, more than two pages; 60 people without a manager; one whose manager is gone; and a loop. */
const CHART = buildOrgChart(
  [
    makeEmployee('ceo'),
    makeEmployee('lead', 'ceo'),
    ...crowd('agent', 120, 'lead'),
    ...crowd('stray', 60, null),
    makeEmployee('orphan', 'gone'),
    makeEmployee('loopa', 'loopb'),
    makeEmployee('loopb', 'loopa'),
  ],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

/** Every team unfolded, every list at `shown`, and the headings as `headings` says. */
const unfolded = (shown = 50, headings = true): TreeState => ({
  isExpanded: () => true,
  isGroupExpanded: () => headings,
  shownCount: () => shown,
});

describe('treeRoots', () => {
  it('gathers the people the chart flags under a heading per flag, in the flags\' order, after the people at the top', () => {
    const { people, groups } = treeRoots(CHART);

    expect(people).toEqual(['ceo']);
    expect(groups.map(({ flag, key, ids }) => [flag, key, ids.length])).toEqual([
      ['noManager', headingKey('noManager'), 60],
      ['managerNotShown', headingKey('managerNotShown'), 1],
      ['managerCycle', headingKey('managerCycle'), 1],
    ]);
    expect(groups[0]?.ids.slice(0, 2)).toEqual(['stray001', 'stray002']);
    expect(firstTreeItem(CHART)).toBe('ceo');
  });

  it('leaves out the flags nobody has, and starts with a heading where nobody at the top goes without a flag', () => {
    const headed = buildOrgChart([makeEmployee('orphan', 'gone')], { topPersons: [], hide: SHOW_EVERYONE });

    expect(treeRoots(headed)).toEqual({ people: [], groups: [{ flag: 'managerNotShown', key: headingKey('managerNotShown'), ids: ['orphan'] }] });
    expect(firstTreeItem(headed)).toBe(headingKey('managerNotShown'));
  });

  it('knows the people of the chart and its headings, and nothing else, as the items a saved view may name', () => {
    expect(hasTreeItem(CHART, 'agent001')).toBe(true);
    expect(hasTreeItem(CHART, headingKey('noManager'))).toBe(true);
    expect(hasTreeItem(CHART, 'gone')).toBe(false);
    expect(hasTreeItem(buildOrgChart([makeEmployee('ceo')], { topPersons: ['ceo'], hide: SHOW_EVERYONE }), headingKey('noManager'))).toBe(
      false,
    );
  });
});

describe('the lists of the tree', () => {
  it('put a person in their manager\'s reports, or under their flag\'s heading, and nobody at the top without a flag in any', () => {
    expect(listOf(CHART, 'agent007')).toBe('lead');
    expect(listOf(CHART, 'stray007')).toBe(headingKey('noManager'));
    expect(listOf(CHART, 'ceo')).toBeNull();
    expect(listMembers(CHART, headingKey('managerNotShown'))).toEqual(['orphan']);
    expect(listMembers(CHART, 'ceo')).toEqual(['lead']);
  });

  it('go a page at a time, the people without a team first as the tree stacks them, then those with one', () => {
    const mixed = buildOrgChart(
      [makeEmployee('boss'), ...crowd('member', 60, 'boss'), makeEmployee('helper', 'member002')],
      { topPersons: ['boss'], hide: SHOW_EVERYONE },
    );
    const page = shownPage(mixed, listMembers(mixed, 'boss'), 50);

    expect(page.managers).toEqual(['member002']);
    expect(page.individuals).toHaveLength(49);
    expect(page.individuals[0]).toBe('member001');
    expect(page.individuals.at(-1)).toBe('member050');
    expect(page.hidden).toBe(10);
    expect(shownPage(mixed, listMembers(mixed, 'boss'), 100).hidden).toBe(0);
  });

  it('give the focus after Show more to the first person the next page adds in the tree\'s order', () => {
    const mixed = buildOrgChart(
      [makeEmployee('boss'), ...crowd('member', 60, 'boss'), makeEmployee('helper', 'member051')],
      { topPersons: ['boss'], hide: SHOW_EVERYONE },
    );

    // Member 51 heads a team, so the tree lists the next page's member 52 before it.
    expect(firstAdded(mixed, listMembers(mixed, 'boss'), 50)).toBe('member052');
    expect(firstAdded(CHART, listMembers(CHART, 'lead'), 100)).toBe('agent101');
    expect(firstAdded(CHART, listMembers(CHART, 'lead'), 150)).toBeUndefined();
  });

  it('show a person on the shortest whole number of pages that reaches them', () => {
    expect([0, 49, 50, 99, 100].map(pageShowing)).toEqual([50, 50, 100, 100, 150]);
  });

  it('open a heading unfolded where its first page holds the whole group', () => {
    expect(opensUnfolded(50)).toBe(true);
    expect(opensUnfolded(51)).toBe(false);
  });
});

describe('revealTargetOf', () => {
  it('names the managers above, and the page of each list that reaches the person beyond its first', () => {
    expect(revealTargetOf(CHART, 'agent117')).toEqual({ id: 'agent117', ancestorIds: ['ceo', 'lead'], heading: undefined, pages: [['lead', 150]] });
    expect(revealTargetOf(CHART, 'agent007')).toEqual({ id: 'agent007', ancestorIds: ['ceo', 'lead'], heading: undefined, pages: [] });
  });

  it('names the heading over a flagged branch, with the page of its group', () => {
    expect(revealTargetOf(CHART, 'stray055')).toEqual({
      id: 'stray055',
      ancestorIds: [],
      heading: headingKey('noManager'),
      pages: [[headingKey('noManager'), 100]],
    });
  });
});

describe('isShown', () => {
  it('renders a person whose lists are open and reach them, and nobody under a folded manager or past a page', () => {
    expect(isShown(CHART, unfolded(), 'agent050')).toBe(true);
    expect(isShown(CHART, unfolded(), 'agent051')).toBe(false);
    expect(isShown(CHART, unfolded(100), 'agent051')).toBe(true);
    expect(isShown(CHART, { ...unfolded(), isExpanded: (id) => id !== 'lead' }, 'agent001')).toBe(false);
    expect(isShown(CHART, unfolded(), 'gone')).toBe(false);
  });

  it('renders the headings always, and the people under one only while it is unfolded', () => {
    expect(isShown(CHART, unfolded(50, false), headingKey('noManager'))).toBe(true);
    expect(isShown(CHART, unfolded(50, false), 'stray001')).toBe(false);
    expect(isShown(CHART, unfolded(50, true), 'stray001')).toBe(true);
  });

  it('renders a Show more item only where its list is open and goes on past its page', () => {
    expect(isShown(CHART, unfolded(), showMoreKey('lead'))).toBe(true);
    expect(isShown(CHART, unfolded(150), showMoreKey('lead'))).toBe(false);
    expect(isShown(CHART, { ...unfolded(), isExpanded: (id) => id !== 'lead' }, showMoreKey('lead'))).toBe(false);
    expect(isShown(CHART, unfolded(50, false), showMoreKey(headingKey('noManager')))).toBe(false);
    expect(isShown(CHART, unfolded(50, true), showMoreKey(headingKey('noManager')))).toBe(true);
    expect(isShown(CHART, unfolded(), showMoreKey('gone'))).toBe(false);
  });
});
