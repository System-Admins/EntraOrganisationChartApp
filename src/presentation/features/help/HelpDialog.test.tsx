// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DirectoryStatus } from '@/application/abstractions/employeeDirectory';
import type { Request, Sender } from '@/application/common/mediator';
import { OrgChartProvider } from '@/application/common/orgChartProvider';
import { CopyTextCommand } from '@/application/features/clipboard/copyText';
import { GetDiagnosticsHandler, GetDiagnosticsQuery, type Diagnostics } from '@/application/features/diagnostics/getDiagnostics';
import type { SupportDesk } from '@/application/settings/appSettings';
import { HOST_KINDS, type HostKind } from '@/application/settings/hostKind';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { installDialogMethods } from '@/testing/dialog';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { MediatorProvider } from '../../shared/mediatorContext';
import { SupportDeskProvider } from '../../shared/supportDesk';
import { COPIED_MS } from '../../shared/useCopiedFeedback';
import { areaStyles } from '../orgChart/areaColors';
import { PresenceProvider } from '../presence/presenceContext';
import { PrintProvider } from '../print/printContext';
import { AboutThisChart } from './AboutThisChart';
import { HelpDialog } from './HelpDialog';
import styles from './HelpDialog.module.css';
import stylesheet from './HelpDialog.module.css?raw';
import { HelpTopics } from './HelpTopics';
import { HELP_KEYS } from './strings';

beforeAll(installDialogMethods);

afterEach(cleanup);

/** Printing is never started here, no presence is asked for and nothing is copied. */
const idle: Sender = { send: <T,>() => Promise.resolve(undefined as T) };

const described = (element: HTMLElement) => document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;

describe('HelpDialog', () => {
  /** A page with the button that opens the dialog, as the toolbar has it. */
  function Page({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <MediatorProvider mediator={idle}>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Help
        </button>
        <HelpDialog
          searchable
          open={open}
          onClose={() => {
            setOpen(false);
            onClose();
          }}
          host="standalone"
          version="1.0.42"
        />
      </MediatorProvider>
    );
  }

  function openHelp() {
    const onClose = vi.fn();
    render(<Page onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Help' });
    act(() => {
      opener.focus();
    });
    fireEvent.click(opener);
    return { opener, onClose, dialog: screen.getByRole<HTMLDialogElement>('dialog', { name: 'Help' }) };
  }

  it('holds nothing until it is opened, then shows the help a section each, the details for IT last, with the focus inside', () => {
    render(<Page onClose={vi.fn()} />);
    expect(document.querySelector('dialog')?.childElementCount).toBe(0);
    cleanup();

    const { dialog } = openHelp();

    expect(dialog.open).toBe(true);
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Using the chart',
      'Colours and marks',
      'Your IT support',
      'About this chart',
    ]);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close help' }));
  });

  it('closes from its Close button and hands the focus back to the button that opened it', () => {
    const { opener, onClose, dialog } = openHelp();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close help' }));

    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    expect(dialog.childElementCount).toBe(0);
  });
});

