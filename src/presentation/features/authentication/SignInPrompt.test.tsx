// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInFailedError, type Authenticator } from '@/application/abstractions/authenticator';
import { Mediator } from '@/application/common/mediator';
import {
  GetReturnedSignInErrorHandler,
  GetReturnedSignInErrorQuery,
} from '@/application/features/authentication/getReturnedSignInError';
import { SignInCommand, SignInHandler } from '@/application/features/authentication/signIn';
import type { SupportDesk } from '@/application/settings/appSettings';
import { MediatorProvider } from '../../shared/mediatorContext';
import { SupportDeskProvider } from '../../shared/supportDesk';
import { SignInPrompt } from './SignInPrompt';

const DECLINED = new SignInFailedError('declined', 'Microsoft sign-in error access_denied (AADSTS65004).');

function renderPrompt(authenticator: Partial<Authenticator>, desk: SupportDesk | null = null) {
  const signedIn = vi.fn();
  const complete = { returnedSignInError: null, signIn: () => Promise.resolve(), ...authenticator } as Authenticator;
  const mediator = new Mediator()
    .register(SignInCommand, new SignInHandler(complete))
    .register(GetReturnedSignInErrorQuery, new GetReturnedSignInErrorHandler(complete));
  render(
    <MediatorProvider mediator={mediator}>
      <SupportDeskProvider desk={desk}>
        <SignInPrompt onSignedIn={signedIn} />
      </SupportDeskProvider>
    </MediatorProvider>,
  );
  return { signedIn, button: screen.getByRole<HTMLButtonElement>('button', { name: 'Sign in' }) };
}

afterEach(cleanup);

describe('SignInPrompt', () => {
  it('says why the sign-in that led back to the page failed, with the code in a smaller line', async () => {
    renderPrompt({ returnedSignInError: DECLINED });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/the permission that Microsoft asked for was not given\. Try again and accept it/);
    expect(alert.textContent).not.toContain('access_denied');
    expect(screen.getByText('Technical details:').textContent).toBe(
      'Technical details: Microsoft sign-in error access_denied (AADSTS65004).',
    );
  });

  it('asks for a sign-in with the work account, and shows no error when no sign-in failed', async () => {
    const { button } = renderPrompt({});
    await Promise.resolve();

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Sign in to see the organization chart');
    expect(screen.getByText("Use your work account. The chart is read from your organization's directory.")).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Technical details/)).toBeNull();
    expect(button.disabled).toBe(false);
  });

  it('replaces the earlier failure with the outcome of a new attempt', async () => {
    const signIn = vi
      .fn<Authenticator['signIn']>()
      .mockRejectedValueOnce(new SignInFailedError('popupBlocked', 'Microsoft sign-in error popup_window_error.'))
      .mockResolvedValueOnce();
    const { signedIn, button } = renderPrompt({ returnedSignInError: DECLINED, signIn });
    await screen.findByRole('alert');

    fireEvent.click(button);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button.textContent).toBe('Signing in...');
    expect((await screen.findByRole('alert')).textContent).toMatch(/^The sign-in window was blocked\./);
    expect(screen.getByText('Technical details:').textContent).toBe('Technical details: Microsoft sign-in error popup_window_error.');

    fireEvent.click(button);
    await vi.waitFor(() => {
      expect(signedIn).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks the technical details as English, and disables the button while it signs in', async () => {
    let finish = (): void => undefined;
    const signIn = vi.fn<Authenticator['signIn']>(() => new Promise<void>((resolve) => (finish = resolve)));
    const { signedIn, button } = renderPrompt({ returnedSignInError: DECLINED, signIn });

    await screen.findByRole('alert');
    expect(screen.getByText('Microsoft sign-in error access_denied (AADSTS65004).').getAttribute('lang')).toBe('en');

    fireEvent.click(button);
    expect(button.textContent).toBe('Signing in...');
    expect(button.disabled).toBe(true);
    finish();
    await vi.waitFor(() => {
      expect(signedIn).toHaveBeenCalledOnce();
      expect(button.textContent).toBe('Sign in');
    });
  });

  it('links the support desk after a failure whose words send people to their IT support, and only then', async () => {
    const desk: SupportDesk = { label: 'Contoso Service Desk', url: 'https://servicedesk.contoso.com' };
    const signIn = vi
      .fn<Authenticator['signIn']>()
      .mockRejectedValueOnce(new SignInFailedError('cancelled', 'Microsoft sign-in error user_cancelled.'));
    const { button } = renderPrompt({ returnedSignInError: DECLINED, signIn }, desk);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/if you cannot, ask your IT support\. Contoso Service Desk \(opens in a new tab\)$/);

    fireEvent.click(button);
    expect((await screen.findByRole('alert')).textContent).toBe('The sign-in was cancelled. Try again when you are ready.');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
