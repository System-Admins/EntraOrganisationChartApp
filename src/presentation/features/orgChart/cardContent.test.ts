import { describe, expect, it } from 'vitest';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { getNode } from '@/domain/orgChart/orgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { cardContentOf, fullestCardContent } from './cardContent';

const bare = { jobTitle: null, department: null, mail: null };

const chartOf = (...employees: Parameters<typeof buildOrgChart>[0]) =>
  buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });

/** The lines a card has, whatever their text. */
const lines = (content: ReturnType<typeof fullestCardContent>) =>
  Object.entries(content).flatMap(([line, value]) => (value === null || line === 'name' || line === 'level' ? [] : line));

describe('cardContentOf', () => {
  it('shows the desk phone when there is one, and the level counted from 1', () => {
    const chart = chartOf(
      makeEmployee('ceo', null, { businessPhone: '+47 1', mobilePhone: '+47 2', officeLocation: 'Oslo' }),
      makeEmployee('dev', 'ceo', { mobilePhone: '+47 3' }),
    );

    expect(cardContentOf(getNode(chart, 'ceo'))).toEqual({
      flag: null,
      name: 'Ceo',
      jobTitle: 'Engineer',
      department: 'Engineering',
      mail: 'ceo@contoso.com',
      phone: '+47 1',
      office: 'Oslo',
      level: 1,
    });
    expect(cardContentOf(getNode(chart, 'dev'))).toMatchObject({ phone: '+47 3', office: null, level: 2 });
  });
});

describe('fullestCardContent', () => {
  it('has every line that someone in the chart has, also when no single person has them all', () => {
    const chart = chartOf(
      makeEmployee('ceo', null, { ...bare, jobTitle: 'CEO' }),
      makeEmployee('lead', 'ceo', { ...bare, mobilePhone: '+47 3' }),
      makeEmployee('dev', 'lead', { ...bare, officeLocation: 'Oslo' }),
    );

    expect(lines(fullestCardContent(chart))).toEqual(['jobTitle', 'phone', 'office']);
  });

  it('leaves out the lines that nobody has', () => {
    expect(lines(fullestCardContent(chartOf(makeEmployee('ceo', null, bare))))).toEqual([]);
  });

  it('has the warning flag when anyone is flagged', () => {
    const chart = chartOf(makeEmployee('ceo'), makeEmployee('stray', null, bare));

    expect(fullestCardContent(chart).flag).toBe('noManager');
    expect(fullestCardContent(chartOf(makeEmployee('ceo'))).flag).toBeNull();
  });

  it('carries nobody\'s text', () => {
    const { name, mail } = fullestCardContent(chartOf(makeEmployee('ceo')));

    expect(name.trim()).toBe('');
    expect(mail?.trim()).toBe('');
  });
});