describe('HelpTopics', () => {
  interface HelpSetup {
    readonly printOpensBrowser?: boolean;
    readonly host?: HostKind;
    readonly chart?: OrgChart;
    /** Whether Teams status is on, as config.json's chart.showPresence switches it. */
    readonly presence?: boolean;
    readonly desk?: SupportDesk | null;
    /** Whether the page has its search field (?without=search leaves it out). */
    readonly searchable?: boolean;
  }

  function renderHelp({
    printOpensBrowser = false,
    host = 'standalone',
    chart,
    presence = false,
    desk = null,
    searchable = true,
  }: HelpSetup = {}) {
    const { container } = render(
      <MediatorProvider mediator={idle}>
        <SupportDeskProvider desk={desk}>
          <PresenceProvider enabled={presence}>
            <PrintProvider opensBrowser={printOpensBrowser}>
              <HelpTopics host={host} searchable={searchable} chart={chart} />
            </PrintProvider>
          </PresenceProvider>
        </SupportDeskProvider>
      </MediatorProvider>,
    );
    return within(container);
  }
  type Help = ReturnType<typeof renderHelp>;
  const headings = (help: Help, level: number) => help.getAllByRole('heading', { level }).map((heading) => heading.textContent);
  const topics = (help: Help) => headings(help, 4);
  /** The topics of one section, under its heading. */
  const topicsIn = (help: Help, section: string) => topics(within(help.getByRole('region', { name: section })));
  /** What follows a topic's heading: its text, or its list. */
  const after = (help: Help, topic: string, step = 1) => {
    let element = help.getByRole('heading', { level: 4, name: topic }) as Element | null;
    for (let index = 0; index < step; index++) element = element?.nextElementSibling ?? null;
    return element as HTMLElement;
  };
  /** Each entry of a list of terms: the term, then what it means. */
  const termsIn = (list: HTMLElement) =>
    within(list)
      .getAllByRole('term')
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
  const keysIn = (help: Help) => termsIn(after(help, 'Keyboard'));
  /** A legend's entries as their text, and each one's mark. */
  const marksIn = (list: HTMLElement) => within(list).getAllByRole('listitem');

  it('says how to use the chart, what its marks mean and whom to ask, a section each', () => {
    const help = renderHelp();

    expect(headings(help, 3)).toEqual(['Using the chart', 'Colours and marks', 'Your IT support']);
    expect(topicsIn(help, 'Using the chart')).toEqual(['Mouse and touch', 'Search', 'Departments', 'Back', 'Keyboard']);
    expect(topicsIn(help, 'Colours and marks')).toEqual(['Warnings']);
  });

  it('says what a click on a card does that a click on its badge does not', () => {
    expect(after(renderHelp(), 'Mouse and touch').textContent).toBe(
      "Clicking a card folds or unfolds the people below it and shows the person's details. " +
        'The badge with the number of direct reports folds or unfolds without showing the details. ' +
        'A long team shows 50 people at a time, and Show more at its end shows the next ones.',
    );
  });

  it('lists the keys of the chart, the letters, \'*\' and \'/\' among them, each with what it does', () => {
    const keys = keysIn(renderHelp());

    expect(keys).toHaveLength(HELP_KEYS.length);
    // Moving around comes first, each key in the order of what it does.
    expect(keys[0]).toEqual(['Up or Down arrow', 'Move to the previous or the next person, heading or Show more']);
    expect(keys).toEqual(
      expect.arrayContaining([
        ['Home or End', 'Move to the first or the last item shown'],
        ['Right arrow', 'Unfold the team or the heading, or move into it'],
        ['Left arrow', 'Fold the team or the heading, or move to the manager or the heading above'],
        [
          'Enter or Space',
          "Show the person's details and fold or unfold the team, as a click does. " +
            'On a heading, fold or unfold it; on Show more, show the next people',
        ],
        [
          'Letters',
          'Move to the next person shown whose name starts with the letters typed, or the next heading or Show more that does; ' +
            'a space right after a letter is part of the name',
        ],
        [
          'Asterisk (*)',
          'Unfold the teams of everyone with the same manager or under the same heading, or of everyone at the top; ' +
            'on a heading, unfold every heading',
        ],
        ['Slash (/)', 'Go to Search'],
        ['Escape', 'Close the details or a list in their place, the search suggestions or this dialog'],
        ['Ctrl+P, or Cmd+P on a Mac', 'Print the chart as it is unfolded, with photos'],
      ]),
    );
  });

  it('leaves out the key to Search where the embedding page leaves out the search field', () => {
    const keys = keysIn(renderHelp({ searchable: false }));

    expect(keys).toHaveLength(HELP_KEYS.length - 1);
    expect(keys.map(([key]) => key)).not.toContain('Slash (/)');
  });

  it('says that the print keys open the chart in the browser where the host prints there, as Teams does', () => {
    expect(keysIn(renderHelp({ printOpensBrowser: true })).at(-1)).toEqual([
      'Ctrl+P, or Cmd+P on a Mac',
      'Open the chart in the browser, to print it there',
    ]);
  });

  it('says what the empty search field lists, and what Back closes first where the host gives the chart a Back button', () => {
    const help = renderHelp();
    expect(after(help, 'Search').textContent).toBe(
      'Before you type, the search field lists you, your manager and the people whose details you opened lately, ' +
        'as soon as you click it or move to it.',
    );
    expect(after(help, 'Back').textContent).toBe(
      "The browser's Back button, and the Back gesture of phones, first go from the whole team back to the manager's details, " +
        'and from a department back to the one before it, then close the details, the search results or the departments. ' +
        'Only then do they leave the chart.',
    );
    cleanup();

    expect(after(renderHelp({ host: 'teams' }), 'Back').textContent).toBe(
      "On phones, the Back button of Teams first closes this dialog, then goes from the whole team back to the manager's " +
        'details and from a department back to the one before it, and closes the details, the search results or the departments. ' +
        'Only then does it leave the chart.',
    );
    cleanup();

    // Another page's iframe leaves Back to that page.
    expect(topics(renderHelp({ host: 'embedded' }))).not.toContain('Back');
    cleanup();
    expect(topics(renderHelp({ host: 'sharepoint' }))).not.toContain('Back');
  });

  it('shows each Teams status with the dot the photos have, where Teams status is on', () => {
    expect(topics(renderHelp())).not.toContain('Teams status');
    cleanup();

    const help = renderHelp({ presence: true });
    expect(after(help, 'Teams status').textContent).toBe(
      "The ring around a photo, and the dot on it, show the person's status in Teams:",
    );
    const statuses = marksIn(after(help, 'Teams status', 2));
    expect(statuses.map((status) => status.textContent)).toEqual([
      'Available',
      'Busy',
      'Do not disturb',
      'Away',
      'Offline',
      'Out of office',
    ]);
    // Each beside the dot that marks it on a photo, which screen readers skip, as its words are beside it.
    for (const status of statuses) {
      const dot = status.querySelector('[aria-hidden="true"]');
      expect(dot?.getAttribute('title')).toBe(status.textContent);
    }
  });

  it('names each top person beside the colour of their area, where the chart has several', () => {
    const people = [
      makeEmployee('ingrid', null, { displayName: 'Ingrid Solberg' }),
      makeEmployee('erik', null, { displayName: 'Erik Haugen' }),
    ];
    const two = buildOrgChart(people, { topPersons: ['ingrid', 'erik'], hide: SHOW_EVERYONE });
    const help = renderHelp({ chart: two });

    const areas = marksIn(after(help, 'Area colours', 2));
    expect(areas.map((area) => area.textContent)).toEqual(['Ingrid Solberg', 'Erik Haugen']);
    const colours = areaStyles(two.topPersonIds);
    areas.forEach((area, index) => {
      const sample = area.querySelector<HTMLElement>('[aria-hidden="true"]');
      const colour = colours.get(two.topPersonIds[index] ?? '') as Readonly<Record<string, string>> | undefined;
      expect(sample?.style.getPropertyValue('--area-accent')).toBe(colour?.['--area-accent']);
    });
    cleanup();

    const one = buildOrgChart(people, { topPersons: ['ingrid'], hide: SHOW_EVERYONE });
    expect(topics(renderHelp({ chart: one }))).not.toContain('Area colours');
  });

  it('leaves the area colours out where the cards have none, in the high-contrast theme and with forced colours, without a gap', () => {
    const people = [makeEmployee('ingrid', null), makeEmployee('erik', null)];
    const help = renderHelp({ chart: buildOrgChart(people, { topPersons: ['ingrid', 'erik'], hide: SHOW_EVERYONE }) });
    const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');

    // The whole topic is hidden, heading and all, from a list whose gap leaves nothing in its place.
    const topic = help.getByRole('heading', { level: 4, name: 'Area colours' }).parentElement;
    expect(topic?.classList).toContain(styles.areas);
    expect(topic?.parentElement?.classList).toContain(styles.topics);
    expect(css).toMatch(/\.topics \{[^}]*display: flex;[^}]*gap: 16px;[^}]*\}/);
    expect(css).toMatch(/:global\(:root\[data-theme='contrast'\]\) \.areas \{\s*display: none;\s*\}/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\s*\.areas \{\s*display: none;\s*\}\s*\}/);
  });

  it('explains each warning a card can carry, in the card\'s own words', () => {
    const help = renderHelp();

    expect(after(help, 'Warnings').textContent).toBe(
      'A warning on a card says why the person heads a branch of their own. Such people are gathered under a heading for each warning, ' +
        'with their number, and the filters in Settings decide whether they are shown:',
    );
    expect(termsIn(after(help, 'Warnings', 2))).toEqual([
      ['No manager set', 'The directory names no manager for the person.'],
      [
        'Manager not shown',
        "The directory names a manager whom the chart leaves out, such as a disabled account. The person's details say who.",
      ],
      ['Circular manager chain', "The person's managers lead back to the person, so the chain starts with one of them."],
    ]);
  });

  it('says where wrong details are put right, and leads to the support desk config.json names', () => {
    const support = (help: Help) => within(help.getByRole('region', { name: 'Your IT support' }));
    const plain = support(renderHelp());
    expect(plain.getByText(/^The chart shows/).textContent).toBe(
      'The chart shows what the directory holds. For wrong or missing details, or anything else about the chart, ask your IT support.',
    );
    expect(plain.queryByRole('link')).toBeNull();
    cleanup();

    const link = support(renderHelp({ desk: { label: 'Contoso Service Desk', url: 'https://servicedesk.contoso.com' } })).getByRole('link', {
      name: 'Contoso Service Desk',
    });
    expect(link.getAttribute('href')).toBe('https://servicedesk.contoso.com');
    expect(described(link)).toBe('(opens in a new tab)');
  });

  it('keeps a top person the address list hides unnamed beside their colour, in the words of their card', () => {
    const people = [
      makeEmployee('ingrid', null, { displayName: 'Ingrid Solberg', hiddenFromAddressList: true }),
      makeEmployee('erik', null, { displayName: 'Erik Haugen' }),
    ];
    const help = renderHelp({
      chart: buildOrgChart(people, { topPersons: ['ingrid', 'erik'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } }),
    });

    expect(marksIn(after(help, 'Area colours', 2)).map((area) => area.textContent)).toEqual(['Not in the address list', 'Erik Haugen']);
  });

  it('explains the card that holds the place of someone the address list hides, only where the chart has one', () => {
    const people = [makeEmployee('ceo'), makeEmployee('auditHead', 'ceo', { hiddenFromAddressList: true }), makeEmployee('auditor', 'auditHead')];
    const hiding = renderHelp({
      chart: buildOrgChart(people, { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } }),
    });

    expect(topicsIn(hiding, 'Colours and marks')).toEqual(['Warnings', 'Not in the address list']);
    expect(after(hiding, 'Not in the address list').textContent).toBe(
      'A card without a name or photo holds the place of someone your organization hides from the address list, ' +
        'so that the people below them still show under it. Clicking it only folds or unfolds them.',
    );
    cleanup();

    const showing = renderHelp({ chart: buildOrgChart(people, { topPersons: ['ceo'], hide: SHOW_EVERYONE }) });
    expect(topicsIn(showing, 'Colours and marks')).toEqual(['Warnings']);
  });

  it('puts Teams status and the area colours before the warnings, where both show', () => {
    const people = [makeEmployee('ingrid', null), makeEmployee('erik', null)];
    const help = renderHelp({
      presence: true,
      chart: buildOrgChart(people, { topPersons: ['ingrid', 'erik'], hide: SHOW_EVERYONE }),
    });

    expect(topicsIn(help, 'Colours and marks')).toEqual(['Teams status', 'Area colours', 'Warnings']);
  });
});

