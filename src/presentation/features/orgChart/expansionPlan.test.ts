import { describe, expect, it } from 'vitest';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { initialExpandDepth, planExpandAll, planUnfold } from './expansionPlan';
import { headingKey, OPENING_TREE, PAGE_SIZE, type TreeState } from './treeItems';

// Levels: 1 root, 2 managers, 4 people.
const chart = buildOrgChart(
  [
    makeEmployee('ceo'),
    makeEmployee('m1', 'ceo'),
    makeEmployee('m2', 'ceo'),
    ...['a', 'b', 'c', 'd'].map((id, index) => makeEmployee(id, index < 2 ? 'm1' : 'm2')),
  ],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

/** `count` people named in order, `prefix001` on, under `managerId`, or without a manager. */
const crowd = (prefix: string, count: number, managerId: string | null): Employee[] =>
  Array.from({ length: count }, (_, index) => makeEmployee(`${prefix}${String(index + 1).padStart(3, '0')}`, managerId));

/** The tree with teams folded as `isExpanded` says, every list at its first page unless `pages` says more, and headings by their size. */
const treeState = (isExpanded: TreeState['isExpanded'], pages: Readonly<Record<string, number>> = {}): TreeState => ({
  isExpanded,
  isGroupExpanded: OPENING_TREE.isGroupExpanded,
  shownCount: (list) => pages[list] ?? PAGE_SIZE,
});

describe('planExpandAll', () => {
  it('expands everything when it fits the budget', () => {
    expect(planExpandAll(chart, OPENING_TREE, 7)).toEqual({ depth: 3, complete: true, visibleLevels: 3, totalLevels: 3 });
  });

  it('stops at the deepest level that keeps the card count within budget', () => {
    expect(planExpandAll(chart, OPENING_TREE, 6)).toEqual({ depth: 1, complete: false, visibleLevels: 2, totalLevels: 3 });
    expect(planExpandAll(chart, OPENING_TREE, 1)).toEqual({ depth: 0, complete: false, visibleLevels: 1, totalLevels: 3 });
  });

  it('counts a page of each long team, as the rest of it never renders', () => {
    const longTeam = buildOrgChart([makeEmployee('ceo'), ...crowd('agent', 120, 'ceo'), ...crowd('aide', 3, 'agent120')], {
      topPersons: ['ceo'],
      hide: SHOW_EVERYONE,
    });

    // The CEO and fifty agents; the agent with aides is on the third page.
    expect(planExpandAll(longTeam, OPENING_TREE, 51)).toEqual({ depth: 3, complete: true, visibleLevels: 3, totalLevels: 3 });
    expect(planExpandAll(longTeam, OPENING_TREE, 50)).toEqual({ depth: 0, complete: false, visibleLevels: 1, totalLevels: 3 });
  });

  it('counts the people under a heading only while it is unfolded, a page of them', () => {
    const strays = buildOrgChart([makeEmployee('ceo'), ...crowd('stray', 60, null)], { topPersons: ['ceo'], hide: SHOW_EVERYONE });
    const unfolded = { isGroupExpanded: () => true, shownCount: () => PAGE_SIZE };

    // More than a page, so the heading opens folded and only the CEO renders.
    expect(planExpandAll(strays, OPENING_TREE, 1).complete).toBe(true);
    expect(planExpandAll(strays, unfolded, 50).complete).toBe(false);
    expect(planExpandAll(strays, unfolded, 51).complete).toBe(true);
  });
});

describe('planUnfold', () => {
  const allFolded = treeState(() => false);

  it('unfolds the folded teams of the people given, in their order, and passes over people without a team', () => {
    expect(planUnfold(chart, ['m2', 'a', 'm1'], allFolded, 3)).toEqual({ ids: ['m2', 'm1'], folded: 2 });
  });

  it('passes over teams that are unfolded already', () => {
    expect(planUnfold(chart, ['m1', 'm2'], treeState((id) => id === 'm1'), 5)).toEqual({ ids: ['m2'], folded: 1 });
  });

  it('keeps folded a team that would take the cards on screen past the budget, and goes on with the next', () => {
    const uneven = buildOrgChart(
      [
        makeEmployee('ceo'),
        makeEmployee('big', 'ceo'),
        makeEmployee('small', 'ceo'),
        makeEmployee('helper', 'small'),
        ...['a', 'b', 'c'].map((id) => makeEmployee(id, 'big')),
      ],
      { topPersons: ['ceo'], hide: SHOW_EVERYONE },
    );

    // Three cards on screen: Big's team would make six, Small's makes four.
    expect(planUnfold(uneven, ['big', 'small'], allFolded, 3, 5)).toEqual({ ids: ['small'], folded: 2 });
    expect(planUnfold(uneven, ['big', 'small'], allFolded, 3, 7)).toEqual({ ids: ['big', 'small'], folded: 2 });
  });

  it('counts the teams below that are unfolded already, as unfolding brings them back on screen', () => {
    const unfoldedBelow = treeState((id) => id !== 'ceo');

    // The CEO's card alone, then the two managers and their four people.
    expect(planUnfold(chart, ['ceo'], unfoldedBelow, 1, 6)).toEqual({ ids: [], folded: 1 });
    expect(planUnfold(chart, ['ceo'], unfoldedBelow, 1, 7)).toEqual({ ids: ['ceo'], folded: 1 });
  });

  it('counts the page of a long team that unfolding shows, as far as someone showed more of it', () => {
    const longTeam = buildOrgChart([makeEmployee('ceo'), makeEmployee('lead', 'ceo'), ...crowd('agent', 120, 'lead')], {
      topPersons: ['ceo'],
      hide: SHOW_EVERYONE,
    });

    expect(planUnfold(longTeam, ['lead'], allFolded, 2, 52).ids).toEqual(['lead']);
    expect(planUnfold(longTeam, ['lead'], treeState(() => false, { lead: 100 }), 2, 52).ids).toEqual([]);
    expect(planUnfold(longTeam, ['lead'], treeState(() => false, { lead: 100 }), 2, 102).ids).toEqual(['lead']);
  });

  it('unfolds folded headings, counting a page of the people under each', () => {
    const flagged = buildOrgChart(
      [makeEmployee('ceo'), ...crowd('stray', 60, null), makeEmployee('orphan', 'gone')],
      { topPersons: ['ceo'], hide: SHOW_EVERYONE },
    );
    const headings = [headingKey('noManager'), headingKey('managerNotShown')];

    // The orphan's heading opens unfolded; the strays', with more than a page, folded, and unfolding it shows fifty of them.
    expect(planUnfold(flagged, headings, allFolded, 3, 53)).toEqual({ ids: [headingKey('noManager')], folded: 1 });
    expect(planUnfold(flagged, headings, allFolded, 3, 52)).toEqual({ ids: [], folded: 1 });
  });
});

describe('initialExpandDepth', () => {
  const employees = [makeEmployee('ceo1'), makeEmployee('ceo2'), makeEmployee('dev', 'ceo1')];
  const depthFor = (topPersons: string[]) =>
    initialExpandDepth(buildOrgChart(employees, { topPersons, hide: SHOW_EVERYONE }), 2);

  it('starts several top persons folded, whatever depth is configured', () => {
    expect(depthFor(['ceo1', 'ceo2'])).toBe(0);
  });

  it('uses the configured depth when only one top person is found, however many are listed', () => {
    expect(depthFor(['ceo1'])).toBe(2);
    expect(depthFor(['ceo1', 'left.the.company@contoso.com'])).toBe(2);
    expect(depthFor(['ceo1', 'CEO1@contoso.com'])).toBe(2);
    expect(depthFor([])).toBe(2);
  });
});
