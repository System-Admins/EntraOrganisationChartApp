// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import type { Request, Sender } from '@/application/common/mediator';
import { GetEmployeePhotoQuery } from '@/application/features/photos/getEmployeePhoto';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import { DisplayOptionsProvider } from '../../shared/displayOptions';
import { MediatorProvider } from '../../shared/mediatorContext';
import { PresenceProvider } from '../presence/presenceContext';
import { UserProfile } from './UserProfile';

const anna: SignedInUser = { id: 'anna', displayName: 'Anna Jensen', userPrincipalName: 'anna@contoso.com', isGuest: false };

function renderProfile(user: SignedInUser = anna) {
  const requests: Request<unknown>[] = [];
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      requests.push(request);
      const answer = request instanceof GetEmployeePhotoQuery ? `data:image/png;base64,${request.employeeId}` : new Map();
      return Promise.resolve(answer as T);
    },
  };
  const onShow = vi.fn();
  const { container } = render(
    <MediatorProvider mediator={mediator}>
      <DisplayOptionsProvider value={{ showPhotos: true }}>
        <PresenceProvider enabled>
          <UserProfile user={user} onShow={onShow} />
        </PresenceProvider>
      </DisplayOptionsProvider>
    </MediatorProvider>,
  );
  return { container, requests, onShow };
}

afterEach(cleanup);

describe('UserProfile', () => {
  it('names the account and asks for the user\'s own place in the chart when pressed', () => {
    const { onShow } = renderProfile();

    const profile = screen.getByRole('button', {
      name: 'Signed in as Anna Jensen (anna@contoso.com). Show me in the chart',
    });
    expect(profile.textContent).toBe('AJAnna Jensen');
    fireEvent.click(profile);

    expect(onShow).toHaveBeenCalledOnce();
  });

  it('says the address once for an account without a name', () => {
    renderProfile({ id: 'ola', displayName: 'ola@contoso.com', userPrincipalName: 'ola@contoso.com', isGuest: false });

    expect(screen.getByRole('button', { name: 'Signed in as ola@contoso.com. Show me in the chart' })).toBeTruthy();
  });

  it('shows its name as a tooltip to the mouse, as the toolbar\'s buttons do', () => {
    renderProfile();
    const profile = screen.getByRole('button');

    fireEvent.pointerEnter(profile, { pointerType: 'mouse' });
    expect(profile.textContent).toContain('Signed in as Anna Jensen (anna@contoso.com). Show me in the chart');
    expect(profile.hasAttribute('title')).toBe(false);

    act(() => {
      fireEvent.pointerLeave(profile);
    });
    expect(profile.textContent).toBe('AJAnna Jensen');
  });

  it('loads the photo by the account\'s directory id, without asking for presence', async () => {
    const { container, requests } = renderProfile();

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,anna');
    });
    // Longer than the tracker waits before it fetches the people it was asked to watch.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(requests.some((request) => request instanceof GetPresencesQuery)).toBe(false);
  });
});
