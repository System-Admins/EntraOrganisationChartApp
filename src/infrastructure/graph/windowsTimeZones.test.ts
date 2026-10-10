import { describe, expect, it } from 'vitest';
import { isTimeZone } from '@/application/common/timeZones';
import { ianaTimeZone, WINDOWS_TIME_ZONES } from './windowsTimeZones';

describe('ianaTimeZone', () => {
  it('finds the IANA zone of a Windows zone\'s name, as CLDR maps it', () => {
    expect(ianaTimeZone('W. Europe Standard Time')).toBe('Europe/Berlin');
    expect(ianaTimeZone('Romance Standard Time')).toBe('Europe/Paris');
    expect(ianaTimeZone('GMT Standard Time')).toBe('Europe/London');
    expect(ianaTimeZone('FLE Standard Time')).toBe('Europe/Kiev');
    expect(ianaTimeZone('Eastern Standard Time')).toBe('America/New_York');
    expect(ianaTimeZone('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(ianaTimeZone('India Standard Time')).toBe('Asia/Calcutta');
    expect(ianaTimeZone('Tokyo Standard Time')).toBe('Asia/Tokyo');
    expect(ianaTimeZone('AUS Eastern Standard Time')).toBe('Australia/Sydney');
    expect(ianaTimeZone('UTC')).toBe('Etc/UTC');
  });

  it('takes an IANA name as it is', () => {
    expect(ianaTimeZone('Europe/Oslo')).toBe('Europe/Oslo');
  });

  it('knows no other name: a customized time zone, a misspelling, nothing at all, or what every object inherits', () => {
    for (const name of ['Customized Time Zone', 'W Europe Standard Time', 'constructor', 'toString', '', null, undefined]) {
      expect(ianaTimeZone(name), String(name)).toBeNull();
    }
  });

  it('maps every one of the 139 Windows zones to a zone Intl knows', () => {
    const zones = Object.values(WINDOWS_TIME_ZONES);

    expect(zones).toHaveLength(139);
    expect(zones.filter((zone) => !isTimeZone(zone))).toEqual([]);
  });
});
