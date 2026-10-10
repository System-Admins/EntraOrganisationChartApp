import { describe, expect, it } from 'vitest';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { departmentTree } from '@/domain/orgChart/departmentTree';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { NO_DEPARTMENT } from './departmentsOf';
import { keptTrail, nextTrail } from './departmentTrail';

describe('nextTrail', () => {
  it('adds a department that is not in the trail yet', () => {
    expect(nextTrail(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('goes back to a department already in the trail rather than adding it again', () => {
    expect(nextTrail(['a', 'b', 'c'], 'a')).toEqual(['a']);
    expect(nextTrail(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });
});

describe('keptTrail', () => {
  const tree = departmentTree(
    buildOrgChart(
      [
        makeEmployee('ceo', null, { department: 'Management' }),
        makeEmployee('lead', 'ceo', { department: 'Sales' }),
        makeEmployee('aide', 'ceo', { department: null }),
      ],
      { topPersons: ['ceo'], hide: SHOW_EVERYONE },
    ),
  );

  it('keeps a trail whose departments are all still there', () => {
    expect(keptTrail(tree, ['management', 'management/sales', NO_DEPARTMENT])).toEqual(['management', 'management/sales', NO_DEPARTMENT]);
  });

  it('ends a trail at the first department the tree no longer has', () => {
    expect(keptTrail(tree, ['management', 'management/finance', 'management/sales'])).toEqual(['management']);
  });

  it('drops the list of the people without a department once everyone has one', () => {
    const everyoneInOne = departmentTree(
      buildOrgChart([makeEmployee('ceo', null, { department: 'Management' })], { topPersons: ['ceo'], hide: SHOW_EVERYONE }),
    );

    expect(keptTrail(everyoneInOne, ['management', NO_DEPARTMENT])).toEqual(['management']);
  });
});
