// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { makePresence } from '@/testing/makePresence';
import { PresenceDot } from './PresenceDot';

const inAMeeting = makePresence({ availability: 'busy', activity: 'InAMeeting' });

afterEach(cleanup);

describe('PresenceDot', () => {
  it('shows the status as its tooltip in the language of the page', () => {
    const { container } = render(<PresenceDot presence={inAMeeting} size={12} />);

    expect(container.firstElementChild?.getAttribute('title')).toBe('Busy · In a meeting');
  });
});
