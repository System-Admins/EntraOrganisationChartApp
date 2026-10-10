// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInRequiredError } from '@/application/abstractions/authenticator';
import { PresenceUnavailableError } from '@/application/abstractions/presenceSource';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { Request, Sender } from '@/application/common/mediator';
import { SignInCommand } from '@/application/features/authentication/signIn';
import { ConsentToPresenceCommand } from '@/application/features/presence/consentToPresence';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import type { SupportDesk } from '@/application/settings/appSettings';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { describeError } from '../../shared/errors';
import { MediatorProvider } from '../../shared/mediatorContext';
import { SupportDeskProvider } from '../../shared/supportDesk';
import { PresenceProvider, usePresence } from '../presence/presenceContext';
import type { DirectoryProgress } from './directoryProgress';
import { StatusBar } from './StatusBar';

interface Setup {
  readonly filterNote?: string | null;
  readonly topPersons?: readonly string[];
  readonly topPersonsFromLink?: boolean;
  readonly linkedPersonMissing?: boolean;
  readonly refreshError?: unknown;
  readonly presence?: PresenceUnavailableError['reason'];
  /** Makes signing in and consenting to presence fail. */
  readonly rejectWith?: Error;
  /** Whether the chart shows a team alone, as the page sets it. */
  readonly showsTeam?: boolean;
  /** The team's person, found in the chart; null where they are missing. */
  readonly teamHeadId?: string | null;
  /** config.json's support desk; none without it. */
  readonly support?: SupportDesk | null;
  readonly notice?: { readonly text: string; readonly support: boolean } | null;
  /** How far the directory's update is, while one runs. */
  readonly refreshing?: { readonly progress: DirectoryProgress | null };
}

/** What the person is told about a failure; its wording belongs to describeError. */
const FAILURE = new Error('It did not work.');

/** Presence is only fetched for people somebody watches, as a card on screen does. */
function Watcher() {
  usePresence('ceo', true);
  return null;
}

function renderBar({
  filterNote = null,
  topPersons = ['ceo'],
  topPersonsFromLink = false,
  linkedPersonMissing = false,
  refreshError,
  presence,
  rejectWith,
  showsTeam = false,
  teamHeadId = null,
  support = null,
  notice = null,
  refreshing,
}: Setup = {}) {
  const announce = vi.fn<(message: string) => void>();
  const onRefresh = vi.fn();
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      if (request instanceof GetPresencesQuery) {
        return presence ? Promise.reject(new PresenceUnavailableError(presence)) : Promise.resolve(new Map() as T);
      }
      if ((request instanceof SignInCommand || request instanceof ConsentToPresenceCommand) && rejectWith) {
        return Promise.reject(rejectWith);
      }
      return Promise.resolve(undefined as T);
    },
  };
  const chart = buildOrgChart([makeEmployee('ceo'), makeEmployee('dev', 'ceo')], { topPersons, hide: SHOW_EVERYONE });
  render(
    <MediatorProvider mediator={mediator}>
      <SupportDeskProvider desk={support}>
        <PresenceProvider enabled>
          <Watcher />
          <footer>
            <StatusBar
              chart={chart}
              loadedAt={new Date(2026, 8, 30, 9, 0)}
              isRefreshing={refreshing !== undefined}
              progress={refreshing?.progress ?? null}
              exportProgress={null}
              refreshError={refreshError}
              onRefresh={onRefresh}
              notice={notice}
              linkedPersonMissing={linkedPersonMissing}
              topPersonsFromLink={topPersonsFromLink}
              filterNote={filterNote}
              showsTeam={showsTeam}
              teamHeadId={teamHeadId}
              announce={announce}
            />
          </footer>
        </PresenceProvider>
      </SupportDeskProvider>
    </MediatorProvider>,
  );
  return { announce, onRefresh, bar: screen.getByRole('contentinfo') };
}

afterEach(cleanup);

