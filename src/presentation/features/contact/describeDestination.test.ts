import { describe, expect, it } from 'vitest';
import { describeDestination } from './describeDestination';

describe('describeDestination', () => {
  it('says where a contact button opens in the language of the page', () => {
    expect(describeDestination('teamsHere', 'en')).toBe('Opens in Microsoft Teams');
    expect(describeDestination('outlookNewWindow', 'en')).toBe('Opens Outlook on the web in a new window');
  });
});
