import type { WorkingHoursSource, WorkSchedule } from '@/application/abstractions/workingHoursSource';
import type { Employee } from '@/domain/employees/employee';
import { PERIOD_MS, SLOT_MS, toWorkSchedule, type GraphScheduleInformation } from '../graph/graphWorkingHoursSource';
import { stableHash } from './stableHash';

type GraphWorkingHours = NonNullable<GraphScheduleInformation['workingHours']>;

/** Each office's zone by the Windows name Outlook gives it: London is an hour behind the others. */
const OFFICE_ZONES: Readonly<Record<string, string>> = {
  Oslo: 'W. Europe Standard Time',
  Stockholm: 'W. Europe Standard Time',
  Copenhagen: 'Romance Standard Time',
  London: 'GMT Standard Time',
};

/** Where the consultants, who are contractors, work from: hours behind the offices, and hours and a half ahead of them. */
const REMOTE_ZONES = ['Eastern Standard Time', 'India Standard Time'];

const WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

const WORKING_HOURS: readonly Omit<GraphWorkingHours, 'timeZone'>[] = [
  { daysOfWeek: WEEK, startTime: '08:00:00.0000000', endTime: '16:00:00.0000000' },
  { daysOfWeek: WEEK, startTime: '09:00:00.0000000', endTime: '17:00:00.0000000' },
  { daysOfWeek: WEEK, startTime: '07:30:00.0000000', endTime: '15:30:00.0000000' },
  { daysOfWeek: WEEK.slice(0, 4), startTime: '08:00:00.0000000', endTime: '14:00:00.0000000' },
];

/** Answers as getSchedule would, through the same mapping: working hours in the person's zone and about a third of the half hours taken. */
export class DemoWorkingHoursSource implements WorkingHoursSource {
  constructor(private readonly now: () => number = () => Date.now()) {}

  getWorkingHours({ id, city, jobTitle }: Employee): Promise<WorkSchedule | null> {
    const seed = stableHash(id);
    const zone = jobTitle === 'Consultant' ? REMOTE_ZONES[seed % REMOTE_ZONES.length] : OFFICE_ZONES[city ?? ''];
    const hours = WORKING_HOURS[seed % WORKING_HOURS.length];
    if (zone === undefined || hours === undefined) return Promise.resolve(null);
    const from = Math.floor(this.now() / SLOT_MS) * SLOT_MS;
    // Each half hour by its own number, so that it stays taken or free as the day goes on and on every visit.
    const availabilityView = Array.from({ length: PERIOD_MS / SLOT_MS }, (_, slot) =>
      stableHash(`${id}:${String(from / SLOT_MS + slot)}`) % 3 === 0 ? '2' : '0',
    ).join('');
    return Promise.resolve(toWorkSchedule({ availabilityView, workingHours: { ...hours, timeZone: { name: zone } } }, from));
  }
}
