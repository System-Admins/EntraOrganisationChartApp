// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import { makeEmployee } from '@/testing/makeEmployee';
import { makePresence } from '@/testing/makePresence';
import { MediatorProvider } from '../../shared/mediatorContext';
import { PresenceProvider } from '../presence/presenceContext';
import { Avatar } from './Avatar';

const mediator: Sender = { send: () => Promise.reject(new Error('Photos are off.')) };

function fillOf(displayName: string) {
  const { container } = render(
    <MediatorProvider mediator={mediator}>
      <Avatar employee={makeEmployee('a', null, { displayName })} size={40} />
    </MediatorProvider>,
  );
  const avatar = container.querySelector('span > span');
  return { text: avatar?.textContent, fill: avatar instanceof HTMLElement ? avatar.style.background : undefined };
}

afterEach(cleanup);

describe('Avatar', () => {
  it('shows the initials of the first and last name', () => {
    expect(fillOf('Anna Maria Lund-Berg').text).toBe('AB');
    expect(fillOf('Cher').text).toBe('C');
  });

  it('fills the initials with a theme colour that stays with the name', () => {
    const fills = ['Anna Lund', 'Ola Berg', 'Kari Dahl', 'Per Moe', 'Ingrid Solberg', 'Erik Haugen'].map((name) => fillOf(name).fill);

    for (const fill of fills) expect(fill).toMatch(/^var\(--initials-[1-8]\)$/);
    expect(new Set(fills).size).toBeGreaterThan(1);
    expect(fillOf('Anna Lund').fill).toBe(fills[0]);
  });

  it('names the status on its presence dot in the language of the page', async () => {
    const away: Sender = {
      send: <T,>(request: Request<T>) =>
        Promise.resolve(
          (request instanceof GetPresencesQuery
            ? new Map(request.employeeIds.map((id) => [id, makePresence({ availability: 'away', activity: 'BeRightBack' })]))
            : undefined) as T,
        ),
    };
    const { container } = render(
      <MediatorProvider mediator={away}>
        <PresenceProvider enabled>
          <Avatar employee={makeEmployee('a', null, { displayName: 'Anna Lund' })} size={40} />
        </PresenceProvider>
      </MediatorProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[title]')?.getAttribute('title')).toBe('Away · Be right back');
    });
  });
});
