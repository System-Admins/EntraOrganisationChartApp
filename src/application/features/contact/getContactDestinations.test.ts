import { describe, expect, it, vi } from 'vitest';
import type { ContactDestinations, ContactLauncher } from '../../abstractions/contactLauncher';
import { GetContactDestinationsHandler } from './getContactDestinations';

describe('GetContactDestinationsHandler', () => {
  it('asks the host-specific launcher where each channel opens', async () => {
    const inTeams: ContactDestinations = { chat: 'teamsHere', call: 'teamsHere', email: 'outlookNewWindow', meeting: 'teamsHere' };
    const launcher: ContactLauncher = {
      chat: vi.fn<ContactLauncher['chat']>(),
      call: vi.fn<ContactLauncher['call']>(),
      email: vi.fn<ContactLauncher['email']>(),
      chatWithGroup: vi.fn<ContactLauncher['chatWithGroup']>(),
      emailGroup: vi.fn<ContactLauncher['emailGroup']>(),
      meetWith: vi.fn<ContactLauncher['meetWith']>(),
      destinations: () => inTeams,
    };

    expect(await new GetContactDestinationsHandler(launcher).handle()).toBe(inTeams);
  });
});
