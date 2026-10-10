// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef, type CSSProperties } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInFailedError } from '@/application/abstractions/authenticator';
import type { ContactDestinations } from '@/application/abstractions/contactLauncher';
import type { ShareMethod, ShareResult } from '@/application/abstractions/employeeSharing';
import { CalendarConsentRequiredError, type WorkSchedule } from '@/application/abstractions/workingHoursSource';
import type { Request, Sender } from '@/application/common/mediator';
import type { Weekday } from '@/application/common/timeZones';
import { ContactEmployeeCommand } from '@/application/features/contact/contactEmployee';
import { ContactTeamCommand } from '@/application/features/contact/contactTeam';
import { GetContactDestinationsQuery } from '@/application/features/contact/getContactDestinations';
import { GetTeamContactQuery } from '@/application/features/contact/getTeamContact';
import { planTeamContact } from '@/application/features/contact/teamContact';
import { GetRecordedManagerQuery, type RecordedManager } from '@/application/features/orgChart/getRecordedManager';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import { GetShareMethodQuery } from '@/application/features/share/getShareMethod';
import { ShareEmployeeCommand } from '@/application/features/share/shareEmployee';
import { ConsentToCalendarCommand } from '@/application/features/workingHours/consentToCalendar';
import { GetWorkingHoursQuery } from '@/application/features/workingHours/getWorkingHours';
import type { ExtraField } from '@/application/settings/extraFields';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { getNode, type OrgChart, type OrgChartOptions } from '@/domain/orgChart/orgChart';
import type { Presence } from '@/domain/presence/presence';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { makePresence } from '@/testing/makePresence';
import { DisplayOptionsProvider } from '../../shared/displayOptions';
import { describeError } from '../../shared/errors';
import { MediatorProvider } from '../../shared/mediatorContext';
import { PresenceProvider } from '../presence/presenceContext';
import { DETAILS_PANEL_ID } from './detailsPanelId';
import { EmployeeDetailsPanel } from './EmployeeDetailsPanel';

const options: OrgChartOptions = { topPersons: ['ceo'], hide: SHOW_EVERYONE };

const chart = buildOrgChart(
  [
    makeEmployee('ceo'),
    makeEmployee('anna', 'ceo', {
      displayName: 'Anna Lund',
      businessPhone: '+47 22 00 00 00',
      mobilePhone: '+47 400 00 000',
      officeLocation: 'Oslo HQ',
      city: 'Oslo',
      country: 'Norway',
      companyName: 'Contoso',
      employeeId: 'E1001',
    }),
    makeEmployee('ola', 'anna', { displayName: 'Ola Berg', mail: null }),
    makeEmployee('kari', 'ola'),
  ],
  options,
);

/** A disabled account, a guest without a license here, and a member without one, under the CEO. */
const accounts = buildOrgChart(
  [
    makeEmployee('ceo'),
    makeEmployee('former', 'ceo', { accountEnabled: false }),
    makeEmployee('guest', 'ceo', { displayName: 'Gita Rao', isGuest: true, isLicensed: false }),
    makeEmployee('trainee', 'ceo', { isLicensed: false }),
  ],
  options,
);

/** People who head branches of their own: a disabled analyst whose manager the chart leaves out, and one with no manager. */
const flagged = buildOrgChart(
  [makeEmployee('ceo'), makeEmployee('analyst', 'boss', { accountEnabled: false }), makeEmployee('stray', null)],
  options,
);

/** The analyst's manager in the directory, a disabled account. */
const boss = makeEmployee('boss', null, { displayName: 'Bo Sund', accountEnabled: false });

const IN_BROWSER: ContactDestinations = { chat: 'teamsNewTab', call: 'teamsNewTab', email: 'mailApp', meeting: 'teamsNewTab' };

/** A host that copies links; `share` answers the presses on Link. */
function host(share: ShareResult = { outcome: 'cancelled' }, method: ShareMethod = 'copy') {
  return (request: Request<unknown>): unknown => {
    if (request instanceof GetContactDestinationsQuery) return IN_BROWSER;
    if (request instanceof GetShareMethodQuery) return method;
    if (request instanceof ShareEmployeeCommand) return share;
    return undefined;
  };
}

/** Answers the question about a recorded manager, or fails with `recorded` where that is an error; keeps what was asked. */
function recordedManagerHost(recorded: RecordedManager | Error) {
  const requests: Request<unknown>[] = [];
  const answer = (request: Request<unknown>): unknown => {
    requests.push(request);
    if (!(request instanceof GetRecordedManagerQuery)) return undefined;
    return recorded instanceof Error ? Promise.reject(recorded) : recorded;
  };
  return { requests, answer };
}

interface PanelSetup {
  /** The chart around the person; the four people of `chart` without it. */
  readonly shown?: OrgChart;
  readonly showLevels?: boolean;
  readonly showWorkLocation?: boolean;
  /** config.json's chart.showWorkingHours; off without it, so that only the tests of the row ask calendars. */
  readonly showWorkingHours?: boolean;
  /** config.json's directory.extraFields; none without it. */
  readonly extraFields?: readonly ExtraField[];
  /** Everyone's Teams presence; without it presence is switched off. */
  readonly presence?: Presence;
  /** Set as the page sets it for the person at the top of the team the chart shows alone. */
  readonly onShowEveryone?: () => void;
}

function renderPanel(
  employeeId: string,
  answer: (request: Request<unknown>) => unknown = () => undefined,
  {
    shown = chart,
    showLevels = false,
    showWorkLocation = true,
    showWorkingHours = false,
    extraFields = [],
    presence,
    onShowEveryone,
  }: PanelSetup = {},
) {
  const reply = (request: Request<unknown>) =>
    presence && request instanceof GetPresencesQuery ? new Map(request.employeeIds.map((id) => [id, presence])) : answer(request);
  const mediator: Sender = { send: <T,>(request: Request<T>) => Promise.resolve(reply(request) as T) };
  const onShowPerson = vi.fn();
  const onClose = vi.fn();
  const onShowOnlyTeam = vi.fn();
  const onSeeTeam = vi.fn();
  const onShowDepartment = vi.fn<(employeeId: string, departmentId: string) => void>();
  const seeTeamRef = createRef<HTMLButtonElement>();
  const panel = (id: string, around: OrgChart, showEveryone = onShowEveryone) => (
    <MediatorProvider mediator={mediator}>
      <DisplayOptionsProvider value={{ showLevels }}>
        <PresenceProvider enabled={presence !== undefined}>
          <EmployeeDetailsPanel
            chart={around}
            options={options}
            employeeId={id}
            showWorkLocation={showWorkLocation}
            showWorkingHours={showWorkingHours}
            extraFields={extraFields}
            onClose={onClose}
            onShowPerson={onShowPerson}
            onShowOnlyTeam={onShowOnlyTeam}
            onShowEveryone={showEveryone}
            onSeeTeam={onSeeTeam}
            seeTeamRef={seeTeamRef}
            onShowDepartment={onShowDepartment}
          />
        </PresenceProvider>
      </DisplayOptionsProvider>
    </MediatorProvider>
  );
  const { rerender } = render(panel(employeeId, shown));
  /** The same panel for another person, or in a chart built again, as the page renders it after a click or a refresh. */
  const show = (id: string, around: OrgChart = shown, showEveryone = onShowEveryone) => {
    rerender(panel(id, around, showEveryone));
  };
  return { onShowPerson, onClose, onShowOnlyTeam, onSeeTeam, onShowDepartment, seeTeamRef, show };
}

