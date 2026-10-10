import { describe, expect, it, vi } from 'vitest';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { CalendarConsentRequiredError } from '@/application/abstractions/workingHoursSource';
import { makeEmployee } from '@/testing/makeEmployee';
import { GraphRequestError, type GraphClient } from './graphClient';
import { GraphWorkingHoursSource, toWorkSchedule, type GraphScheduleInformation } from './graphWorkingHoursSource';

/** 13:05:20 UTC on Thursday 1 October 2026, in the half hour that starts at 13:00. */
const NOW = Date.UTC(2026, 9, 1, 13, 5, 20);
const FROM = Date.UTC(2026, 9, 1, 13, 0);
const HALF_HOUR = 30 * 60_000;
const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

/** Monday to Friday 08:00-17:00 on Central European time; busy until 14:00 UTC, free for an hour, then tentative and busy. */
const annas: GraphScheduleInformation = {
  scheduleId: 'anna@contoso.com',
  availabilityView: '220012',
  workingHours: {
    daysOfWeek: [...WEEK],
    startTime: '08:00:00.0000000',
    endTime: '17:00:00.0000000',
    timeZone: { name: 'W. Europe Standard Time' },
  },
};

const anna = makeEmployee('anna');

function sourceWith(postJson: (path: string, body: unknown) => Promise<unknown>) {
  const spy = vi.fn(postJson);
  return { source: new GraphWorkingHoursSource({ postJson: spy } as unknown as GraphClient, () => NOW), spy };
}

