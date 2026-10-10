import { describe, expect, it } from 'vitest';
import type { DirectorySnapshot } from '@/application/abstractions/employeeDirectory';
import type { Employee } from '@/domain/employees/employee';
import { HIDE_CATEGORIES, type HideRules } from '@/domain/orgChart/hideRules';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { GetFilterEffectsHandler, GetFilterEffectsQuery } from './getFilterEffects';

/** `employees` can be swapped for a refreshed directory, which comes as a new snapshot. */
function handlerFor(employees: readonly Employee[]) {
  let snapshot: DirectorySnapshot = { employees, loadedAt: new Date(2026, 9, 1) };
  const provider = new OrgChartProvider(directoryOf(() => snapshot));
  const handler = new GetFilterEffectsHandler(provider);
  const effectsOf = (options: OrgChartOptions) => handler.handle(new GetFilterEffectsQuery(options));
  const refresh = (refreshed: readonly Employee[]) => {
    snapshot = { employees: refreshed, loadedAt: new Date(2026, 9, 2) };
  };
  return { effectsOf, provider, refresh };
}

/** The rules config.json starts from when it sets none. */
const DEFAULT_RULES: HideRules = {
  ...SHOW_EVERYONE,
  withoutManager: true,
  withHiddenManager: true,
  inManagerCycle: true,
  disabledAccounts: true,
  guests: true,
  unlicensed: true,
  hiddenFromAddressList: true,
};

describe('GetFilterEffectsHandler', () => {
  const employees = [
    makeEmployee('ceo'),
    makeEmployee('former', 'ceo', { accountEnabled: false }),
    makeEmployee('analyst', 'former'),
    makeEmployee('assistant', 'analyst'),
    makeEmployee('consultant', 'ceo', { isGuest: true }),
    makeEmployee('dev', 'ceo'),
    makeEmployee('researcher'),
    // Hidden twice: shown as a disabled account, it would still be a person without a manager.
    makeEmployee('room', null, { accountEnabled: false }),
  ];
  const options: OrgChartOptions = { topPersons: ['ceo'], hide: DEFAULT_RULES };

  it('counts the people each rule hides, a disabled manager\'s whole branch included', async () => {
    const { effectsOf } = handlerFor(employees);

    expect(await effectsOf(options)).toEqual({
      withoutManager: 1,
      withHiddenManager: 2,
      inManagerCycle: 0,
      disabledAccounts: 3,
      guests: 1,
      unlicensed: 0,
      withoutJobTitle: 0,
      hiddenFromAddressList: 0,
      unattached: 0,
    });
  });

  it('counts the people the address list hides, those it leaves unnamed above a team included, whether the rule is on or off', async () => {
    const { effectsOf } = handlerFor([
      ...employees,
      makeEmployee('auditHead', 'ceo', { hiddenFromAddressList: true }),
      makeEmployee('auditor', 'auditHead'),
      makeEmployee('advisor', 'ceo', { hiddenFromAddressList: true }),
    ]);

    const effects = await effectsOf(options);
    const whileOff = await effectsOf({ ...options, hide: { ...DEFAULT_RULES, hiddenFromAddressList: false } });

    expect(effects.hiddenFromAddressList).toBe(2);
    expect(whileOff.hiddenFromAddressList).toBe(2);
    // A rule that hides the auditor takes the nameless place with them, which counts as nobody.
    const guestAuditor = await handlerFor([
      ...employees,
      makeEmployee('auditHead', 'ceo', { hiddenFromAddressList: true }),
      makeEmployee('auditor', 'auditHead', { isGuest: true }),
    ]).effectsOf({ ...options, hide: { ...DEFAULT_RULES, guests: false } });
    expect(guestAuditor.guests).toBe(2);
  });

  it('counts each rule with the other rules as they are', async () => {
    const { effectsOf } = handlerFor(employees);

    // The disabled manager's team stays in the chart, flagged, so the rule hides only the manager.
    const effects = await effectsOf({ ...options, hide: { ...DEFAULT_RULES, withHiddenManager: false } });

    expect(effects.disabledAccounts).toBe(1);
    expect(effects.withHiddenManager).toBe(2);
  });

  it('counts the people a rule that is off lets into the chart', async () => {
    const { effectsOf } = handlerFor(employees);

    const effects = await effectsOf({ ...options, hide: { ...DEFAULT_RULES, guests: false, withoutManager: false } });

    expect(effects.guests).toBe(1);
    expect(effects.withoutManager).toBe(1);
    // Everyone outside the CEO's team: the researcher, who now heads a branch of their own.
    expect(effects.unattached).toBe(1);
  });

  it('counts person by person, as hiding one member of a circular manager chain can bring the others in', async () => {
    const { effectsOf } = handlerFor([
      makeEmployee('ceo'),
      makeEmployee('a', 'b', { jobTitle: null }),
      makeEmployee('b', 'a'),
      makeEmployee('c', 'b'),
    ]);

    // Hiding A breaks the circle: B and C would then show, flagged "Manager not shown", while A is not shown now.
    const effects = await effectsOf({ topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, inManagerCycle: true } });

    expect(effects.withoutJobTitle).toBe(0);
    expect(effects.inManagerCycle).toBe(3);
  });

  it('leaves out the rule about the top persons\' teams where the chart names no top persons', async () => {
    const { effectsOf } = handlerFor(employees);

    const effects = await effectsOf({ topPersons: [], hide: DEFAULT_RULES });

    expect(effects).not.toHaveProperty('unattached');
    expect(effects.guests).toBe(1);
  });

  it('switches the rules of the chart that ?top= narrows, whose people it may show', async () => {
    const { effectsOf } = handlerFor([
      makeEmployee('ceo'),
      makeEmployee('lead', 'ceo'),
      makeEmployee('guest', 'lead', { isGuest: true }),
      makeEmployee('dev', 'lead'),
    ]);
    const configured: OrgChartOptions = { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, guests: true } };
    const narrowed: OrgChartOptions = { topPersons: ['lead'], hide: { ...configured.hide, unattached: true }, within: configured };

    const effects = await effectsOf(narrowed);

    expect(effects.guests).toBe(1);
    expect(effects.unattached).toBe(0);
  });

  it('lets the page take its turn between the charts it builds, so that it keeps answering clicks and keys', async () => {
    const { effectsOf } = handlerFor(employees);
    let turns = 0;
    let turn: ReturnType<typeof setTimeout> | undefined;
    const takeTurn = () => {
      turns++;
      turn = setTimeout(takeTurn, 0);
    };
    turn = setTimeout(takeTurn, 0);

    try {
      await effectsOf(options);
    } finally {
      clearTimeout(turn);
    }

    // One chart per rule, top persons named: a turn before each build.
    expect(turns).toBeGreaterThanOrEqual(HIDE_CATEGORIES.length);
  });

  it('builds the other charts itself, so that the page\'s chart stays the one that is shared', async () => {
    const { effectsOf, provider } = handlerFor(employees);
    const { chart } = await provider.get(options);

    await effectsOf(options);

    expect((await provider.get(options)).chart).toBe(chart);
  });

  it('answers from what it counted for the same directory and rules, and counts a refreshed directory again', async () => {
    const { effectsOf, refresh } = handlerFor(employees);
    const counted = await effectsOf(options);

    expect(await effectsOf({ ...options, hide: { ...options.hide } })).toBe(counted);
    expect(await effectsOf({ ...options, hide: { ...DEFAULT_RULES, guests: false } })).not.toBe(counted);

    refresh([...employees, makeEmployee('visitor', 'dev', { isGuest: true })]);
    expect((await effectsOf(options)).guests).toBe(2);
  });
});
