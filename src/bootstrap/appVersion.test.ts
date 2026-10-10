import { describe, expect, it } from 'vitest';
import { appVersion } from './appVersion';

describe('appVersion', () => {
  it('puts the pipeline\'s build ID in place of the last part of package.json\'s version, as the Teams package does', () => {
    expect(appVersion('1.0.0', '123')).toBe('1.0.123');
    expect(appVersion('2.4.17', '9081')).toBe('2.4.9081');
  });

  it('says "dev" for a build that no pipeline numbered', () => {
    expect(appVersion('1.0.0', undefined)).toBe('dev');
    expect(appVersion('1.0.0', '')).toBe('dev');
  });
});