const busy = makePresence({ availability: 'busy' });

/** Out of office with an automatic reply, a note and the day off as work location. */
const onHoliday = makePresence({
  availability: 'offline',
  activity: 'OutOfOffice',
  outOfOffice: true,
  outOfOfficeMessage: 'I am on holiday until Monday.',
  statusMessage: 'Back on Monday',
  workLocation: 'timeOff',
});

const valueOf = (label: string) => screen.getByText(label).closest('div')?.querySelector('dd')?.textContent;

const chatAndCall = () => [screen.getByRole('button', { name: 'Teams chat' }), screen.getByRole('button', { name: 'Teams call' })];

/** The Link button's own live region, among the person's actions; a manager's team actions have another. */
const linkStatus = () => within(screen.getByRole('button', { name: 'Teams chat' }).parentElement as HTMLElement).getByRole('status');

const scrollTo = vi.fn();

beforeAll(() => {
  // jsdom lacks element scrolling.
  HTMLElement.prototype.scrollTo = scrollTo;
});

afterEach(cleanup);

describe('EmployeeDetailsPanel', () => {
  it('shows contact, location and organization details that are filled in', () => {
    renderPanel('anna');

    expect(valueOf('Work phone')).toBe('+47 22 00 00 00');
    expect(valueOf('Mobile')).toBe('+47 400 00 000');
    expect(valueOf('Office')).toBe('Oslo HQ');
    expect(valueOf('Location')).toBe('Oslo, Norway');
    expect(valueOf('Company')).toBe('Contoso');
    expect(valueOf('Employee ID')).toBe('E1001');
  });

  it('heads its sections a level below the person\'s name', () => {
    renderPanel('anna');

    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Contact',
      'Organization',
      'Team',
    ]);
  });

  it('leaves out missing fields and disables e-mail without an address', () => {
    renderPanel('ola');

    expect(screen.queryByText('Mobile')).toBeNull();
    expect(screen.queryByText('Company')).toBeNull();
    expect(screen.getByRole('button', { name: 'E-mail' }).hasAttribute('disabled')).toBe(true);
  });

  it('navigates to the manager and to direct reports', () => {
    const { onShowPerson } = renderPanel('anna');

    const row = (label: string) => screen.getByText(label).closest('div') as HTMLElement;
    fireEvent.click(within(row('Manager')).getByRole('button', { name: /Ceo/ }));
    fireEvent.click(within(row('Direct reports (1)')).getByRole('button', { name: /Ola Berg/ }));

    expect(onShowPerson.mock.calls).toEqual([['ceo'], ['ola']]);
  });

  it('closes on Escape', () => {
    const { onClose } = renderPanel('anna');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('names its Close button after what it closes, with a tooltip that only says Close', () => {
    renderPanel('anna');

    expect(screen.getByRole('button', { name: 'Close details' }).title).toBe('Close');
  });

  it('starts each person at the top of the panel', () => {
    const panel = (employeeId: string) => (
      <MediatorProvider mediator={{ send: <T,>() => Promise.resolve(undefined as T) }}>
        <EmployeeDetailsPanel
          chart={chart}
          options={options}
          employeeId={employeeId}
          showWorkLocation
          showWorkingHours={false}
          extraFields={[]}
          onClose={vi.fn()}
          onShowPerson={vi.fn()}
        />
      </MediatorProvider>
    );
    const { rerender } = render(panel('anna'));
    scrollTo.mockClear();

    rerender(panel('ola'));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('leaves Escape alone when another control already handled it', () => {
    const { onClose } = renderPanel('anna');
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();

    document.dispatchEvent(event);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves Escape to a modal dialog that is open over it', () => {
    const { onClose } = renderPanel('anna');
    const dialog = document.body.appendChild(document.createElement('dialog'));
    dialog.setAttribute('open', '');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    dialog.remove();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('copies a link to the person and says so', async () => {
    const requests: unknown[] = [];
    const answer = host({ outcome: 'copied' });
    renderPanel('anna', (request) => {
      requests.push(request);
      return answer(request);
    });

    const link = await screen.findByRole('button', { name: 'Copy link' });
    expect(link.textContent).toBe('Link');
    fireEvent.click(link);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    });
    await waitFor(() => {
      expect(linkStatus().textContent).toBe('Link copied');
    });
    expect(requests).toContainEqual(new ShareEmployeeCommand(getNode(chart, 'anna').employee));
  });

  it('says "Link copied" again for every copy', async () => {
    renderPanel('anna', host({ outcome: 'copied' }));
    const status = linkStatus();
    const heard: string[] = [];
    new MutationObserver(() => heard.push(status.textContent)).observe(status, { childList: true, characterData: true, subtree: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
    await waitFor(() => {
      expect(heard).toEqual(['Link copied']);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copied' }));

    await waitFor(() => {
      expect(heard).toEqual(['Link copied', '', 'Link copied']);
    });
  });

  it('names the Link button for the share sheet where a press opens one', async () => {
    renderPanel('anna', host({ outcome: 'shared' }, 'share'));

    const link = await screen.findByRole('button', { name: 'Share link' });
    expect(link.textContent).toBe('Link');
    fireEvent.click(link);

    await Promise.resolve();
    expect(linkStatus().textContent).toBe('');
  });

  it('tells Teams chat and call apart from the phone links and says where each action opens', async () => {
    const requests: unknown[] = [];
    const answer = host();
    renderPanel('anna', (request) => {
      requests.push(request);
      return answer(request);
    });

    const chat = await screen.findByRole('button', { name: 'Teams chat', description: 'Opens Microsoft Teams in a new tab' });
    const call = screen.getByRole('button', { name: 'Teams call', description: 'Opens Microsoft Teams in a new tab' });
    expect([chat.textContent, call.textContent]).toEqual(['Chat', 'Call']);
    expect(screen.getByRole('button', { name: 'E-mail', description: 'Opens your mail app' }).title).toBe('Opens your mail app');
    expect(screen.getByRole('button', { name: 'anna@contoso.com', description: 'Opens your mail app' })).toBeTruthy();

    fireEvent.click(call);
    expect(requests).toContainEqual(new ContactEmployeeCommand(getNode(chart, 'anna').employee, 'call'));
  });

  it('offers the link to copy by hand when nothing could copy it', async () => {
    const url = 'https://chart.contoso.com/?person=anna%40contoso.com';
    renderPanel('anna', host({ outcome: 'manual', url }));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));

    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Copy this link' });
    expect(field.value).toBe(url);
    expect(document.activeElement).toBe(field);
  });

  it('shows the reporting line under the person\'s level where levels are switched on, with the managers as links', () => {
    const { onShowPerson } = renderPanel('ola', undefined, { showLevels: true });

    const line = screen.getByRole('list', { name: 'Reporting line' });
    expect(screen.getByText('Level 3')).toBeTruthy();
    expect(line.textContent).toBe('Ceo›Anna Lund›Ola Berg');
    fireEvent.click(within(line).getByRole('button', { name: 'Anna Lund' }));
    expect(onShowPerson).toHaveBeenCalledWith('anna');
    expect(within(line).queryByRole('button', { name: 'Ola Berg' })).toBeNull();
  });

  it('puts a top person at level 1, at the top of the chart', () => {
    renderPanel('ceo', undefined, { showLevels: true });

    expect(valueOf('Level 1')).toBe('Top of the chart');
  });

  it('keeps the reporting line, under its own name, where levels are switched off', () => {
    const { onShowPerson } = renderPanel('ola');

    expect(screen.queryByText(/^Level/)).toBeNull();
    expect(valueOf('Reporting line')).toBe('Ceo›Anna Lund›Ola Berg');
    fireEvent.click(within(screen.getByRole('list', { name: 'Reporting line' })).getByRole('button', { name: 'Ceo' }));
    expect(onShowPerson).toHaveBeenCalledWith('ceo');
    cleanup();

    renderPanel('ceo');
    expect(screen.queryByText(/^Level/)).toBeNull();
    expect(valueOf('Reporting line')).toBe('Top of the chart');
  });

  it('shows the person\'s department path after the reporting line, each department opening its people', () => {
    const departments = buildOrgChart(
      [
        makeEmployee('ceo', null, { department: 'Management' }),
        makeEmployee('head', 'ceo', { department: 'Strategy M&A' }),
        makeEmployee('lead', 'head', { department: 'Business Development' }),
      ],
      options,
    );
    const { onShowDepartment } = renderPanel('lead', undefined, { shown: departments });

    const path = screen.getByRole('list', { name: 'Department' });
    expect(path.textContent).toBe('Management›Strategy M&A›Business Development');
    fireEvent.click(within(path).getByRole('button', { name: 'Business Development' }));
    fireEvent.click(within(path).getByRole('button', { name: 'Management' }));

    expect(onShowDepartment.mock.calls).toEqual([
      ['lead', 'management/strategyma/businessdevelopment'],
      ['lead', 'management'],
    ]);
  });

  it('repeats a department that comes higher up its own path, and has no row for someone without a department', () => {
    const looping = buildOrgChart(
      [
        makeEmployee('ceo', null, { department: 'Management' }),
        makeEmployee('head', 'ceo', { department: 'Strategy' }),
        makeEmployee('aide', 'head', { department: 'Management' }),
        makeEmployee('temp', 'ceo', { department: ' - ' }),
      ],
      options,
    );
    const { show } = renderPanel('aide', undefined, { shown: looping });

    expect(screen.getByRole('list', { name: 'Department' }).textContent).toBe('Management›Strategy›Management');
    show('temp', looping);
    expect(screen.queryByRole('list', { name: 'Department' })).toBeNull();
  });

  it('carries the id that the selected card points at', () => {
    renderPanel('anna');

    expect(screen.getByRole('complementary', { name: 'Details for Anna Lund' }).id).toBe(DETAILS_PANEL_ID);
  });

  describe('as a sheet over the chart', () => {
    interface PageProps {
      readonly layout: string;
      readonly employeeId: string | null;
      readonly onShowPerson?: (id: string) => void;
      readonly openedFromList?: boolean;
    }

    /** The panel beside a stand-in for the chart, whose --layout it reads, and for the search box. */
    function Page({ layout, employeeId, onShowPerson, openedFromList }: PageProps) {
      return (
        <MediatorProvider mediator={{ send: <T,>() => Promise.resolve(undefined as T) }}>
          <input aria-label="Search" />
          <main>
            <ul role="tree" style={{ '--layout': layout } as CSSProperties}>
              <li role="treeitem" aria-selected={false} tabIndex={0}>
                Anna Lund
              </li>
            </ul>
            {employeeId && (
              <EmployeeDetailsPanel
                chart={chart}
                options={options}
                employeeId={employeeId}
                showWorkLocation
                showWorkingHours={false}
                extraFields={[]}
                onClose={vi.fn()}
                onShowPerson={onShowPerson ?? vi.fn()}
                openedFromList={openedFromList}
              />
            )}
          </main>
        </MediatorProvider>
      );
    }

    const heading = () => screen.getByRole('heading', { level: 2 });

    it('takes the focus to its heading when a card opens it', () => {
      const { rerender } = render(<Page layout="outline" employeeId={null} />);
      screen.getByRole('treeitem').focus();

      rerender(<Page layout="outline" employeeId="anna" />);

      expect(document.activeElement).toBe(heading());
      expect(heading().textContent).toBe('Anna Lund');
      expect(heading().tabIndex).toBe(-1);
    });

    it('takes the focus to the next heading when a person is opened from the sheet', () => {
      let shown = 'anna';
      const { rerender } = render(<Page layout="outline" employeeId={shown} onShowPerson={(id) => (shown = id)} />);

      fireEvent.click(screen.getByRole('button', { name: /Ola Berg/ }));
      rerender(<Page layout="outline" employeeId={shown} />);

      expect(heading().textContent).toBe('Ola Berg');
      expect(document.activeElement).toBe(heading());
    });

    it('leaves the focus in the search box when a suggestion opens or switches it', () => {
      const { rerender } = render(<Page layout="outline" employeeId={null} />);
      const search = screen.getByRole('textbox', { name: 'Search' });
      search.focus();

      rerender(<Page layout="outline" employeeId="anna" />);
      rerender(<Page layout="outline" employeeId="ola" />);

      expect(document.activeElement).toBe(search);
    });

    it('leaves the focus on the card in the tree layout, where the panel covers nothing', () => {
      const { rerender } = render(<Page layout="tree" employeeId={null} />);
      screen.getByRole('treeitem').focus();

      rerender(<Page layout="tree" employeeId="anna" />);

      expect(document.activeElement).toBe(screen.getByRole('treeitem'));
    });

    it('takes the focus to its heading for a person a list in the sheet opened, though the list and its focus are gone', () => {
      const { rerender } = render(<Page layout="outline" employeeId={null} />);
      expect(document.activeElement).toBe(document.body);

      rerender(<Page layout="outline" employeeId="ola" openedFromList />);
      expect(document.activeElement).toBe(heading());

      // Only as the panel opens: a suggestion picked later leaves the focus in the search box, as ever.
      const search = screen.getByRole('textbox', { name: 'Search' });
      search.focus();
      rerender(<Page layout="outline" employeeId="kari" openedFromList />);
      expect(document.activeElement).toBe(search);
    });

    it('leaves the focus where it is for a person a list opened in the tree layout', () => {
      const { rerender } = render(<Page layout="tree" employeeId={null} />);

      rerender(<Page layout="tree" employeeId="ola" openedFromList />);

      expect(document.activeElement).toBe(document.body);
    });
  });

  it('scrolls a control that the keyboard reaches into view with room for its focus ring', () => {
    renderPanel('anna');
    const panel = screen.getByRole('complementary');
    const report = screen.getByRole('button', { name: /Ola Berg/ });
    // jsdom lays nothing out: the panel shows 0 to 300, and the button sits half below that.
    Object.defineProperty(panel, 'clientHeight', { value: 300 });
    panel.style.scrollPaddingBottom = '8px';
    report.getBoundingClientRect = () => ({ top: 280, bottom: 324 }) as DOMRect;
    scrollTo.mockClear();

    // A press with the pointer: jsdom never matches :focus-visible.
    report.focus();
    expect(scrollTo).not.toHaveBeenCalled();

    report.blur();
    Object.defineProperty(report, 'matches', { value: (selector: string) => selector === ':focus-visible' });
    report.focus();
    expect(scrollTo).toHaveBeenCalledWith({ top: 32 });
  });

  it('reads out the presence of the manager and reports, which their avatars only show', async () => {
    renderPanel('anna', undefined, { presence: busy });

    expect(await screen.findByRole('button', { name: /^Ceo.*, Busy$/ })).toBeTruthy();
  });

  describe('with Teams presence', () => {
    it('shows the note the person set in Teams under their status, named for screen readers', async () => {
      renderPanel('anna', undefined, { presence: makePresence({ availability: 'busy', statusMessage: 'Back at noon' }) });

      const note = await screen.findByText('Back at noon');
      expect(note.textContent).toBe('Status message: Back at noon');
      expect(note.previousElementSibling?.textContent).toBe('Busy');
    });

    it('puts the automatic reply and today\'s work location first among the contact details', async () => {
      renderPanel('anna', undefined, { presence: onHoliday });

      await screen.findByText('Automatic reply');
      const contact = screen.getByRole('heading', { name: 'Contact' }).closest('section') as HTMLElement;
      expect(within(contact).getAllByRole('term').map((term) => term.textContent)).toEqual([
        'Automatic reply',
        'Work location today',
        'E-mail',
        'Work phone',
        'Mobile',
        'Office',
        'Location',
      ]);
      expect(valueOf('Automatic reply')).toBe('I am on holiday until Monday.');
      expect(valueOf('Work location today')).toBe('Time off');
    });

    it('leaves out the rows that Teams has nothing for, and the note with them', async () => {
      renderPanel('anna', undefined, { presence: busy });

      await screen.findByText('Busy');
      expect(screen.queryByText('Automatic reply')).toBeNull();
      expect(screen.queryByText('Work location today')).toBeNull();
      expect(screen.queryByText(/Status message/)).toBeNull();
    });

    it('says nothing about the work location where config.json turns it off', async () => {
      renderPanel('anna', undefined, { presence: onHoliday, showWorkLocation: false });

      await screen.findByText('Automatic reply');
      expect(screen.queryByText('Work location today')).toBeNull();
      expect(screen.queryByText('Time off')).toBeNull();
    });

    it('cuts a reply longer than three lines with Show more, which shows the rest and then less again', async () => {
      // jsdom lays nothing out: the reply takes 80px where three lines take 60px.
      const scrollHeight = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(80);
      const clientHeight = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(60);
      try {
        renderPanel('anna', undefined, { presence: onHoliday });

        const more = await screen.findByRole('button', { name: 'Show more' });
        const reply = document.getElementById(more.getAttribute('aria-controls') ?? '');
        expect(reply?.textContent).toBe('I am on holiday until Monday.');
        expect(reply?.className).toMatch(/clamped/);
        expect(more.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(more);
        const less = screen.getByRole('button', { name: 'Show less' });
        expect(less.getAttribute('aria-expanded')).toBe('true');
        expect(reply?.className).not.toMatch(/clamped/);

        fireEvent.click(less);
        expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
      } finally {
        scrollHeight.mockRestore();
        clientHeight.mockRestore();
      }
    });

    it('offers no Show more where three lines hold the whole reply', async () => {
      renderPanel('anna', undefined, { presence: onHoliday });

      await screen.findByText('Automatic reply');
      expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    });

    it('keeps Show less, and the focus on it, where the reply has come to fit in three lines', async () => {
      const scrollHeight = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(80);
      const clientHeight = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(60);
      try {
        renderPanel('anna', undefined, { presence: onHoliday });
        const toggle = await screen.findByRole('button', { name: 'Show more' });
        toggle.focus();
        fireEvent.click(toggle);
        // The panel got wider while the whole reply showed, as when a narrower window makes it the full-width bottom sheet.
        scrollHeight.mockReturnValue(60);

        fireEvent.click(screen.getByRole('button', { name: 'Show less' }));

        expect(screen.getByRole('button', { name: 'Show more' })).toBe(toggle);
        expect(document.activeElement).toBe(toggle);
      } finally {
        scrollHeight.mockRestore();
        clientHeight.mockRestore();
      }
    });

    it('measures the reply again when its size changes, as the panel\'s width or the text size can cut it', async () => {
      const resized: (() => void)[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            resized.push(callback);
          }
          observe = vi.fn();
          disconnect = vi.fn();
        },
      );
      const scrollHeight = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(60);
      const clientHeight = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(60);
      try {
        renderPanel('anna', undefined, { presence: onHoliday });
        await screen.findByText('Automatic reply');
        expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();

        scrollHeight.mockReturnValue(80);
        act(() => {
          for (const notify of resized) notify();
        });

        expect(screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-expanded')).toBe('false');
      } finally {
        scrollHeight.mockRestore();
        clientHeight.mockRestore();
        // jsdom has no ResizeObserver, and the other tests run without one.
        vi.unstubAllGlobals();
      }
    });

    it('cuts the next person\'s reply again, however far the previous one was opened', async () => {
      const scrollHeight = vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(80);
      const clientHeight = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(60);
      try {
        const { show } = renderPanel('anna', undefined, { presence: onHoliday });
        fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
        // Ola reports to Anna, so the panel already knows his presence when it switches to him.
        await screen.findByRole('button', { name: /^Ola Berg.*, Out of office/ });

        show('ola');

        expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Ola Berg');
        const toggle = screen.getByRole('button', { name: 'Show more' });
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(document.getElementById(toggle.getAttribute('aria-controls') ?? '')?.className).toMatch(/clamped/);
      } finally {
        scrollHeight.mockRestore();
        clientHeight.mockRestore();
      }
    });
  });

  describe('with the person\'s local time and working hours', () => {
    /** Thursday 1 October 2026, at `hours`:`minutes` UTC: an hour more in London (summer time), two more in Oslo. */
    const at = (hours: number, minutes = 0, seconds = 0) => Date.UTC(2026, 9, 1, hours, minutes, seconds);
    const WEEK: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    /** Works 08:00-15:30 London time, in meetings until 15:00 there (14:00 UTC), then free for an hour. */
    const london: WorkSchedule = {
      timeZone: 'Europe/London',
      workingHours: { days: WEEK, start: 8 * 60, end: 15 * 60 + 30 },
      free: [{ start: at(14), end: at(15) }],
    };
    const inZone = (timeZone: string): WorkSchedule => ({ ...london, timeZone });
    const DECLINED = new SignInFailedError('declined', 'Microsoft sign-in error access_denied (AADSTS65004).');

    /** Answers the calendar's question with `answers` in turn, the last again after them, and Turn on with `consent`; keeps what was asked. */
    function calendarHost(answers: readonly (WorkSchedule | null | Error | Promise<never>)[], consent: Error | null = null) {
      const requests: Request<unknown>[] = [];
      let answered = 0;
      const answer = (request: Request<unknown>): unknown => {
        requests.push(request);
        if (request instanceof ConsentToCalendarCommand) return consent ? Promise.reject(consent) : undefined;
        if (!(request instanceof GetWorkingHoursQuery)) return undefined;
        const reply = answers[Math.min(answered++, answers.length - 1)];
        return reply instanceof Error ? Promise.reject(reply) : reply;
      };
      const asked = () => requests.filter((request) => request instanceof GetWorkingHoursQuery);
      return { requests, answer, asked };
    }

    const row = () => screen.getByText('Local time').closest('div') as HTMLElement;
    /** Lets the panel's questions be answered. */
    const settle = () => act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    /** Teams status comes after the tracker gathers the people to ask for (300 ms), on real timers. */
    const afterPresence = () => act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    /** The viewer's browser in Oslo, two hours ahead of UTC in summer, whatever the machine's zone; again for each fake Date. */
    const viewFromOslo = () => vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-120);

    beforeEach(() => {
      // Only the clock: the queries' answers still come on real timers.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(at(13, 5));
      viewFromOslo();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('leaves no row of the person before when another person\'s details open', async () => {
      const { answer } = calendarHost([london]);
      const { show } = renderPanel('anna', answer, { showWorkingHours: true, presence: onHoliday });
      await afterPresence();
      expect(screen.getAllByText('Automatic reply')).toHaveLength(1);

      show('kari');
      await afterPresence();

      expect(screen.getAllByText('Automatic reply')).toHaveLength(1);
      expect(screen.getAllByText('Local time')).toHaveLength(1);
    });

    it('shows the time, how far it is from the viewer\'s, and the working hours with when the person is free next', async () => {
      const { answer, asked } = calendarHost([london]);
      renderPanel('anna', answer, { showWorkingHours: true });

      expect(await screen.findByText('14:05, 1 hour behind you')).toBeTruthy();
      expect(within(row()).getByText('Works Mon-Fri 08:00-15:30, free from 15:00')).toBeTruthy();
      expect(asked()).toEqual([new GetWorkingHoursQuery(getNode(chart, 'anna').employee)]);
      // Among the details of the moment, before the e-mail address.
      const contact = screen.getByRole('heading', { name: 'Contact' }).closest('section') as HTMLElement;
      expect(within(contact).getAllByRole('term').map((term) => term.textContent).slice(0, 2)).toEqual(['Local time', 'E-mail']);
    });

    it('says nothing of a difference where the person\'s clock shows the viewer\'s time, whatever the zone is called', async () => {
      for (const timeZone of ['Europe/Oslo', 'Europe/Berlin']) {
        renderPanel('anna', calendarHost([inZone(timeZone)]).answer, { showWorkingHours: true });

        expect(await screen.findByText('15:05')).toBeTruthy();
        // Their working day ends at 15:30, before the free hour at 16:00.
        expect(within(row()).getByText('Works Mon-Fri 08:00-15:30')).toBeTruthy();
        cleanup();
      }
    });

    it('says how far ahead or behind a clock is, in minutes too where zones are part of an hour apart', async () => {
      renderPanel('anna', calendarHost([inZone('Asia/Kolkata')]).answer, { showWorkingHours: true });
      expect(await screen.findByText('18:35, 3 hours 30 minutes ahead of you')).toBeTruthy();
      // Past 15:30 there, so no free time is offered.
      expect(within(row()).getByText('Works Mon-Fri 08:00-15:30')).toBeTruthy();
      cleanup();

      renderPanel('anna', calendarHost([inZone('America/New_York')]).answer, { showWorkingHours: true });
      expect(await screen.findByText('09:05, 6 hours behind you')).toBeTruthy();
      // The free hour from 14:00 UTC, on the person's own clock.
      expect(within(row()).getByText('Works Mon-Fri 08:00-15:30, free from 10:00')).toBeTruthy();
    });

    it('shows the row only once the time is known', async () => {
      renderPanel('anna', calendarHost([new Promise<never>(() => undefined)]).answer, { showWorkingHours: true });
      await settle();
      expect(screen.queryByText('Local time')).toBeNull();
      cleanup();

      // No working hours, or a zone the chart doesn't know.
      const { answer, asked } = calendarHost([null]);
      renderPanel('anna', answer, { showWorkingHours: true });
      await settle();
      expect(asked()).toHaveLength(1);
      expect(screen.queryByText('Local time')).toBeNull();
    });

    it('asks nothing where config.json turns the row off, or the person has no e-mail address to ask the calendar by', async () => {
      const { answer, asked } = calendarHost([london]);
      renderPanel('anna', answer);
      renderPanel('ola', answer, { showWorkingHours: true });
      await settle();

      expect(asked()).toEqual([]);
      expect(screen.queryByText('Local time')).toBeNull();
    });

    it('asks again for every chart, so that a refresh brings the free times up to date, keeping the time shown meanwhile', async () => {
      const { answer, asked } = calendarHost([london, new Promise<never>(() => undefined)]);
      const { show } = renderPanel('anna', answer, { showWorkingHours: true });
      await screen.findByText('14:05, 1 hour behind you');

      show('anna', buildOrgChart([...chart.nodes.values()].map((node) => node.employee), options));

      await waitFor(() => {
        expect(asked()).toHaveLength(2);
      });
      expect(screen.getByText('14:05, 1 hour behind you')).toBeTruthy();
    });

    it('never shows one person\'s time for another\'s, whose answer is still on its way', async () => {
      const { show } = renderPanel(
        'anna',
        (request) => {
          if (!(request instanceof GetWorkingHoursQuery)) return undefined;
          return request.employee.id === 'anna' ? london : new Promise(() => undefined);
        },
        { showWorkingHours: true },
      );
      expect(await screen.findByText('14:05, 1 hour behind you')).toBeTruthy();

      show('kari');

      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Kari');
      expect(screen.queryByText('Local time')).toBeNull();
    });

    it('offers Turn on until someone consents to reading calendars, then shows the time and moves the focus to it', async () => {
      const { requests, answer, asked } = calendarHost([new CalendarConsentRequiredError(), london]);
      renderPanel('anna', answer, { showWorkingHours: true });

      const turnOn = await screen.findByRole('button', { name: 'Turn on' });
      expect(valueOf('Local time')).toBe('Needs permission to read calendars. Turn on');
      turnOn.focus();
      fireEvent.click(turnOn);

      const time = await screen.findByText('14:05, 1 hour behind you');
      expect(requests.filter((request) => request instanceof ConsentToCalendarCommand)).toHaveLength(1);
      expect(asked()).toHaveLength(2);
      // Turn on went with the focus, which the time takes, so that it is read out.
      expect(document.activeElement).toBe(time);
      expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull();
    });

    it('keeps Turn on unavailable while the answer after a consent is on its way, so that a second press asks for no second consent', async () => {
      const { requests, answer, asked } = calendarHost([new CalendarConsentRequiredError(), new Promise<never>(() => undefined)]);
      renderPanel('anna', answer, { showWorkingHours: true });
      const turnOn = await screen.findByRole('button', { name: 'Turn on' });
      expect(turnOn.getAttribute('aria-disabled')).toBeNull();

      fireEvent.click(turnOn);
      await waitFor(() => {
        expect(asked()).toHaveLength(2);
      });

      expect(turnOn.getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(turnOn);
      expect(requests.filter((request) => request instanceof ConsentToCalendarCommand)).toHaveLength(1);
    });

    it('words a consent that failed under Turn on, which stays to try again with the focus on it', async () => {
      const { answer, asked } = calendarHost([new CalendarConsentRequiredError()], DECLINED);
      renderPanel('anna', answer, { showWorkingHours: true });
      const turnOn = await screen.findByRole('button', { name: 'Turn on' });
      turnOn.focus();

      fireEvent.click(turnOn);

      expect((await within(row()).findByRole('alert')).textContent).toBe(describeError(DECLINED, 'en'));
      expect(document.activeElement).toBe(turnOn);
      expect(asked()).toHaveLength(1);
    });

    it('says what came of Turn on where the person\'s calendar names no time zone, with the focus there', async () => {
      const { answer } = calendarHost([new CalendarConsentRequiredError(), null]);
      renderPanel('anna', answer, { showWorkingHours: true });
      const turnOn = await screen.findByRole('button', { name: 'Turn on' });
      turnOn.focus();

      fireEvent.click(turnOn);

      const outcome = await screen.findByText('This person\'s calendar does not say.');
      expect(document.activeElement).toBe(outcome);
    });

    it('renews the time as each minute starts while the panel is open, and when the person is free with it', async () => {
      vi.useRealTimers();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      vi.setSystemTime(at(13, 58, 20));
      viewFromOslo();
      const pass = (milliseconds: number) => act(() => vi.advanceTimersByTimeAsync(milliseconds));
      renderPanel('anna', calendarHost([london]).answer, { showWorkingHours: true });
      await pass(0);
      expect(valueOf('Local time')).toBe('14:58, 1 hour behind youWorks Mon-Fri 08:00-15:30, free from 15:00');

      await pass(40_000);
      expect(valueOf('Local time')).toBe('14:59, 1 hour behind youWorks Mon-Fri 08:00-15:30, free from 15:00');

      await pass(60_000);
      expect(valueOf('Local time')).toBe('15:00, 1 hour behind youWorks Mon-Fri 08:00-15:30, free now');
    });
  });

  describe('with an account that is no ordinary member\'s', () => {
    it('marks a disabled account and offers no Teams chat or call, which can\'t reach it, but keeps e-mail', () => {
      renderPanel('former', undefined, { shown: accounts });

      expect(screen.getByText('Disabled account')).toBeTruthy();
      for (const button of chatAndCall()) expect(button.hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'E-mail' }).hasAttribute('disabled')).toBe(false);
    });

    it('marks a member without a license, whom Teams can\'t reach either', () => {
      renderPanel('trainee', undefined, { shown: accounts });

      expect(screen.getByText('No license')).toBeTruthy();
      for (const button of chatAndCall()) expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('marks a guest, whose license is their own organization\'s, and keeps chat and call', () => {
      renderPanel('guest', undefined, { shown: accounts });

      expect(screen.getByText('Guest')).toBeTruthy();
      expect(screen.queryByText('No license')).toBeNull();
      for (const button of chatAndCall()) expect(button.hasAttribute('disabled')).toBe(false);
    });

    it('marks nobody else', () => {
      renderPanel('anna');

      expect(screen.queryByText(/^(Disabled account|Guest|No license)$/)).toBeNull();
      for (const button of chatAndCall()) expect(button.hasAttribute('disabled')).toBe(false);
    });

    it('says the account\'s state and why the person heads a branch on lines of their own', () => {
      renderPanel('analyst', recordedManagerHost({ manager: boss, reason: 'disabledAccounts' }).answer, { shown: flagged });

      const state = screen.getByText('Disabled account');
      const flag = screen.getByText('Manager not shown');
      expect([state.tagName, flag.tagName]).toEqual(['P', 'P']);
      expect(state.nextElementSibling).toBe(flag);
    });
  });

  describe('with the organization\'s own fields', () => {
    const fields: ExtraField[] = [
      { property: 'employeeType', label: 'Employee type', search: false, export: false },
      { property: 'employeeOrgData.costCenter', label: 'Cost centre', search: true, export: true },
      { property: 'onPremisesExtensionAttributes.extensionAttribute3', label: 'Badge number', search: false, export: false },
    ];
    // Anna has an employee type and a cost centre but no badge number; Ola has only a division, which config.json doesn't name.
    const withFields = buildOrgChart(
      [
        makeEmployee('ceo'),
        makeEmployee('anna', 'ceo', {
          displayName: 'Anna Lund',
          employeeId: 'E1001',
          extra: { 'employeeOrgData.costCenter': '4170', employeeType: 'Contractor' },
        }),
        makeEmployee('ola', 'anna', { displayName: 'Ola Berg', extra: { 'employeeOrgData.division': 'Retail' } }),
      ],
      options,
    );
    const organizationLabels = () =>
      [...(screen.getByRole('heading', { name: 'Organization' }).closest('section')?.querySelectorAll('dt') ?? [])].map(
        (term) => term.textContent,
      );

    it('shows each among the organization details, after the employee ID, in config.json\'s order and under its labels', () => {
      renderPanel('anna', undefined, { shown: withFields, extraFields: fields });

      expect(organizationLabels()).toEqual([
        'Employee ID',
        'Employee type',
        'Cost centre',
        'Reporting line',
        'Department',
        'Manager',
        'Direct reports (1)',
      ]);
      expect(valueOf('Employee type')).toBe('Contractor');
      expect(valueOf('Cost centre')).toBe('4170');
    });

    it('leaves out a field the person has no value for, and a value of a field that config.json doesn\'t name', () => {
      renderPanel('ola', undefined, { shown: withFields, extraFields: fields });

      expect(organizationLabels()).toEqual(['Reporting line', 'Department', 'Manager']);
      expect(screen.queryByText('Retail')).toBeNull();
    });
  });

  describe('with a manager the chart leaves out', () => {
    it('names the manager the directory records, and the filter that hides them', async () => {
      const { requests, answer } = recordedManagerHost({ manager: boss, reason: 'disabledAccounts' });
      renderPanel('analyst', answer, { shown: flagged });

      const row = (await screen.findByText('Recorded manager')).closest('div') as HTMLElement;
      expect(within(row).getByText('Bo Sund')).toBeTruthy();
      expect(within(row).getByText('Hidden by the filters: Disabled accounts')).toBeTruthy();
      // Not a link: the chart has no card for the manager to move to.
      expect(within(row).queryByRole('button')).toBeNull();
      expect(requests).toContainEqual(new GetRecordedManagerQuery(options, 'analyst'));
    });

    it('names no manager the address list hides while its filter is on, only that filter', async () => {
      renderPanel('analyst', recordedManagerHost({ manager: null, reason: 'hiddenFromAddressList' }).answer, { shown: flagged });

      expect(await screen.findByText('Recorded manager')).toBeTruthy();
      expect(valueOf('Recorded manager')).toBe('Hidden by the filters: People hidden from the address list');
    });

    it('says so where no user in the directory has the recorded id', async () => {
      renderPanel('analyst', recordedManagerHost({ manager: null, reason: 'notInDirectory' }).answer, { shown: flagged });

      expect(await screen.findByText('Recorded manager')).toBeTruthy();
      expect(valueOf('Recorded manager')).toBe('No longer in the directory, or not a user');
    });

    it('asks only about people whose manager is not shown', async () => {
      const { requests, answer } = recordedManagerHost({ manager: boss, reason: 'disabledAccounts' });
      renderPanel('stray', answer, { shown: flagged });
      cleanup();
      renderPanel('anna', answer);

      await act(async () => {
        await Promise.resolve();
      });
      expect(requests.filter((request) => request instanceof GetRecordedManagerQuery)).toEqual([]);
      expect(screen.queryByText('Recorded manager')).toBeNull();
    });

    it('never shows one person\'s recorded manager for another, whose answer is still on its way', async () => {
      const twoFlagged = buildOrgChart(
        [makeEmployee('ceo'), makeEmployee('analyst', 'boss'), makeEmployee('auditor', 'gone', { displayName: 'Aud Hagen' })],
        options,
      );
      const { show } = renderPanel(
        'analyst',
        (request) => {
          if (!(request instanceof GetRecordedManagerQuery)) return undefined;
          // The auditor's answer never comes.
          return request.employeeId === 'analyst' ? { manager: boss, reason: 'disabledAccounts' } : new Promise(() => undefined);
        },
        { shown: twoFlagged },
      );
      expect(await screen.findByText('Bo Sund')).toBeTruthy();

      show('auditor');

      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Aud Hagen');
      expect(screen.getByText('Manager not shown')).toBeTruthy();
      expect(screen.queryByText('Bo Sund')).toBeNull();
      expect(screen.queryByText('Recorded manager')).toBeNull();
    });

    it('asks again for every chart, as a refresh or other filters can change the answer', async () => {
      const { requests, answer } = recordedManagerHost({ manager: boss, reason: 'disabledAccounts' });
      const { show } = renderPanel('analyst', answer, { shown: flagged });
      await screen.findByText('Recorded manager');
      const asked = () => requests.filter((request) => request instanceof GetRecordedManagerQuery);
      expect(asked()).toHaveLength(1);

      show('analyst', buildOrgChart([...flagged.nodes.values()].map((node) => node.employee), options));

      await waitFor(() => {
        expect(asked()).toHaveLength(2);
      });
    });

    it('leaves the row out when the question fails, and the flag still says the manager is not shown', async () => {
      const { requests, answer } = recordedManagerHost(new Error('The directory is gone.'));
      renderPanel('analyst', answer, { shown: flagged });

      await waitFor(() => {
        expect(requests.some((request) => request instanceof GetRecordedManagerQuery)).toBe(true);
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(screen.queryByText('Recorded manager')).toBeNull();
      expect(screen.getByText('Manager not shown')).toBeTruthy();
    });
  });

  describe('with a team', () => {
    /** The host above, which also plans whom the team's chat, e-mail and meeting reach, nobody signed in. */
    const withTeam = (requests: Request<unknown>[] = []) => {
      const answer = host();
      return (request: Request<unknown>): unknown => {
        requests.push(request);
        return request instanceof GetTeamContactQuery ? planTeamContact(request.team, null) : answer(request);
      };
    };
    /** The Team section, found by its heading. */
    const teamElement = () => screen.getByRole('heading', { level: 3, name: 'Team' }).closest('section') as HTMLElement;
    const teamSection = () => within(teamElement());
    const numbers = () =>
      within(teamSection().getByRole('list', { name: 'The team in numbers' }))
        .getAllByRole('listitem')
        .map((tile) => tile.textContent);

    it('sums the team up in a last section of its own, leaving Organization only the list of direct reports', () => {
      renderPanel('anna');

      const reportsRow = within(screen.getByText('Direct reports (1)').closest('div') as HTMLElement);
      expect(reportsRow.getByRole('button', { name: /^Ola Berg/ })).toBeTruthy();
      expect(reportsRow.queryByRole('list', { name: 'The team in numbers' })).toBeNull();
      expect(reportsRow.queryByRole('button', { name: 'Show only this team' })).toBeNull();
      expect(screen.getAllByRole('heading', { level: 3 }).at(-1)).toBe(teamSection().getByRole('heading', { level: 3 }));
    });

    it('offers the section only to people with direct reports, asking nothing about a team for anyone else', async () => {
      const requests: Request<unknown>[] = [];
      renderPanel('kari', withTeam(requests));

      await screen.findByRole('button', { name: 'Copy link' });
      expect(screen.queryByRole('heading', { name: 'Team' })).toBeNull();
      expect(screen.queryByRole('list', { name: 'The team in numbers' })).toBeNull();
      expect(requests.some((request) => request instanceof GetTeamContactQuery)).toBe(false);
      expect(screen.queryByRole('button', { name: 'Chat with the direct reports' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'See the whole team' })).toBeNull();
    });

    it('opens with the team\'s numbers: its size always, its levels and managers only where it goes deeper than the reports', () => {
      renderPanel('ceo');
      expect(numbers()).toEqual(['3 people', '3 levels', '2 managers']);
      cleanup();

      renderPanel('ola');
      expect(numbers()).toEqual(['1 person']);
    });

    it('shows one team at a time: another person\'s numbers and lists replace the last one\'s', () => {
      const { show } = renderPanel('ceo');
      expect(numbers()).toEqual(['3 people', '3 levels', '2 managers']);

      show('anna');

      // Siblings keyed by the person must not share a key, or React keeps the old glance beside the new one.
      expect(screen.getAllByRole('list', { name: 'The team in numbers' })).toHaveLength(1);
      expect(screen.getAllByRole('list', { name: 'Departments' })).toHaveLength(1);
      expect(numbers()).toEqual(['2 people', '2 levels', '1 manager']);
    });

    it('goes on with the departments and cities, what the chart shows of the team, then how to reach it', async () => {
      const company = buildOrgChart(
        [
          makeEmployee('ceo'),
          makeEmployee('lead', 'ceo', { city: 'Oslo' }),
          makeEmployee('dev', 'lead', { department: 'Design', city: 'Oslo' }),
          makeEmployee('tester', 'lead', { city: 'Bergen' }),
          makeEmployee('intern', 'dev', { city: 'Oslo' }),
          makeEmployee('aide', 'ceo'),
        ],
        options,
      );
      renderPanel('lead', withTeam(), { shown: company });

      await teamSection().findByRole('button', { name: 'Chat with the direct reports' });
      const parts = teamElement().querySelectorAll('ul[aria-label], h4, button');
      expect(Array.from(parts, (part) => part.getAttribute('aria-label') ?? part.textContent)).toEqual([
        'The team in numbers',
        'Departments',
        'Engineering 2 people',
        'Design 1 person',
        'Cities',
        'Oslo 2 people',
        'Bergen 1 person',
        'Show only this team',
        'See the whole team',
        'Contact the direct reports',
        'Chat with the direct reports',
        'E-mail the direct reports',
        'New meeting with the direct reports',
      ]);
      expect(numbers()).toEqual(['3 people', '2 levels', '1 manager']);
    });

    it('lists a department\'s or a city\'s people in the panel\'s place, from its row', () => {
      const company = buildOrgChart(
        [makeEmployee('ceo'), makeEmployee('lead', 'ceo'), makeEmployee('dev', 'lead', { city: 'Oslo' }), makeEmployee('tester', 'lead', { city: 'Bergen' })],
        options,
      );
      const { onSeeTeam } = renderPanel('lead', undefined, { shown: company });

      fireEvent.click(within(teamSection().getByRole('list', { name: 'Cities' })).getByRole('button', { name: 'Bergen 1 person' }));

      expect(onSeeTeam).toHaveBeenCalledExactlyOnceWith('lead', { field: 'city', name: 'Bergen' });
    });

    it('offers to show only the team where that leaves anyone out of the chart', () => {
      const { onShowOnlyTeam } = renderPanel('anna');

      fireEvent.click(teamSection().getByRole('button', { name: 'Show only this team' }));
      expect(onShowOnlyTeam).toHaveBeenCalledExactlyOnceWith('anna');
      cleanup();

      // The CEO's team is the whole chart.
      renderPanel('ceo');
      expect(screen.queryByRole('button', { name: 'Show only this team' })).toBeNull();
      expect(teamSection().getByRole('button', { name: 'See the whole team' })).toBeTruthy();
    });

    it('offers Show everyone in its place to the person at the top of the team the chart shows alone', () => {
      const onShowEveryone = vi.fn();
      renderPanel('anna', undefined, { onShowEveryone });

      fireEvent.click(teamSection().getByRole('button', { name: 'Show everyone' }));

      expect(onShowEveryone).toHaveBeenCalledOnce();
      expect(screen.queryByRole('button', { name: 'Show only this team' })).toBeNull();
    });

    it('keeps the one button, and the focus on it, as Show only this team turns into Show everyone', () => {
      const { show } = renderPanel('anna');
      const button = teamSection().getByRole('button', { name: 'Show only this team' });
      button.focus();

      show('anna', chart, vi.fn());

      expect(button.textContent).toBe('Show everyone');
      expect(document.activeElement).toBe(button);
    });

    it('reaches exactly the direct reports, the manager left out, from tiles labelled as the person\'s own actions, saying where each opens', async () => {
      const requests: Request<unknown>[] = [];
      const company = buildOrgChart(
        [
          makeEmployee('ceo'),
          makeEmployee('lead', 'ceo', { displayName: 'Lea Dahl' }),
          makeEmployee('dev', 'lead'),
          makeEmployee('tester', 'lead', { mail: null }),
        ],
        options,
      );
      renderPanel('lead', withTeam(requests), { shown: company });

      const chat = await teamSection().findByRole('button', {
        name: 'Chat with the direct reports',
        description: 'Opens Microsoft Teams in a new tab',
      });
      const email = teamSection().getByRole('button', { name: 'E-mail the direct reports', description: 'Opens your mail app' });
      const meeting = teamSection().getByRole('button', { name: 'New meeting with the direct reports' });
      expect(teamSection().getByRole('heading', { level: 4, name: 'Contact the direct reports' })).toBeTruthy();
      expect([chat.textContent, email.textContent, meeting.textContent]).toEqual(['Chat', 'E-mail', 'Meeting']);
      expect(meeting.title).toBe('Opens Microsoft Teams in a new tab');
      // The tester has no e-mail address.
      expect(teamSection().getByRole('paragraph').textContent).toBe('E-mail leaves out 1 person without an e-mail address.');

      fireEvent.click(chat);
      const reports = [getNode(company, 'dev').employee, getNode(company, 'tester').employee];
      expect(requests).toContainEqual(new ContactTeamCommand(reports, 'chat', "Lea Dahl's team"));
    });

    it('lists the whole team in the panel\'s place, from a button the page can give the focus back to', () => {
      const { onSeeTeam, seeTeamRef } = renderPanel('ceo');

      const button = teamSection().getByRole('button', { name: 'See the whole team' });
      expect(seeTeamRef.current).toBe(button);
      fireEvent.click(button);

      expect(onSeeTeam).toHaveBeenCalledExactlyOnceWith('ceo');
    });

    it('lists the first 20 direct reports, then Show all, which lists the rest with the focus on the first of them', () => {
      const agents = Array.from({ length: 25 }, (_, index) => makeEmployee(`agent${String(index + 1).padStart(2, '0')}`, 'ceo'));
      renderPanel('ceo', undefined, { shown: buildOrgChart([makeEmployee('ceo'), ...agents], options) });
      const row = screen.getByText('Direct reports (25)').closest('div') as HTMLElement;
      const listed = () => within(within(row).getAllByRole('list')[0] as HTMLElement).getAllByRole('button');
      expect(listed()).toHaveLength(20);

      fireEvent.click(within(row).getByRole('button', { name: 'Show all 25' }));

      expect(listed()).toHaveLength(25);
      expect(document.activeElement).toBe(within(row).getByRole('button', { name: /^Agent21/ }));
      expect(within(row).queryByRole('button', { name: /^Show all/ })).toBeNull();
    });

    it('lists 20 direct reports whole, and the next manager\'s from the first 20 again', () => {
      const team = (managerId: string, count: number) =>
        Array.from({ length: count }, (_, index) => makeEmployee(`${managerId}${String(index + 1).padStart(2, '0')}`, managerId));
      const company = buildOrgChart(
        [makeEmployee('ceo'), makeEmployee('lead', 'ceo'), makeEmployee('boss', 'ceo'), ...team('lead', 20), ...team('boss', 30)],
        options,
      );
      const { show } = renderPanel('lead', undefined, { shown: company });
      expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();

      show('boss');
      fireEvent.click(screen.getByRole('button', { name: 'Show all 30' }));
      show('ceo');
      show('boss');

      expect(screen.getByRole('button', { name: 'Show all 30' })).toBeTruthy();
    });
  });

  describe('around someone the address list hides', () => {
    /** The head of audit, whom the address list hides, beside Anna and over an auditor. */
    const hiddenHead = buildOrgChart(
      [
        makeEmployee('ceo'),
        makeEmployee('anna', 'ceo', { displayName: 'Anna Lund' }),
        makeEmployee('auditHead', 'ceo', { displayName: 'Hanne Hidden', hiddenFromAddressList: true }),
        makeEmployee('auditor', 'auditHead', { displayName: 'Ida Auditor' }),
      ],
      { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } },
    );
    const row = (label: string) => within(screen.getByText(label).closest('div') as HTMLElement);

    it('puts their place in the reporting line and the Manager row in the words of their card, as nothing to press', () => {
      renderPanel('auditor', undefined, { shown: hiddenHead });

      expect(valueOf('Reporting line')).toBe('Ceo›Not in the address list›Ida Auditor');
      expect(row('Reporting line').getAllByRole('button').map((button) => button.textContent)).toEqual(['Ceo']);
      expect(valueOf('Manager')).toBe('Not in the address list');
      expect(row('Manager').queryByRole('button')).toBeNull();
      expect(document.body.textContent).not.toContain('Hanne');
    });

    it('lists their place among the direct reports the same way, and reaches only the people named', async () => {
      const requests: Request<unknown>[] = [];
      const answer = host();
      renderPanel(
        'ceo',
        (request) => {
          requests.push(request);
          return request instanceof GetTeamContactQuery ? planTeamContact(request.team, null) : answer(request);
        },
        { shown: hiddenHead },
      );

      const [anna, place] = row('Direct reports (2)').getAllByRole('listitem');
      expect(within(anna as HTMLElement).getByRole('button', { name: /^Anna Lund/ })).toBeTruthy();
      expect(place?.textContent).toBe('Not in the address list');
      expect(within(place as HTMLElement).queryByRole('button')).toBeNull();
      // Anna and the auditor: the place is listed as a direct report, but counted as nobody in the team.
      const tiles = within(screen.getByRole('list', { name: 'The team in numbers' })).getAllByRole('listitem');
      expect(tiles.map((tile) => tile.textContent)).toEqual(['2 people', '2 levels']);
      await waitFor(() => {
        const asked = requests.filter((request) => request instanceof GetTeamContactQuery).map(({ team }) => team.map(({ id }) => id));
        expect(asked).toEqual([['anna']]);
      });
    });

    it('shows nothing for their place, which the chart never selects', () => {
      renderPanel('auditHead', undefined, { shown: hiddenHead });

      expect(screen.queryByRole('complementary')).toBeNull();
    });
  });
});
