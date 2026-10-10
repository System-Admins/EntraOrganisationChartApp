// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContactDestinations } from '@/application/abstractions/contactLauncher';
import type { Request, Sender } from '@/application/common/mediator';
import { CopyTextCommand } from '@/application/features/clipboard/copyText';
import { ContactTeamCommand } from '@/application/features/contact/contactTeam';
import { GetContactDestinationsQuery } from '@/application/features/contact/getContactDestinations';
import { GetTeamContactQuery } from '@/application/features/contact/getTeamContact';
import { planTeamContact } from '@/application/features/contact/teamContact';
import type { Employee } from '@/domain/employees/employee';
import { makeEmployee } from '@/testing/makeEmployee';
import { MediatorProvider } from '../../shared/mediatorContext';
import { TeamContact, type ContactGroup } from './TeamContact';

const IN_TEAMS: ContactDestinations = { chat: 'teamsHere', call: 'teamsHere', email: 'mailApp', meeting: 'teamsHere' };

/** `count` direct reports of Lea Dahl's, enabled members with an address. */
const reports = (count: number) => Array.from({ length: count }, (_, index) => makeEmployee(`dev${String(index + 1)}`, 'lead'));

const DIRECT_REPORTS: ContactGroup = { kind: 'directReports', manager: 'Lea Dahl' };

interface Setup {
  /** How a copy ends: true where the text reached the clipboard. */
  readonly copied?: boolean;
  /** Answers the team's chat, e-mail or meeting, which opens without a word where it is left out. */
  readonly launch?: () => Promise<void>;
  /** Answers whom the channels reach in place of the planner, which leaves nobody out as signed in. */
  readonly plan?: () => Promise<unknown>;
  /** Who the people are: by default Lea Dahl's direct reports. */
  readonly group?: ContactGroup;
  readonly headingLevel?: 3 | 4;
}

/** Tiles for the people of a list, and what was asked of the application. */
function renderTeam(members: readonly Employee[], { copied = true, launch, plan, group = DIRECT_REPORTS, headingLevel }: Setup = {}) {
  const sent: Request<unknown>[] = [];
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      if (request instanceof GetTeamContactQuery) return (plan?.() ?? Promise.resolve(planTeamContact(request.team, null))) as Promise<T>;
      if (request instanceof GetContactDestinationsQuery) return Promise.resolve(IN_TEAMS as T);
      if (request instanceof CopyTextCommand) return Promise.resolve(copied as T);
      if (request instanceof ContactTeamCommand) return (launch?.() ?? Promise.resolve()) as Promise<T>;
      return Promise.resolve(undefined as T);
    },
  };
  render(
    <MediatorProvider mediator={mediator}>
      <div data-testid="area">
        <TeamContact people={members} group={group} headingLevel={headingLevel} />
      </div>
    </MediatorProvider>,
  );
  return { sent };
}

