import { describe, expect, it } from 'vitest';
import { telHref } from './telHref';

describe('telHref', () => {
  it('keeps only the digits and a leading plus', () => {
    expect(telHref('+47 22 33 44 55')).toBe('tel:+4722334455');
    expect(telHref('(425) 555-0100')).toBe('tel:4255550100');
  });

  it('drops a national (0) after the country code, but not without one', () => {
    expect(telHref('+44 (0)20 7946 0000')).toBe('tel:+442079460000');
    expect(telHref('(0)20 7946 0000')).toBe('tel:02079460000');
  });

  it('turns an extension into ;ext= instead of dialling it', () => {
    expect(telHref('+1 425 555 0100 x123')).toBe('tel:+14255550100;ext=123');
    expect(telHref('+1 425 555 0100 ext. 123')).toBe('tel:+14255550100;ext=123');
    expect(telHref('+47 22 33 44 55 #12')).toBe('tel:+4722334455;ext=12');
  });
});
