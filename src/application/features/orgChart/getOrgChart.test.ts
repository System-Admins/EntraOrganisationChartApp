import { describe, expect, it } from 'vitest';
import type { DirectorySnapshot } from '@/application/abstractions/employeeDirectory';
import type { HideRules } from '@/domain/orgChart/hideRules';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { OrgChartProvider } from '../../common/orgChartProvider';
import { GetOrgChartHandler, GetOrgChartQuery } from './getOrgChart';

const hide: HideRules = { ...SHOW_EVERYONE, withoutManager: true, disabledAccounts: true };

describe('GetOrgChartHandler', () => {
  const loadedAt = new Date('2026-09-29T08:00:00Z');
  const snapshot: DirectorySnapshot = { employees: [makeEmployee('ceo')], loadedAt };
  const provider = new OrgChartProvider(directoryOf(() => snapshot));
  const options = { topPersons: ['ceo'], hide };

  it('marks snapshots older than the refresh age as stale', async () => {
    const at = (minutesLater: number) => () => loadedAt.getTime() + minutesLater * 60_000;

    const fresh = await new GetOrgChartHandler(provider, 60 * 60_000, at(59)).handle(new GetOrgChartQuery(options));
    const stale = await new GetOrgChartHandler(provider, 60 * 60_000, at(61)).handle(new GetOrgChartQuery(options));

    expect(fresh.isStale).toBe(false);
    expect(stale.isStale).toBe(true);
    expect(stale.loadedAt).toBe(loadedAt);
  });

  it('reuses the built chart while snapshot and options are unchanged', async () => {
    const handler = new GetOrgChartHandler(provider, 0);

    const first = await handler.handle(new GetOrgChartQuery(options));
    const second = await handler.handle(new GetOrgChartQuery({ ...options }));
    const other = await handler.handle(new GetOrgChartQuery({ ...options, hide: { ...hide, guests: !hide.guests } }));

    expect(second.chart).toBe(first.chart);
    expect(other.chart).not.toBe(first.chart);
  });
});
