import { describe, expect, it } from 'vitest';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { departmentTree } from '@/domain/orgChart/departmentTree';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { isDepartmentShown, planDepartmentExpandAll, planDepartmentUnfold } from './departmentPlans';

/** Management, three departments below it, and below those three levels in Sales. */
const TREE = departmentTree(
  buildOrgChart(
    [
      makeEmployee('ceo', null, { department: 'Management' }),
      makeEmployee('a', 'ceo', { department: 'Sales' }),
      makeEmployee('b', 'ceo', { department: 'Finance' }),
      makeEmployee('c', 'ceo', { department: 'Legal' }),
      makeEmployee('a1', 'a', { department: 'Sales North' }),
      makeEmployee('a2', 'a', { department: 'Sales South' }),
      makeEmployee('b1', 'b', { department: 'Payroll' }),
      makeEmployee('a11', 'a1', { department: 'Sales Oslo' }),
    ],
    { topPersons: ['ceo'], hide: SHOW_EVERYONE },
  ),
);

describe('planDepartmentExpandAll', () => {
  it('unfolds every level where the departments fit', () => {
    expect(planDepartmentExpandAll(TREE)).toEqual({ depth: 4, visibleLevels: 4, totalLevels: 4, complete: true });
  });

  it('stops at the last level that fits, but always shows the departments at the top', () => {
    // 1 + 3 + 3 cards fit in 7; the fourth level would take an eighth.
    expect(planDepartmentExpandAll(TREE, 7)).toEqual({ depth: 2, visibleLevels: 3, totalLevels: 4, complete: false });
    expect(planDepartmentExpandAll(TREE, 0)).toEqual({ depth: 0, visibleLevels: 1, totalLevels: 4, complete: false });
  });
});

describe('isDepartmentShown', () => {
  it('shows a department where every department above it is unfolded', () => {
    const unfolded = new Set(['management', 'management/sales']);
    const isUnfolded = ({ id }: { readonly id: string }) => unfolded.has(id);

    expect(isDepartmentShown(TREE, isUnfolded, 'management')).toBe(true);
    expect(isDepartmentShown(TREE, isUnfolded, 'management/sales/salesnorth')).toBe(true);
    expect(isDepartmentShown(TREE, isUnfolded, 'management/sales/salesnorth/salesoslo')).toBe(false);
    expect(isDepartmentShown(TREE, isUnfolded, 'gone')).toBe(false);
  });
});

describe('planDepartmentUnfold', () => {
  const siblings = ['management/sales', 'management/finance', 'management/legal'];

  it('unfolds the folded departments beside one, those with departments below them', () => {
    expect(planDepartmentUnfold(TREE, siblings, () => false, 4)).toEqual({ ids: ['management/sales', 'management/finance'], folded: 2 });
    expect(planDepartmentUnfold(TREE, siblings, ({ id }) => id === 'management/sales', 4)).toEqual({ ids: ['management/finance'], folded: 1 });
  });

  it('unfolds as many as the cards they show fit beside those on screen', () => {
    // Sales shows two departments, which fill the budget of six; Finance's one would not fit.
    expect(planDepartmentUnfold(TREE, siblings, () => false, 4, 6)).toEqual({ ids: ['management/sales'], folded: 2 });
  });
});
