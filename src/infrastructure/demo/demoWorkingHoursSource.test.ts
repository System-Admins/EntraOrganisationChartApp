import { describe, expect, it } from 'vitest';
import type { TimeSpan } from '@/application/abstractions/workingHoursSource';
import type { Employee } from '@/domain/employees/employee';
import { DEMO_SIGNED_IN_USER, generateDemoCompany } from './demoEmployeeSource';
import { DemoWorkingHoursSource } from './demoWorkingHoursSource';

/** 13:05 UTC on Thursday 1 October 2026. */
const NOW = Date.UTC(2026, 9, 1, 13, 5);
const HALF_HOUR = 30 * 60_000;

/** Whether each half hour from 14:00 to 22:00 UTC is free. */
const freeHalfHours = (free: readonly TimeSpan[]) =>
  Array.from({ length: 16 }, (_, slot) => Date.UTC(2026, 9, 1, 14) + slot * HALF_HOUR).map((start) =>
    free.some((time) => time.start <= start && start < time.end),
  );
const company = generateDemoCompany();
const source = new DemoWorkingHoursSource(() => NOW);
const zoneOf = async (employee: Employee) => (await source.getWorkingHours(employee))?.timeZone;

describe('DemoWorkingHoursSource', () => {
  it('puts the people of each office in its zone, London an hour behind the others, through the Windows names Outlook gives', async () => {
    const byCity = new Map<string, string | undefined>();
    for (const employee of company) if (employee.jobTitle !== 'Consultant') byCity.set(employee.city ?? '', await zoneOf(employee));

    expect(Object.fromEntries(byCity)).toEqual({
      Oslo: 'Europe/Berlin',
      Stockholm: 'Europe/Berlin',
      Copenhagen: 'Europe/Paris',
      London: 'Europe/London',
    });
  });

  it('has the consultants work from New York or Kolkata, so that the row shows hours behind, and ahead with minutes', async () => {
    const remote = new Set<string | undefined>();
    for (const employee of company) if (employee.jobTitle === 'Consultant') remote.add(await zoneOf(employee));

    expect(remote).toEqual(new Set(['America/New_York', 'Asia/Calcutta']));
  });

  it('gives everyone working hours and a day of free and taken half hours, the same on every visit', async () => {
    const ase = company.find((employee) => employee.id === DEMO_SIGNED_IN_USER.id);
    if (!ase) throw new Error('The demo has no signed-in user.');

    const schedule = await source.getWorkingHours(ase);
    const free = schedule?.free ?? [];
    const freeTime = free.reduce((sum, time) => sum + time.end - time.start, 0);

    expect(schedule?.workingHours?.days.length).toBeGreaterThan(0);
    expect(freeTime).toBeGreaterThan(0);
    expect(freeTime).toBeLessThan(24 * 60 * 60_000);
    expect(free.every((time) => time.start >= Date.UTC(2026, 9, 1, 13) && time.end <= Date.UTC(2026, 9, 2, 13))).toBe(true);
    expect(await source.getWorkingHours(ase)).toEqual(schedule);
    // Asked half an hour later, the half hours both answers cover are free or taken as before.
    const later = await new DemoWorkingHoursSource(() => NOW + HALF_HOUR).getWorkingHours(ase);
    expect(freeHalfHours(later?.free ?? [])).toEqual(freeHalfHours(free));
  });
});