const area = () => within(screen.getByTestId('area'));
const buttons = () => area().queryAllByRole('button').map((button) => button.textContent);
/** What screen readers call the tiles; a tile without a name of its own is named by its label. */
const names = () => area().queryAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TeamContact', () => {
  it('reaches exactly the people it is given, under a heading that says who they are, each tile saying where it opens', async () => {
    const team = reports(3);
    const { sent } = renderTeam(team);

    const chat = await area().findByRole('button', { name: 'Chat with the direct reports', description: 'Opens in Microsoft Teams' });
    expect(area().getByRole('heading', { level: 4 }).textContent).toBe('Contact the direct reports');
    expect(area().getByRole('button', { name: 'E-mail the direct reports' }).title).toBe('Opens your mail app');
    expect(area().queryByRole('paragraph')).toBeNull();
    expect(sent.find((request) => request instanceof GetTeamContactQuery)?.team).toBe(team);

    fireEvent.click(chat);
    fireEvent.click(area().getByRole('button', { name: 'New meeting with the direct reports' }));
    expect(sent.filter((request) => request instanceof ContactTeamCommand)).toEqual([
      new ContactTeamCommand(team, 'chat', "Lea Dahl's team"),
      new ContactTeamCommand(team, 'meeting', "Lea Dahl's team"),
    ]);
  });

  it('labels its tiles as briefly as the person\'s own actions, in names that hold the label and say whom they reach', async () => {
    renderTeam(reports(3));

    await area().findByRole('button', { name: 'Chat with the direct reports' });
    expect(buttons()).toEqual(['Chat', 'E-mail', 'Meeting']);
    expect(names()).toEqual(['Chat with the direct reports', 'E-mail the direct reports', 'New meeting with the direct reports']);
    // WCAG 2.5.3: speech users say what they see.
    for (const tile of area().getAllByRole('button')) {
      expect(tile.getAttribute('aria-label')?.toLowerCase()).toContain(tile.textContent.toLowerCase());
    }
  });

  it('says it reaches the whole team, or everyone in a department or city of it, whose name it gives the group chat', async () => {
    const team = reports(3);
    renderTeam(team, { group: { kind: 'wholeTeam', manager: 'Lea Dahl' }, headingLevel: 3 });

    await area().findByRole('button', { name: 'Chat with the whole team' });
    expect(area().getByRole('heading', { level: 3 }).textContent).toBe('Contact the whole team');
    expect(names()).toEqual(['Chat with the whole team', 'E-mail the whole team', 'New meeting with the whole team']);
    cleanup();

    const { sent } = renderTeam(team, { group: { kind: 'place', manager: 'Lea Dahl', place: 'London' } });
    fireEvent.click(await area().findByRole('button', { name: 'Chat with everyone in London' }));
    expect(area().getByRole('heading', { level: 4 }).textContent).toBe('Contact everyone in London');
    expect(names().slice(1)).toEqual(['E-mail everyone in London', 'New meeting with everyone in London']);
    expect(sent.filter((request) => request instanceof ContactTeamCommand)).toEqual([
      new ContactTeamCommand(team, 'chat', "Lea Dahl's team in London"),
    ]);
  });

  it('says it reaches everyone in a department, whose own name the group chat takes', async () => {
    const team = reports(3);
    const { sent } = renderTeam(team, { group: { kind: 'department', department: 'Business Development' }, headingLevel: 3 });

    fireEvent.click(await area().findByRole('button', { name: 'Chat with everyone in Business Development' }));

    expect(area().getByRole('heading', { level: 3 }).textContent).toBe('Contact everyone in Business Development');
    expect(sent.filter((request) => request instanceof ContactTeamCommand)).toEqual([new ContactTeamCommand(team, 'chat', 'Business Development')]);
  });

  it('offers nothing until it knows whom the team\'s channels reach, its live region already in place', () => {
    renderTeam(reports(3), { plan: () => new Promise(() => undefined) });

    expect(buttons()).toEqual([]);
    expect(area().queryByRole('heading')).toBeNull();
    expect(area().getByRole('status').textContent).toBe('');
  });

  it('says why a team too large for a group chat gets none, and offers the meeting and the e-mail', async () => {
    renderTeam(reports(25));

    await area().findByRole('button', { name: 'E-mail the direct reports' });
    expect(names()).toEqual(['E-mail the direct reports', 'New meeting with the direct reports']);
    expect(screen.getByText('A group chat takes at most 20 people.')).toBeTruthy();
  });

  it('has the addresses of a team too large for links copied, saying so after every copy', async () => {
    const { sent } = renderTeam(reports(60));

    const copy = await area().findByRole('button', {
      name: 'Copy addresses',
      description: 'More than 50 addresses are too many for one e-mail link: copy them, then paste them into a message.',
    });
    // As short as the other tiles' labels, with the shared tile class alone, so it is one column wide like them; the name says what it copies.
    expect(buttons()).toEqual(['Copy']);
    expect(copy.classList).toHaveLength(1);
    expect(area().getByText('A group chat takes at most 20 people.')).toBeTruthy();
    expect(area().getByText('A new meeting from here takes at most 50 people.')).toBeTruthy();

    fireEvent.click(copy);

    await waitFor(() => {
      expect(copy.textContent).toBe('Copied');
    });
    await waitFor(() => {
      expect(area().getByRole('status').textContent).toBe('Addresses copied');
    });
    const addresses = sent.find((request) => request instanceof CopyTextCommand)?.text.split('; ');
    expect(addresses).toHaveLength(60);
    expect(addresses?.slice(0, 2)).toEqual(['dev1@contoso.com', 'dev2@contoso.com']);
    expect(sent.some((request) => request instanceof ContactTeamCommand)).toBe(false);
  });

  it('shows the addresses to copy by hand where nothing could copy them', async () => {
    renderTeam(reports(60), { copied: false });

    fireEvent.click(await area().findByRole('button', { name: 'Copy addresses' }));

    const field = await area().findByRole<HTMLTextAreaElement>('textbox', { name: 'Copy these addresses' });
    expect(field.value.split('; ')).toHaveLength(60);
    expect(document.activeElement).toBe(field);
    expect(area().getByRole('button', { name: 'Copy addresses' }).textContent).toBe('Copy');
    expect(area().getByRole('status').textContent).toBe('');
  });

  it('says whom chat and meeting leave out, and whom e-mail leaves out, which also explains a tile that reaches nobody', async () => {
    renderTeam([
      makeEmployee('consultant', 'lead', { isGuest: true, mail: 'consultant@fabrikam.com' }),
      makeEmployee('former', 'lead', { accountEnabled: false }),
      makeEmployee('trainee', 'lead', { isLicensed: false, mail: null }),
    ]);

    await area().findByRole('button', { name: 'E-mail the direct reports' });
    // Teams reaches none of them, so there is neither a group chat nor a meeting.
    expect(names()).toEqual(['E-mail the direct reports']);
    expect(area().getByRole('paragraph').textContent).toBe(
      'Chat and meeting leave out 1 disabled account, 1 guest, and 1 account without a license. ' +
        'E-mail leaves out 1 disabled account and 1 person without an e-mail address.',
    );
  });

  it('logs a chat that Teams could not open, which leaves the tiles as they were', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderTeam(reports(3), { launch: () => Promise.reject(new Error('Teams did not answer.')) });

    fireEvent.click(await area().findByRole('button', { name: 'Chat with the direct reports' }));

    await waitFor(() => {
      expect(error).toHaveBeenCalledWith("Could not start a team chat with Lea Dahl's team.", expect.any(Error));
    });
    expect(names()).toEqual(['Chat with the direct reports', 'E-mail the direct reports', 'New meeting with the direct reports']);
  });
});
