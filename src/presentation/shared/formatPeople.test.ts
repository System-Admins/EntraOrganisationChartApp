import { describe, expect, it } from 'vitest';
import { formatPeople } from './formatPeople';

describe('formatPeople', () => {
  it('uses the singular only for exactly one', () => {
    expect(formatPeople(1, 'en')).toBe('1 person');
    expect(formatPeople(0, 'en')).toBe('0 people');
    expect(formatPeople(2, 'en')).toBe('2 people');
  });

  it('writes the number and the word as the language does', () => {
    expect(formatPeople(1234, 'en')).toBe('1,234 people');
  });
});
