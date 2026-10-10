// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ShareResult } from '@/application/abstractions/employeeSharing';
import type { Request, Sender } from '@/application/common/mediator';
import { GetShareMethodQuery } from '@/application/features/share/getShareMethod';
import { ShareEmployeeCommand } from '@/application/features/share/shareEmployee';
import { makeEmployee } from '@/testing/makeEmployee';
import { MediatorProvider } from '../../shared/mediatorContext';
import { ShareAction } from './ShareAction';

/** The button on a host that copies links and answers every press with `result`. */
function renderShare(result: ShareResult) {
  const answer = (request: Request<unknown>): unknown => {
    if (request instanceof GetShareMethodQuery) return 'copy';
    if (request instanceof ShareEmployeeCommand) return result;
    return undefined;
  };
  const mediator: Sender = { send: <T,>(request: Request<T>) => Promise.resolve(answer(request) as T) };
  render(
    <MediatorProvider mediator={mediator}>
      <ShareAction employee={makeEmployee('anna')} />
    </MediatorProvider>,
  );
}

afterEach(cleanup);

describe('ShareAction', () => {
  it('says what a press does with the link, and that it was copied', async () => {
    renderShare({ outcome: 'copied' });

    const link = await screen.findByRole('button', { name: 'Copy link' });
    expect([link.textContent, link.title]).toEqual(['Link', 'Copy link']);
    fireEvent.click(link);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Link copied');
    });
  });
});
