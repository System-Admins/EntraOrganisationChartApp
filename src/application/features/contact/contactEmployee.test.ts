import { describe, expect, it, vi } from 'vitest';
import type { ContactLauncher } from '@/application/abstractions/contactLauncher';
import { makeEmployee } from '@/testing/makeEmployee';
import { ContactEmployeeCommand, ContactEmployeeHandler } from './contactEmployee';

function launcher() {
  const chat = vi.fn<ContactLauncher['chat']>(() => Promise.resolve());
  const call = vi.fn<ContactLauncher['call']>(() => Promise.resolve());
  const email = vi.fn<ContactLauncher['email']>(() => Promise.resolve());
  const destinations = vi.fn<ContactLauncher['destinations']>();
  const handler = new ContactEmployeeHandler({
    chat,
    call,
    email,
    chatWithGroup: vi.fn<ContactLauncher['chatWithGroup']>(),
    emailGroup: vi.fn<ContactLauncher['emailGroup']>(),
    meetWith: vi.fn<ContactLauncher['meetWith']>(),
    destinations,
  });
  return { chat, call, email, handler };
}

describe('ContactEmployeeHandler', () => {
  const anna = makeEmployee('anna', null, { userPrincipalName: 'anna@contoso.onmicrosoft.com', mail: 'anna@contoso.com' });

  it('chats and calls by UPN and e-mails the mail address', async () => {
    const { handler, chat, call, email } = launcher();

    await handler.handle(new ContactEmployeeCommand(anna, 'chat'));
    await handler.handle(new ContactEmployeeCommand(anna, 'call'));
    await handler.handle(new ContactEmployeeCommand(anna, 'email'));

    expect(chat).toHaveBeenCalledWith('anna@contoso.onmicrosoft.com');
    expect(call).toHaveBeenCalledWith('anna@contoso.onmicrosoft.com');
    expect(email).toHaveBeenCalledWith('anna@contoso.com');
  });

  it('refuses to e-mail someone without an address', async () => {
    const { handler } = launcher();

    await expect(handler.handle(new ContactEmployeeCommand({ ...anna, mail: null }, 'email'))).rejects.toThrow(
      'has no e-mail address',
    );
  });
});