describe('GraphWorkingHoursSource', () => {
  it('asks getSchedule for the person\'s calendar in half hours, for a day from the half hour it is in', async () => {
    const { source, spy } = sourceWith(() => Promise.resolve({ value: [annas] }));

    const schedule = await source.getWorkingHours(anna);

    expect(spy).toHaveBeenCalledExactlyOnceWith('/me/calendar/getSchedule', {
      schedules: ['anna@contoso.com'],
      startTime: { dateTime: '2026-10-01T13:00:00', timeZone: 'UTC' },
      endTime: { dateTime: '2026-10-02T13:00:00', timeZone: 'UTC' },
      availabilityViewInterval: 30,
    });
    expect(schedule).toEqual({
      timeZone: 'Europe/Berlin',
      workingHours: { days: WEEK, start: 8 * 60, end: 17 * 60 },
      free: [{ start: FROM + 2 * HALF_HOUR, end: FROM + 4 * HALF_HOUR }],
    });
  });

  it('finds the person\'s schedule by address in any letter case', async () => {
    const someoneElse = { ...annas, scheduleId: 'ola@contoso.com', availabilityView: '000000' };
    const { source } = sourceWith(() => Promise.resolve({ value: [someoneElse, { ...annas, scheduleId: 'Anna@Contoso.com' }] }));

    expect((await source.getWorkingHours(anna))?.free).toEqual([{ start: FROM + 2 * HALF_HOUR, end: FROM + 4 * HALF_HOUR }]);
  });

  it('knows nothing of a person whose schedule Graph leaves out', async () => {
    const { source } = sourceWith(() => Promise.resolve({ value: [] }));

    await expect(source.getWorkingHours(anna)).resolves.toBeNull();
  });

  it('asks nothing for a person without an e-mail address, who has no mailbox to ask', async () => {
    const { source, spy } = sourceWith(() => Promise.resolve({ value: [annas] }));

    await expect(source.getWorkingHours(makeEmployee('ola', null, { mail: null }))).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('turns a token that needs interaction into CalendarConsentRequiredError, which Turn on answers', async () => {
    const { source } = sourceWith(() => Promise.reject(new SignInRequiredError()));

    await expect(source.getWorkingHours(anna)).rejects.toBeInstanceOf(CalendarConsentRequiredError);
  });

  it('words a refusal for calendars, where the client\'s own words are about the user directory, and passes other failures on', async () => {
    const refusal = new GraphRequestError(403, 'ErrorAccessDenied', 'Microsoft Graph denied access to the user directory.');
    const outage = new GraphRequestError(503, null, 'Microsoft Graph request failed (503): Service Unavailable');

    const refused: unknown = await sourceWith(() => Promise.reject(refusal)).source.getWorkingHours(anna).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(GraphRequestError);
    expect(refused).toMatchObject({ status: 403, code: 'ErrorAccessDenied', failure: 'accessDenied' });
    expect((refused as Error).message).toContain('Calendars.ReadBasic');
    await expect(sourceWith(() => Promise.reject(outage)).source.getWorkingHours(anna)).rejects.toBe(outage);
  });
});

describe('toWorkSchedule', () => {
  it('joins free half hours that follow each other, and counts tentative, busy and out of office as taken', () => {
    expect(toWorkSchedule({ ...annas, availabilityView: '0012300' }, FROM)?.free).toEqual([
      { start: FROM, end: FROM + 2 * HALF_HOUR },
      { start: FROM + 5 * HALF_HOUR, end: FROM + 7 * HALF_HOUR },
    ]);
    expect(toWorkSchedule({ ...annas, availabilityView: '2222' }, FROM)?.free).toEqual([]);
  });

  it('keeps the working hours of a calendar Graph could not read, but leaves its free times unknown, not free', () => {
    const tooMany: GraphScheduleInformation = {
      ...annas,
      availabilityView: '000000',
      error: {
        message: 'The result set contains too many calendar entries. The allowed size is 1000; the actual size is 1520.',
        responseCode: '5006',
      },
    };

    expect(toWorkSchedule(tooMany, FROM)).toEqual({
      timeZone: 'Europe/Berlin',
      workingHours: { days: WEEK, start: 8 * 60, end: 17 * 60 },
      free: null,
    });
    expect(toWorkSchedule({ ...annas, availabilityView: '' }, FROM)?.free).toBeNull();
  });

  it('knows nothing without working hours, as of a mailbox Graph found no calendar for, or with a zone of its own', () => {
    const notFound: GraphScheduleInformation = {
      scheduleId: 'gone@contoso.com',
      availabilityView: '',
      error: { message: 'The mailbox could not be found.', responseCode: 'ErrorMailRecipientNotFound' },
    };
    const customized = { ...annas, workingHours: { ...annas.workingHours, timeZone: { name: 'Customized Time Zone' } } };

    expect(toWorkSchedule(undefined, FROM)).toBeNull();
    expect(toWorkSchedule(notFound, FROM)).toBeNull();
    expect(toWorkSchedule({ ...annas, workingHours: null }, FROM)).toBeNull();
    expect(toWorkSchedule(customized, FROM)).toBeNull();
  });

  it('takes the zone of working hours by its IANA name too', () => {
    const named = { ...annas, workingHours: { ...annas.workingHours, timeZone: { name: 'Europe/Oslo' } } };

    expect(toWorkSchedule(named, FROM)?.timeZone).toBe('Europe/Oslo');
  });

  it('reads working days in any letter case, and no working hours from days or times it cannot read', () => {
    const hours = (workingHours: Partial<NonNullable<GraphScheduleInformation['workingHours']>>) =>
      toWorkSchedule({ ...annas, workingHours: { ...annas.workingHours, ...workingHours } }, FROM)?.workingHours;

    expect(hours({ daysOfWeek: ['Friday', 'monday'], startTime: '07:30:00', endTime: '15:45:00.0000000' })).toEqual({
      days: ['monday', 'friday'],
      start: 7 * 60 + 30,
      end: 15 * 60 + 45,
    });
    expect(hours({ daysOfWeek: [] })).toBeNull();
    expect(hours({ startTime: '8:00' })).toBeNull();
    expect(hours({ endTime: '24:00:00.0000000' })).toBeNull();
    expect(hours({ endTime: null })).toBeNull();
  });
});