describe('AboutThisChart', () => {
  const PEOPLE = [
    makeEmployee('ingrid', null, { displayName: 'Ingrid Solberg' }),
    makeEmployee('erik', 'ingrid', { displayName: 'Erik Lund' }),
    makeEmployee('ase', 'erik', { displayName: 'Åse Vik' }),
    makeEmployee('guest', 'ingrid', { displayName: 'Guest Consultant', isGuest: true }),
  ];
  const KEPT: DirectoryStatus = { fullReadAt: new Date(2026, 8, 29, 14, 3), tracksChanges: true, browserCopy: 'kept' };

  /** What GetDiagnosticsQuery answers for a chart from Ingrid whose top persons also name an address no one has. */
  function diagnosticsFor(status: DirectoryStatus = KEPT): Promise<Diagnostics> {
    const snapshot = { employees: PEOPLE, loadedAt: new Date(2026, 8, 30, 9, 5) };
    const directory = directoryOf(() => snapshot, status);
    const options = { topPersons: ['ingrid@contoso.com', 'ceo@contso.com'], hide: { ...SHOW_EVERYONE, guests: true } };
    return new GetDiagnosticsHandler(new OrgChartProvider(directory), directory).handle(new GetDiagnosticsQuery(options));
  }

  interface AboutSetup {
    readonly diagnostics?: Diagnostics;
    readonly host?: HostKind;
    /** What the clipboard answers, or how the request to copy fails. */
    readonly copies?: boolean | Error;
    readonly presence?: boolean;
  }

  function renderAbout({ diagnostics, host = 'standalone', copies = true, presence = false }: AboutSetup = {}) {
    const copied: string[] = [];
    const mediator: Sender = {
      send: <T,>(request: Request<T>) => {
        if (request instanceof CopyTextCommand) copied.push(request.text);
        return (copies instanceof Error ? Promise.reject(copies) : Promise.resolve(copies)) as Promise<T>;
      },
    };
    render(
      <MediatorProvider mediator={mediator}>
        <PresenceProvider enabled={presence}>
          <AboutThisChart diagnostics={diagnostics} host={host} version="1.0.42" />
        </PresenceProvider>
      </MediatorProvider>,
    );
    return { copied, section: screen.getByRole('region', { name: 'About this chart' }) };
  }
  /** Each detail as its label and value, in the order on screen. */
  const detailsIn = (section: HTMLElement) =>
    within(section)
      .getAllByRole('term')
      .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent ?? ''}`);
  const frame = () =>
    act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

  it('says the version, where the chart runs and its Teams status at once, and how it read the directory once that is known', async () => {
    const { section } = renderAbout();
    expect(detailsIn(section)).toEqual(['Version: 1.0.42', 'Where it runs: Its own site', 'Teams status: Off in config.json']);
    cleanup();

    const known = renderAbout({ diagnostics: await diagnosticsFor(), host: 'teams', presence: true });

    expect(detailsIn(known.section)).toEqual([
      'Version: 1.0.42',
      'Where it runs: Microsoft Teams',
      'Teams status: On',
      'People in the directory: 4',
      'People in the chart: 3',
      'Updated: 2026-09-30 09:05',
      'Read in full: 2026-09-29 14:03',
      'Change tracking: On',
      'Copy in this browser: Kept for the next visit',
      'Top persons: 1 found, 1 not found or hidden',
    ]);
  });

  it('names each kind of host, a copy that is not kept or was refused, and a full read with no record', async () => {
    const where = HOST_KINDS.map((host) => {
      const { section } = renderAbout({ host });
      const detail = detailsIn(section)[1];
      cleanup();
      return detail;
    });
    expect(where).toEqual([
      'Where it runs: Its own site',
      'Where it runs: Embedded in another page',
      'Where it runs: SharePoint web part',
      'Where it runs: Microsoft Teams',
    ]);

    const refused = renderAbout({ diagnostics: await diagnosticsFor({ fullReadAt: null, tracksChanges: false, browserCopy: 'failed' }) });
    expect(detailsIn(refused.section)).toEqual(
      expect.arrayContaining(['Read in full: Not recorded', 'Change tracking: Off', 'Copy in this browser: Could not be saved']),
    );
    cleanup();

    const notKept = renderAbout({ diagnostics: { ...(await diagnosticsFor({ ...KEPT, browserCopy: 'off' })), topPersonsMissing: 0 } });
    expect(detailsIn(notKept.section)).toEqual(expect.arrayContaining(['Copy in this browser: Not kept', 'Top persons: 1 found']));
  });

  it('leaves out the top persons where the chart names none', async () => {
    const { section } = renderAbout({ diagnostics: { ...(await diagnosticsFor()), topPersonsFound: 0, topPersonsMissing: 0 } });

    expect(detailsIn(section).some((detail) => detail.startsWith('Top persons'))).toBe(false);
  });

  it('copies the details as shown, a line each and naming no one, and says so after every copy', async () => {
    const { copied, section } = renderAbout({ diagnostics: await diagnosticsFor() });
    const button = within(section).getByRole('button', { name: 'Copy details' });
    expect(described(button)).toBe('For your IT support, if they ask. The details name no one.');
    const region = within(section).getByRole('status');
    expect(region.textContent).toBe('');

    fireEvent.click(button);

    await waitFor(() => {
      expect(button.textContent).toBe('Copied');
    });
    expect(copied).toEqual([['About this chart', ...detailsIn(section)].join('\n')]);
    for (const person of PEOPLE) {
      expect(copied[0]).not.toContain(person.displayName);
      expect(copied[0]).not.toContain(person.userPrincipalName);
    }
    expect(copied[0]).not.toContain('contso');
    await frame();
    expect(region.textContent).toBe('Details copied');

    // A second copy is said again: the region is emptied for a frame first.
    fireEvent.click(button);
    await waitFor(() => {
      expect(region.textContent).toBe('');
    });
    expect(copied).toHaveLength(2);
    await frame();
    expect(region.textContent).toBe('Details copied');
  });

  it('shows the details to copy by hand where nothing could copy them', async () => {
    const { section } = renderAbout({ diagnostics: await diagnosticsFor(), copies: false });

    fireEvent.click(within(section).getByRole('button', { name: 'Copy details' }));

    const field = await within(section).findByRole<HTMLTextAreaElement>('textbox', { name: 'Copy these details' });
    expect(field.value).toBe(['About this chart', ...detailsIn(section)].join('\n'));
    expect(field.readOnly).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(within(section).getByRole('status').textContent).toBe('');
    expect(within(section).getByRole('button', { name: 'Copy details' })).toBeTruthy();
  });

  it('offers the details to copy by hand as well where the request to copy them failed', async () => {
    const { section } = renderAbout({ copies: new Error('No handler registered for CopyTextCommand.') });

    fireEvent.click(within(section).getByRole('button', { name: 'Copy details' }));

    const field = await within(section).findByRole<HTMLTextAreaElement>('textbox', { name: 'Copy these details' });
    expect(field.value.split('\n')[0]).toBe('About this chart');
    expect(within(section).getByRole('button', { name: 'Copy details' })).toBeTruthy();
  });

  it('says "Copied" until three seconds after the latest copy, then what the button does again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Frames on the faked clock too, so that every update happens inside act().
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(callback, 0));
    try {
      const { section } = renderAbout();
      const button = within(section).getByRole('button', { name: 'Copy details' });
      const region = within(section).getByRole('status');
      const pass = (milliseconds: number) => act(() => vi.advanceTimersByTimeAsync(milliseconds));

      fireEvent.click(button);
      await pass(0);
      expect([button.textContent, region.textContent]).toEqual(['Copied', 'Details copied']);

      await pass(2000);
      fireEvent.click(button);
      await pass(COPIED_MS - 2000);
      // The first copy's time is up, the second's not yet.
      expect(button.textContent).toBe('Copied');

      await pass(1999);
      expect(button.textContent).toBe('Copied');
      await pass(1);
      expect([button.textContent, region.textContent]).toEqual(['Copy details', '']);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
