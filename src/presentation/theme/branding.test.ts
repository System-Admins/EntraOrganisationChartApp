// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Branding } from '@/application/settings/branding';
import { applyLanguage, chartTitle } from './branding';

const BRANDING: Branding = {
  title: null,
  logoUrl: null,
  logoUrlDark: null,
  logoAlt: null,
  faviconUrl: null,
  fontFamily: null,
  colors: {},
  darkColors: {},
};

afterEach(() => {
  document.documentElement.removeAttribute('lang');
  document.title = '';
});

describe('chartTitle', () => {
  it('is the title config.json gives, else the chart\'s own name in the language, and never empty', () => {
    expect(chartTitle({ ...BRANDING, title: 'Contoso organization' }, 'en')).toBe('Contoso organization');
    expect(chartTitle(BRANDING, 'en')).toBe('Organization chart');
    expect(chartTitle({ ...BRANDING, title: '' }, 'en')).toBe('Organization chart');
    expect(chartTitle(null, 'en')).toBe('Organization chart');
  });
});

describe('applyLanguage', () => {
  it('tells the browser and screen readers the page\'s language, and names the page', () => {
    applyLanguage('en', { ...BRANDING, title: 'Contoso organization' });
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Contoso organization');
  });
});
