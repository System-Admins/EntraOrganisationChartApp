import { describe, expect, it } from 'vitest';
import { formatDateTime } from './formatDateTime';

describe('formatDateTime', () => {
  it('writes an ISO date and a zero-padded 24-hour time', () => {
    expect(formatDateTime(new Date(2026, 8, 29, 17, 58))).toBe('2026-09-29 17:58');
    expect(formatDateTime(new Date(2027, 0, 5, 7, 3))).toBe('2027-01-05 07:03');
  });
});