describe('StatusBar', () => {
  it('starts with the people count and ends with the update time, whatever is said in between', () => {
    renderBar({ linkedPersonMissing: true });

    const items = Array.from(screen.getByRole('contentinfo').children, (item) => item.textContent);
    expect(items[0]).toBe('2 people');
    expect(items.at(-1)).toBe('Updated 2026-09-30 09:00');
    expect(items).toHaveLength(3);
  });

  it('says that the directory updates, and for a full read how far it is, as a bar and in words with the time left', () => {
    const { bar } = renderBar({ refreshing: { progress: null } });
    expect(bar.textContent).toContain('Updating...');
    expect(bar.querySelector('progress')).toBeNull();
    cleanup();

    const { bar: reading, announce } = renderBar({ refreshing: { progress: { loaded: 1200, total: 5000, remainingMs: 150_000 } } });

    const item = screen.getByText(/^Updating/);
    expect(item.textContent).toBe('Updating... 1,200 of about 5,000 people loaded, about 3 minutes left');
    const progress = item.querySelector('progress');
    expect([progress?.getAttribute('value'), progress?.getAttribute('max'), progress?.getAttribute('aria-hidden')]).toEqual([
      '1200',
      '5000',
      'true',
    ]);
    // The bar is no live region, and the page announces only the reload's start and end.
    expect(reading.querySelector('[role="status"], [aria-live]')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('says how the filters differ, right after the count they explain', () => {
    const { bar } = renderBar({ filterNote: 'Filters changed: also showing guests.' });

    expect(Array.from(bar.children, (item) => item.textContent).slice(0, 2)).toEqual([
      '2 people',
      'Filters changed: also showing guests.',
    ]);
  });

  it('leaves whose team alone the chart shows, and the way back to everyone, to the team\'s bar above the chart', () => {
    const { announce, bar } = renderBar({ showsTeam: true, teamHeadId: 'ceo', filterNote: 'Filters changed: also showing guests.' });

    expect(Array.from(bar.children, (item) => item.textContent).slice(0, 2)).toEqual([
      '2 people',
      'Filters changed: also showing guests.',
    ]);
    expect(bar.textContent).not.toContain('Showing only');
    expect(screen.queryByRole('button', { name: 'Show everyone' })).toBeNull();
    // The person who narrowed the chart hears that from the page, which says how many people the team has.
    expect(announce).not.toHaveBeenCalled();
  });

  it('says that the person whose team the chart shows is missing in one announcement with the link\'s own warnings, which the bar shows', () => {
    const { announce, bar } = renderBar({
      topPersons: ['gone@contoso.com'],
      topPersonsFromLink: true,
      linkedPersonMissing: true,
      showsTeam: true,
    });

    const missing = 'The person whose team this chart shows was not found or is hidden.';
    expect(bar.textContent).not.toContain(missing);
    // Neither the link's words nor the warnings about its top persons, as the team's person is the chart's only one.
    expect(bar.textContent).not.toContain('gone@contoso.com');
    expect(bar.textContent).not.toContain('puts at the top of the chart');
    expect(announce.mock.calls).toEqual([[`${missing} The person in this link is not in the chart. Search for them by name.`]]);
  });

  it('says in everyday words that Teams status needs permission, and announces why turning it on failed', async () => {
    const { announce, bar } = renderBar({ presence: 'consent', rejectWith: FAILURE });

    const button = await screen.findByRole('button', { name: 'Turn on' });
    expect(bar.textContent).toContain('Teams status (Available, Busy...) is not shown: the app needs permission to see it.');
    expect(bar.textContent).not.toContain('Presence.Read.All');
    expect(button.parentElement?.title).toContain('Presence.Read.All');
    expect(announce).not.toHaveBeenCalled();

    fireEvent.click(button);

    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(describeError(FAILURE, 'en'));
    });
    expect(bar.textContent).toContain(describeError(FAILURE, 'en'));
  });

  it('tells staff whom to ask when the organization does not allow Teams status', async () => {
    const { bar } = renderBar({ presence: 'denied' });

    await waitFor(() => {
      expect(bar.textContent).toContain(
        'Teams status (Available, Busy...) is not shown: your organization does not allow it. Ask IT if you need it.',
      );
    });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a sign-in when saved data is shown, and announces a sign-in that fails', async () => {
    const { announce, onRefresh, bar } = renderBar({ refreshError: new SignInRequiredError(), rejectWith: FAILURE });
    expect(bar.textContent).toContain('Showing saved data. Sign in to update');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to update' }));

    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(describeError(FAILURE, 'en'));
    });
    expect(bar.textContent).toContain(describeError(FAILURE, 'en'));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('offers a retry after any other failed update', () => {
    const { onRefresh, bar } = renderBar({ refreshError: FAILURE });
    expect(bar.textContent).toContain(`Update failed: ${describeError(FAILURE, 'en')} Retry`);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('announces what is wrong with the link that was opened, without repeating words from the link', () => {
    const { announce, bar } = renderBar({ topPersons: ['gone@contoso.com'], topPersonsFromLink: true, linkedPersonMissing: true });

    const topPerson = 'A person this link puts at the top of the chart was not found or is hidden. Ask whoever shared the link to check it.';
    const person = 'The person in this link is not in the chart. Search for them by name.';
    expect(bar.textContent).toContain(topPerson);
    expect(bar.textContent).toContain(person);
    expect(bar.textContent).not.toContain('gone@contoso.com');
    expect(announce.mock.calls).toEqual([[`${topPerson} ${person}`]]);
  });

  it('names the configured top persons that are missing, which is not news from anything the person did', () => {
    const { announce, bar } = renderBar({ topPersons: ['gone@contoso.com', 'left@contoso.com'] });

    expect(bar.textContent).toContain(
      'The chart is set to start from gone@contoso.com and left@contoso.com, but they were not found or are hidden. Please tell IT.',
    );
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces a failed sign-in once, and again when the next sign-in fails too', async () => {
    const { announce, bar } = renderBar({ refreshError: new SignInRequiredError(), rejectWith: FAILURE });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to update' }));
    await waitFor(() => {
      expect(bar.textContent).toContain(describeError(FAILURE, 'en'));
    });
    expect(announce.mock.calls).toEqual([[describeError(FAILURE, 'en')]]);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in to update' }));

    await waitFor(() => {
      expect(announce.mock.calls).toEqual([[describeError(FAILURE, 'en')], [describeError(FAILURE, 'en')]]);
    });
  });

  describe('the support desk', () => {
    const DESK: SupportDesk = { label: 'Contoso Service Desk', url: 'mailto:servicedesk@contoso.com' };
    /** The bar's item that ends in the link to the desk, as its text. */
    const linkedItems = () =>
      screen.queryAllByRole('link', { name: 'Contoso Service Desk' }).map((link) => link.parentElement?.textContent);

    it('follows "Please tell IT" and "Ask IT", saying it opens the mail app', async () => {
      renderBar({ support: DESK, topPersons: ['gone@contoso.com'], presence: 'denied' });

      await waitFor(() => {
        expect(linkedItems()).toEqual([
          'The chart is set to start from gone@contoso.com, but they were not found or are hidden. Please tell IT. ' +
            'Contoso Service Desk (opens your mail app)',
          'Teams status (Available, Busy...) is not shown: your organization does not allow it. Ask IT if you need it. ' +
            'Contoso Service Desk (opens your mail app)',
        ]);
      });
    });

    it('follows a failed update whose words send people to their IT support, after its retry, but not one they can retry alone', () => {
      renderBar({ support: DESK, refreshError: FAILURE });
      expect(linkedItems()).toEqual([
        `Update failed: ${describeError(FAILURE, 'en')} Retry Contoso Service Desk (opens your mail app)`,
      ]);
      cleanup();

      renderBar({ support: DESK, refreshError: new ServiceError('offline', 'Microsoft Graph could not be reached.') });
      expect(linkedItems()).toEqual([]);
      cleanup();

      renderBar({ support: DESK, refreshError: new SignInRequiredError() });
      expect(linkedItems()).toEqual([]);
    });

    it('follows a notice only where its words send people to their IT support', () => {
      renderBar({ support: DESK, notice: { text: 'Export failed: Something went wrong.', support: true } });
      expect(linkedItems()).toEqual(['Export failed: Something went wrong. Contoso Service Desk (opens your mail app)']);
      cleanup();

      renderBar({ support: DESK, notice: { text: 'You are not shown in this chart.', support: false } });
      expect(screen.getByRole('contentinfo').textContent).toContain('You are not shown in this chart.');
      expect(linkedItems()).toEqual([]);
    });

    it('leaves the words as they are where config.json names no desk', () => {
      const { bar } = renderBar({ topPersons: ['gone@contoso.com'], refreshError: FAILURE });

      expect(screen.queryByRole('link')).toBeNull();
      expect(bar.textContent).toContain('but they were not found or are hidden. Please tell IT.Updated');
    });
  });
});
