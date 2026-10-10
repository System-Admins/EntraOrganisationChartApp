import { describe, expect, it } from 'vitest';
import { makePresence } from '@/testing/makePresence';
import { describePresence, presenceTone } from './describePresence';

describe('describePresence', () => {
  it('combines availability, activity and out of office without repeating itself', () => {
    expect(describePresence(makePresence({ availability: 'busy', activity: 'InAMeeting' }), 'en')).toBe('Busy · In a meeting');
    expect(describePresence(makePresence({ availability: 'away', activity: 'BeRightBack' }), 'en')).toBe('Away · Be right back');
    expect(describePresence(makePresence({ availability: 'offline', activity: 'OutOfOffice', outOfOffice: true }), 'en')).toBe(
      'Out of office · Offline',
    );
    expect(describePresence(makePresence({ availability: 'available', activity: 'SomethingNew' }), 'en')).toBe(
      'Available · Something new',
    );
  });

  it('leaves the note, the automatic reply and the work location to the details panel', () => {
    const noted = makePresence({
      availability: 'offline',
      activity: 'OutOfOffice',
      outOfOffice: true,
      outOfOfficeMessage: 'On holiday',
      statusMessage: 'Back on Monday',
      workLocation: 'timeOff',
    });

    expect(describePresence(noted, 'en')).toBe('Out of office · Offline');
  });

  it('says the status is unknown only where nothing else is known about it', () => {
    expect(describePresence(makePresence({ availability: 'unknown' }), 'en')).toBe('Status unknown');
    expect(describePresence(makePresence({ availability: 'unknown', outOfOffice: true }), 'en')).toBe('Out of office');
    expect(describePresence(makePresence({ availability: 'unknown', activity: 'InAMeeting' }), 'en')).toBe('In a meeting');
  });

  it('colours out of office over the availability and shows nothing for an unknown status', () => {
    expect(presenceTone(makePresence({ availability: 'busy', outOfOffice: true }))).toBe('outOfOffice');
    expect(presenceTone(makePresence({ availability: 'unknown' }))).toBeNull();
  });
});
