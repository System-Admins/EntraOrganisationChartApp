import { describe, expect, it } from 'vitest';
import { HIDE_CATEGORIES } from '@/domain/orgChart/hideRules';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { describeFilterChanges } from './describeFilterChanges';
import { FILTER_LABELS } from './strings';

describe('describeFilterChanges', () => {
  const defaults = { ...SHOW_EVERYONE, withoutManager: true, guests: true };

  it('says nothing while the chart is as config.json sets it up', () => {
    expect(describeFilterChanges(defaults, { ...defaults }, 'en')).toBeNull();
  });

  it('names the people who were added and those who were taken out, in the words of the checkboxes', () => {
    expect(describeFilterChanges(defaults, { ...defaults, withoutManager: false, guests: false }, 'en')).toBe(
      'Filters changed: also showing people without a manager and guests.',
    );
    expect(describeFilterChanges(defaults, { ...defaults, guests: false, withoutJobTitle: true, unlicensed: true }, 'en')).toBe(
      'Filters changed: also showing guests; hiding accounts without a license and people without a job title.',
    );
  });

  it('has a label for every hide rule', () => {
    expect(Object.keys(FILTER_LABELS.en)).toEqual([...HIDE_CATEGORIES]);
  });
});
