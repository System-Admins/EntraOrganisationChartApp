import { describe, expect, it } from 'vitest';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import type { Employee } from '../employees/employee';
import { buildOrgChart } from './buildOrgChart';
import { summarizeTeam, teamMembersIn } from './teamSummary';

const chartOf = (employees: readonly Employee[]) => buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });

const inSales = (id: string, managerId: string, city: string | null = 'Oslo') =>
  makeEmployee(id, managerId, { department: 'Sales', city });

describe('summarizeTeam', () => {
  const company = chartOf([
    makeEmployee('ceo', null, { department: 'Management', city: 'Oslo' }),
    inSales('anna', 'ceo'),
    inSales('bo', 'anna', 'Bergen'),
    inSales('cy', 'bo', 'Bergen'),
    makeEmployee('dag', 'anna', { department: 'Marketing', city: 'Oslo' }),
    makeEmployee('eva', 'ceo', { department: 'Finance', city: 'London' }),
    makeEmployee('fay', 'eva', { department: '  ', city: null }),
  ]);

  it('counts everyone below the person at every level, the levels they fill and the managers among them', () => {
    expect(summarizeTeam(company, 'ceo')).toMatchObject({ size: 6, levels: 3, managers: 3 });
    expect(summarizeTeam(company, 'anna')).toMatchObject({ size: 3, levels: 2, managers: 1 });
  });

  it('counts levels from the person, wherever they are in the chart', () => {
    expect(summarizeTeam(company, 'bo')).toMatchObject({ size: 1, levels: 1, managers: 0 });
  });

  it('finds no team below someone without reports', () => {
    expect(summarizeTeam(company, 'cy')).toEqual({
      size: 0,
      levels: 0,
      managers: 0,
      departments: { top: [], rest: [] },
      cities: { top: [], rest: [] },
    });
  });

  it('names the most common departments and cities first, leaving out people without one and the person themselves', () => {
    const { departments, cities } = summarizeTeam(company, 'ceo');

    expect(departments).toEqual({
      top: [
        { name: 'Sales', count: 3 },
        { name: 'Marketing', count: 1 },
        { name: 'Finance', count: 1 },
      ],
      rest: [],
    });
    expect(cities.top).toEqual([
      { name: 'Oslo', count: 2 },
      { name: 'Bergen', count: 2 },
      { name: 'London', count: 1 },
    ]);
  });

  it('keeps equal counts in the order the outline lists their first person', () => {
    // Anna's team comes before Eva's, as the chart sorts reports by name: Marketing's Dag before Finance's Eva.
    expect(summarizeTeam(company, 'ceo').departments.top.map(({ name }) => name).slice(1)).toEqual(['Marketing', 'Finance']);
  });

  it('names at most three of each and keeps the rest apart, in the same order', () => {
    const spread = chartOf([
      makeEmployee('ceo'),
      ...['Oslo', 'Oslo', 'Bergen', 'Bergen', 'Paris', 'Rome', 'Lima'].map((city, index) =>
        makeEmployee(`p${String(index)}`, 'ceo', { city }),
      ),
    ]);

    const { cities } = summarizeTeam(spread, 'ceo');

    expect(cities.top.map(({ name }) => name)).toEqual(['Oslo', 'Bergen', 'Paris']);
    expect(cities.rest.map(({ name }) => name)).toEqual(['Rome', 'Lima']);
  });

  it('names a fourth rather than counting it as one more, which would take as much room', () => {
    const four = chartOf([
      makeEmployee('ceo'),
      ...['Oslo', 'Bergen', 'Paris', 'Rome'].map((city, index) => makeEmployee(`p${String(index)}`, 'ceo', { city })),
    ]);

    expect(summarizeTeam(four, 'ceo').cities).toEqual({
      top: ['Oslo', 'Bergen', 'Paris', 'Rome'].map((name) => ({ name, count: 1 })),
      rest: [],
    });
  });

  it('counts a department or a city spelled several ways once, under the spelling most of the team uses', () => {
    const spelled = chartOf([
      makeEmployee('ceo'),
      makeEmployee('a', 'ceo', { department: 'Energy Facilities', city: 'Sao Paulo' }),
      makeEmployee('b', 'ceo', { department: 'energy facilities', city: 'São Paulo' }),
      makeEmployee('c', 'ceo', { department: 'Energy Facilities ', city: 'São Paulo' }),
    ]);

    const { departments, cities } = summarizeTeam(spelled, 'ceo');

    expect(departments.top).toEqual([{ name: 'Energy Facilities', count: 3 }]);
    expect(cities.top).toEqual([{ name: 'São Paulo', count: 3 }]);
  });

  it('counts only the people the chart shows', () => {
    const hidingGuests = buildOrgChart(
      [makeEmployee('ceo'), makeEmployee('lead', 'ceo'), makeEmployee('guest', 'lead', { isGuest: true }), makeEmployee('dev', 'lead')],
      { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } },
    );

    expect(summarizeTeam(hidingGuests, 'ceo')).toMatchObject({ size: 2, levels: 2, managers: 1 });
  });

  it('counts nobody for an unlisted person\'s place, neither among the people and managers nor in the shares', () => {
    const hidingHead = buildOrgChart(
      [
        makeEmployee('ceo'),
        makeEmployee('auditHead', 'ceo', { department: 'Audit', city: 'Oslo', hiddenFromAddressList: true }),
        inSales('anna', 'auditHead'),
        inSales('bo', 'auditHead'),
      ],
      { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } },
    );

    expect(summarizeTeam(hidingHead, 'ceo')).toEqual({
      size: 2,
      levels: 2,
      managers: 0,
      departments: { top: [{ name: 'Sales', count: 2 }], rest: [] },
      cities: { top: [{ name: 'Oslo', count: 2 }], rest: [] },
    });
  });
});

