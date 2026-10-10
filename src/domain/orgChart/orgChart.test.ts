import { describe, expect, it } from 'vitest';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { buildOrgChart } from './buildOrgChart';
import { chartHideRules, descendantIds, namedEmployee, narrowsChart, narrowTo, withHideRules, type OrgChartOptions } from './orgChart';

describe('withHideRules', () => {
  const configured: OrgChartOptions = { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } };
  const narrowed: OrgChartOptions = { topPersons: ['head'], hide: { ...configured.hide, unattached: true }, within: configured };
  const other = { ...SHOW_EVERYONE, disabledAccounts: true };

  it('replaces the rules of a chart that stands on its own', () => {
    expect(withHideRules(configured, other)).toEqual({ topPersons: ['ceo'], hide: other });
    expect(chartHideRules(configured)).toBe(configured.hide);
  });

  it('gives the rules to the chart that is narrowed, and keeps the narrowing to its top persons\' teams', () => {
    const changed = withHideRules(narrowed, other);

    expect(changed.within).toEqual({ topPersons: ['ceo'], hide: other });
    expect(changed.hide).toEqual({ ...other, unattached: true });
    expect(changed.topPersons).toEqual(['head']);
    // The rules of the chart as a whole, which the settings dialog shows, are the narrowed chart's.
    expect(chartHideRules(changed)).toEqual(other);
  });
});

describe('narrowTo', () => {
  const configured: OrgChartOptions = { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } };
  /** A department chart, as ?top= makes it. */
  const department: OrgChartOptions = { topPersons: ['head'], hide: { ...configured.hide, unattached: true }, within: configured };
  const company = [
    makeEmployee('ceo'),
    makeEmployee('head', 'ceo'),
    makeEmployee('lead', 'head'),
    makeEmployee('dev', 'lead'),
    makeEmployee('consultant', 'lead', { isGuest: true }),
    makeEmployee('peer', 'head'),
    makeEmployee('stray'),
  ];

  it('shows one person\'s organization within the chart, under the chart\'s own hide rules', () => {
    const team = narrowTo(configured, 'lead');

    expect(team).toEqual({ topPersons: ['lead'], hide: { ...configured.hide, unattached: true }, within: configured });
    const chart = buildOrgChart(company, team);
    expect(chart.rootIds).toEqual(['lead']);
    expect([...chart.nodes.keys()].sort()).toEqual(['dev', 'lead']);
  });

  it('stays one level deep inside a chart that ?top= narrows, replacing that narrowing', () => {
    const team = narrowTo(department, 'lead');

    expect(team.within).toBe(configured);
    expect(team.topPersons).toEqual(['lead']);
    expect(chartHideRules(team)).toBe(configured.hide);
  });

  it('is worth offering only for someone heading a team that leaves anyone out of the chart', () => {
    const chart = buildOrgChart(company, configured);
    const single = buildOrgChart(company.slice(0, 2), { topPersons: ['ceo'], hide: SHOW_EVERYONE });

    expect(['ceo', 'head', 'lead', 'dev', 'nobody'].map((id) => narrowsChart(chart, id))).toEqual([true, true, true, false, false]);
    // The chart is the top person's team and nothing else, so narrowing to them changes nothing.
    expect(narrowsChart(single, 'ceo')).toBe(false);
  });

  it('is never offered for an unlisted person\'s place, and counts no place among the people it would leave out', () => {
    const hiding = { ...SHOW_EVERYONE, hiddenFromAddressList: true };
    const placed = buildOrgChart(
      [makeEmployee('ceo', null, { hiddenFromAddressList: true }), makeEmployee('lead', 'ceo'), makeEmployee('dev', 'lead'), makeEmployee('aide', 'lead')],
      { topPersons: ['ceo'], hide: hiding },
    );

    expect(narrowsChart(placed, 'ceo')).toBe(false);
    // Only the place at the top would go, which is nobody.
    expect(narrowsChart(placed, 'lead')).toBe(false);
  });

  it('lets the hide rules still reach the chart as a whole, so a change of filters changes the team', () => {
    const team = withHideRules(narrowTo(department, 'lead'), { ...configured.hide, guests: false });

    expect(team.within?.hide.guests).toBe(false);
    expect(team.hide).toMatchObject({ guests: false, unattached: true });
    expect([...buildOrgChart(company, team).nodes.keys()].sort()).toEqual(['consultant', 'dev', 'lead']);
  });
});

describe('descendantIds', () => {
  const chart = buildOrgChart(
    [
      makeEmployee('ceo'),
      makeEmployee('bea', 'ceo'),
      makeEmployee('al', 'ceo'),
      makeEmployee('dev', 'al'),
      makeEmployee('intern', 'dev'),
      makeEmployee('cy', 'al'),
      makeEmployee('guest', 'bea', { isGuest: true }),
    ],
    { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } },
  );

  it('lists everyone below a person in the outline\'s order, each report followed by their own team', () => {
    expect(descendantIds(chart, 'ceo')).toEqual(['al', 'cy', 'dev', 'intern', 'bea']);
    expect(descendantIds(chart, 'al')).toEqual(['cy', 'dev', 'intern']);
  });

  it('lists nobody below someone without reports, and nobody the chart leaves out', () => {
    expect(descendantIds(chart, 'intern')).toEqual([]);
    expect(descendantIds(chart, 'bea')).toEqual([]);
  });
});

describe('namedEmployee', () => {
  it('gives the people the chart names, and nobody for an unlisted person\'s place or anyone it leaves out', () => {
    const chart = buildOrgChart(
      [makeEmployee('ceo'), makeEmployee('auditHead', 'ceo', { hiddenFromAddressList: true }), makeEmployee('auditor', 'auditHead')],
      { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } },
    );

    expect(namedEmployee(chart, 'auditor')?.displayName).toBe('Auditor');
    expect(chart.nodes.has('auditHead')).toBe(true);
    expect(namedEmployee(chart, 'auditHead')).toBeUndefined();
    expect(namedEmployee(chart, 'nobody')).toBeUndefined();
  });
});
