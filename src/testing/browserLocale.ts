import { vi } from 'vitest';

// Taken before any stub, so that stubbing again never wraps a stub.
const BrowserCollator = Intl.Collator;

/** Collators made without a locale follow the browser's own language; this makes it `locale` until the mocks are restored. */
export function stubBrowserLocale(locale: string): void {
  vi.spyOn(Intl, 'Collator').mockImplementation(function (locales, options) {
    return new BrowserCollator(locales ?? locale, options);
  });
}