describe('teamMembersIn', () => {
  const company = chartOf([
    makeEmployee('ceo', null, { department: 'Management', city: 'Oslo' }),
    inSales('anna', 'ceo'),
    inSales('bo', 'anna', ' Bergen '),
    inSales('cy', 'bo', 'Bergen'),
    makeEmployee('dag', 'anna', { department: 'Marketing', city: 'Oslo' }),
    makeEmployee('eva', 'ceo', { department: 'Finance', city: null }),
  ]);

  it('lists the team\'s people in one department or city in the outline\'s order, the person left out', () => {
    expect(teamMembersIn(company, 'ceo', { field: 'department', name: 'Sales' })).toEqual(['anna', 'bo', 'cy']);
    expect(teamMembersIn(company, 'ceo', { field: 'city', name: 'Oslo' })).toEqual(['anna', 'dag']);
    expect(teamMembersIn(company, 'anna', { field: 'department', name: 'Sales' })).toEqual(['bo', 'cy']);
  });

  it('finds as many people as the row that names them counts, spaces around a value included', () => {
    const { cities, departments } = summarizeTeam(company, 'ceo');

    for (const { name, count } of cities.top) expect(teamMembersIn(company, 'ceo', { field: 'city', name })).toHaveLength(count);
    for (const { name, count } of departments.top) {
      expect(teamMembersIn(company, 'ceo', { field: 'department', name })).toHaveLength(count);
    }
    expect(teamMembersIn(company, 'ceo', { field: 'city', name: 'Bergen' })).toEqual(['bo', 'cy']);
  });

  it('finds the people of a department however they spell it, and nobody for a name without letters', () => {
    const spelled = chartOf([
      makeEmployee('ceo'),
      makeEmployee('a', 'ceo', { department: 'Energy Facilities' }),
      makeEmployee('b', 'ceo', { department: 'energy-facilities' }),
      makeEmployee('c', 'ceo', { department: null }),
    ]);

    expect(teamMembersIn(spelled, 'ceo', { field: 'department', name: 'Energy Facilities' })).toEqual(['a', 'b']);
    expect(teamMembersIn(spelled, 'ceo', { field: 'department', name: ' - ' })).toEqual([]);
  });
});
