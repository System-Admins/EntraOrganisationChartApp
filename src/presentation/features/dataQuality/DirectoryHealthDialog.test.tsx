// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EmployeePhotos } from '@/application/abstractions/employeePhotos';
import { ServiceError } from '@/application/abstractions/serviceError';
import type { Request, Sender } from '@/application/common/mediator';
import { OrgChartProvider } from '@/application/common/orgChartProvider';
import { CopyTextCommand } from '@/application/features/clipboard/copyText';
import { CheckPhotosCommand, CheckPhotosHandler } from '@/application/features/dataQuality/checkPhotos';
import { ExportIssuesCommand } from '@/application/features/dataQuality/exportIssues';
import { GetDirectoryHealthHandler, GetDirectoryHealthQuery } from '@/application/features/dataQuality/getDirectoryHealth';
import { PhotoAnswers } from '@/application/features/dataQuality/photoAnswers';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { HideRules } from '@/domain/orgChart/hideRules';
import type { OrgChart, OrgChartOptions } from '@/domain/orgChart/orgChart';
import { installDialogMethods } from '@/testing/dialog';
import { directoryOf } from '@/testing/directory';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { describeError } from '../../shared/errors';
import { MediatorProvider } from '../../shared/mediatorContext';
import { DirectoryHealthDialog } from './DirectoryHealthDialog';

beforeAll(installDialogMethods);

afterEach(cleanup);

/** The rules config.json starts from when it sets none. */
const DEFAULT_RULES: HideRules = {
  ...SHOW_EVERYONE,
  withoutManager: true,
  withHiddenManager: true,
  inManagerCycle: true,
  disabledAccounts: true,
  guests: true,
  unlicensed: true,
  hiddenFromAddressList: true,
};

const OPTIONS: OrgChartOptions = { topPersons: ['ceo'], hide: DEFAULT_RULES };

const complete = (id: string, managerId: string | null, overrides: Partial<Employee> = {}) =>
  makeEmployee(id, managerId, { officeLocation: 'Oslo HQ', businessPhone: '+47 22 00 00 00', ...overrides });

/** Four people checked: the CEO, the analyst of a disabled director, someone without a manager and a developer without e-mail. */
const COMPANY = [
  complete('ceo', null, { displayName: 'Chief' }),
  complete('former', 'ceo', { displayName: 'Former Director', accountEnabled: false }),
  complete('analyst', 'former', { displayName: 'Ana Lyst', officeLocation: null }),
  complete('stray', null, { displayName: 'Stray Person', officeLocation: null }),
  complete('dev', 'ceo', { displayName: 'Dev', mail: null }),
];

/** A photo source whose check the test answers, makes progress on or fails. */
function controlledPhotos() {
  const calls: { readonly ids: readonly string[]; readonly signal: AbortSignal | undefined }[] = [];
  let settle: { resolve: (answers: ReadonlyMap<string, boolean>) => void; reject: (error: Error) => void } | undefined;
  let progress: ((count: number) => void) | undefined;
  const photos: EmployeePhotos = {
    forget: () => Promise.resolve(),
    getPhotoUrl: () => Promise.resolve(null),
    havePhotos: (ids, onProgress, signal) =>
      new Promise((resolve, reject) => {
        calls.push({ ids, signal });
        settle = { resolve, reject };
        progress = onProgress;
      }),
  };
  return {
    photos,
    calls,
    progress: (count: number) => {
      act(() => {
        progress?.(count);
      });
    },
    answer: async (answers: ReadonlyMap<string, boolean>) => {
      await act(async () => {
        settle?.resolve(answers);
        await Promise.resolve();
      });
    },
    fail: async (error: Error) => {
      await act(async () => {
        settle?.reject(error);
        await Promise.resolve();
      });
    },
  };
}

interface Setup {
  readonly photos?: EmployeePhotos;
  /** Kept between openings, as the composition root keeps them for the page's session. */
  readonly answers?: PhotoAnswers;
  /** What the clipboard answers. */
  readonly copies?: boolean;
  readonly exportFailure?: Error;
  readonly healthFailure?: Error;
  /** The directory; COMPANY without it. */
  readonly employees?: readonly Employee[];
}

/** A page with the button that opens the report, as Settings has it; Show in chart closes it, as the page does. */
function Page({ chart, onShowInChart }: { chart: OrgChart; onShowInChart: (person: Employee) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Directory health
      </button>
      <DirectoryHealthDialog
        open={open}
        options={OPTIONS}
        chart={chart}
        onClose={() => {
          setOpen(false);
        }}
        onShowInChart={(person) => {
          setOpen(false);
          onShowInChart(person);
        }}
      />
    </>
  );
}

function renderReport({
  photos = controlledPhotos().photos,
  answers = new PhotoAnswers(),
  copies = true,
  exportFailure,
  healthFailure,
  employees = COMPANY,
}: Setup = {}) {
  const snapshot = { employees, loadedAt: new Date(2026, 8, 30, 9, 5) };
  const provider = new OrgChartProvider(directoryOf(() => snapshot));
  const health = new GetDirectoryHealthHandler(provider, answers);
  const check = new CheckPhotosHandler(photos, answers);
  const sent: Request<unknown>[] = [];
  let healthFails = healthFailure;
  // What the report's answers wait for, which holdHealth holds back.
  let healthHeld: Promise<void> = Promise.resolve();
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      if (request instanceof GetDirectoryHealthQuery) {
        return healthHeld.then(async () => {
          if (healthFails) throw healthFails;
          return health.handle(request);
        }) as Promise<T>;
      }
      if (request instanceof CheckPhotosCommand) return check.handle(request) as Promise<T>;
      if (request instanceof CopyTextCommand) return Promise.resolve(copies as T);
      if (request instanceof ExportIssuesCommand) return (exportFailure ? Promise.reject(exportFailure) : Promise.resolve()) as Promise<T>;
      return Promise.resolve(undefined as T);
    },
  };
  const onShowInChart = vi.fn<(person: Employee) => void>();
  const chart = buildOrgChart(employees, OPTIONS);
  const view = render(
    <MediatorProvider mediator={mediator}>
      <Page chart={chart} onShowInChart={onShowInChart} />
    </MediatorProvider>,
  );
  const opener = screen.getByRole('button', { name: 'Directory health' });
  const open = async () => {
    act(() => {
      opener.focus();
    });
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Directory health' });
    await within(dialog).findByText(/checked, in the directory/);
    return dialog;
  };
  const rerenderWith = (next: OrgChart) => {
    view.rerender(
      <MediatorProvider mediator={mediator}>
        <Page chart={next} onShowInChart={onShowInChart} />
      </MediatorProvider>,
    );
  };
  return {
    sent,
    opener,
    open,
    onShowInChart,
    rerenderWith,
    healThen: () => {
      healthFails = undefined;
    },
    /** Holds the report's answers, the failure included, until the function it returns is called. */
    holdHealth: () => {
      let release = (): void => undefined;
      healthHeld = new Promise((resolve) => {
        release = () => {
          resolve();
        };
      });
      return () => {
        healthHeld = Promise.resolve();
        release();
      };
    },
  };
}

const frame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });

/** The report's own live region, the first in the dialog, before any list's. */
const reportRegion = (dialog: HTMLElement) => within(dialog).getAllByRole('status')[0] as HTMLElement;
/** The issues' headings as screen readers say them: one phrase each, as the visible label and count are hidden from them. */
const headingsIn = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.querySelector('.visually-hidden')?.textContent);
const toggle = (dialog: HTMLElement, name: RegExp) => within(dialog).getByRole('button', { name });
/** What an element's description says, from every element it names. */
const described = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');

describe('DirectoryHealthDialog', () => {
  it('opens as a wide modal dialog named after the report, with the focus inside, and closes back to the button that opened it', async () => {
    const { open, opener } = renderReport();

    const dialog = await open();

    expect(dialog.className).toMatch(/wide/);
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close directory health' }));
    expect((dialog as HTMLDialogElement).open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('says how many people it checked and when the directory was read, and heads each issue with its count', async () => {
    const dialog = await renderReport().open();

    expect(within(dialog).getByText('4 people checked, in the directory as it was read at 2026-09-30 09:05.')).toBeTruthy();
    expect(headingsIn(dialog)).toEqual([
      'No manager set, 1 person',
      'Manager disabled or missing, 1 person',
      'Disabled account with direct reports, 1 person',
      'Circular manager chain, 0 people',
      'No job title, 0 people',
      'No department, 0 people',
      'No office, 2 people',
      'No e-mail, 1 person',
      'No phone, 0 people',
      'No photo, Not checked',
      'Department spelled differently, 0 people',
      'Department inside itself, 0 people',
      'Department in more than one place, 0 people',
    ]);
    // An issue that nobody has has nothing to show.
    expect(within(dialog).queryByRole('button', { name: /^Circular manager chain/ })).toBeNull();
  });

  it('says where a department inside itself is, and where most of a department in more than one place is', async () => {
    const departments = [
      complete('ceo', null, { displayName: 'Chief', department: 'Management' }),
      complete('head', 'ceo', { displayName: 'Head', department: 'Strategy' }),
      complete('aide', 'head', { displayName: 'Aide', department: 'Management' }),
      complete('lead', 'head', { displayName: 'Lead', department: 'Sales' }),
      complete('rep', 'lead', { displayName: 'Rep', department: 'Sales' }),
      complete('seller', 'ceo', { displayName: 'Seller', department: 'Sales' }),
    ];
    const dialog = await renderReport({ employees: departments }).open();

    fireEvent.click(toggle(dialog, /^Department inside itself/));
    fireEvent.click(toggle(dialog, /^Department in more than one place/));

    expect(within(dialog).getByText('In Management > Strategy > Management')).toBeTruthy();
    expect(within(dialog).getByText('Under Management; most of it, 2 people, under Strategy')).toBeTruthy();
  });

  it('shows an issue\'s people under its heading, each with what it is about for them, and shows a person in the chart on a press', async () => {
    const { open, onShowInChart } = renderReport();
    const dialog = await open();
    const button = toggle(dialog, /^Manager disabled or missing/);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    const people = document.getElementById(button.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(people.textContent).toContain('The manager the directory names for these people is a disabled account, or no user has that ID.');
    const row = within(people).getByRole('button', { name: 'Ana Lyst' });
    expect(described(row)).toBe('Manager: Former Director, a disabled account Show in chart');
    fireEvent.click(row);
    expect(onShowInChart).toHaveBeenCalledExactlyOnceWith(COMPANY[2]);
    expect((dialog as HTMLDialogElement).open).toBe(false);
  });

  it('names no manager the address list hides while its filter is on, nor copies their address, and says what is wrong all the same', async () => {
    const employees = [
      ...COMPANY.map((employee) => (employee.id === 'former' ? { ...employee, hiddenFromAddressList: true } : employee)),
      complete('auditHead', 'ceo', { displayName: 'Hanne Hidden', hiddenFromAddressList: true }),
      complete('auditor', 'auditHead', { displayName: 'Ida Auditor', mail: null }),
    ];
    const { open, sent } = renderReport({ employees });
    const dialog = await open();

    fireEvent.click(toggle(dialog, /^Manager disabled or missing/));
    expect(described(within(dialog).getByRole('button', { name: 'Ana Lyst' }))).toBe(
      'Manager: not in the address list, a disabled account Show in chart',
    );
    // Nobody to list under it: its heading has no button to open a list.
    expect(within(dialog).queryByRole('button', { name: /^Disabled account with direct reports/ })).toBeNull();
    // The developer's manager is named, the auditor's is not.
    fireEvent.click(toggle(dialog, /^No e-mail/));
    fireEvent.click(within(dialog).getByRole('button', { name: "Copy their managers' addresses" }));
    await waitFor(() => {
      expect(sent.filter((request) => request instanceof CopyTextCommand).map(({ text }) => text)).toEqual(['ceo@contoso.com']);
    });
    expect(dialog.textContent).not.toMatch(/Hanne|Former Director/);
  });

  it('copies the people\'s addresses and their managers\', leaving out disabled accounts, and says so after every copy', async () => {
    const { open, sent } = renderReport();
    const dialog = await open();
    const copied = () => sent.filter((request) => request instanceof CopyTextCommand).map(({ text }) => text);

    fireEvent.click(toggle(dialog, /^No office/));
    const copy = within(dialog).getByRole('button', { name: 'Copy e-mail addresses' });
    const region = within(copy.parentElement as HTMLElement).getByRole('status');
    expect(described(copy)).toBe(
      'The addresses leave out disabled accounts, and are separated by semicolons, ready to paste into a message.',
    );
    // Ana Lyst's manager is a disabled account, and the person without a manager has none.
    expect(within(dialog).queryByRole('button', { name: "Copy their managers' addresses" })).toBeNull();
    fireEvent.click(copy);
    await waitFor(() => {
      expect(copy.textContent).toBe('Copied');
    });
    expect(copied()).toEqual(['analyst@contoso.com; stray@contoso.com']);
    await frame();
    expect(region.textContent).toBe('E-mail addresses copied');

    // Without an address of their own, the developer is reached through their manager.
    fireEvent.click(toggle(dialog, /^No e-mail/));
    fireEvent.click(within(dialog).getByRole('button', { name: "Copy their managers' addresses" }));
    await waitFor(() => {
      expect(copied()).toEqual(['analyst@contoso.com; stray@contoso.com', 'ceo@contoso.com']);
    });
  });

  it('shows the addresses to copy by hand where nothing could copy them', async () => {
    const dialog = await renderReport({ copies: false }).open();
    fireEvent.click(toggle(dialog, /^No office/));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy e-mail addresses' }));

    const field = await within(dialog).findByRole<HTMLTextAreaElement>('textbox', { name: 'Copy these addresses' });
    expect(field.value).toBe('analyst@contoso.com; stray@contoso.com');
    expect(field.readOnly).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it('exports an issue\'s list with its people as the report has them, and says so', async () => {
    const { open, sent } = renderReport();
    const dialog = await open();
    fireEvent.click(toggle(dialog, /^No office/));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Export this list' }));

    const exported = sent.find((request) => request instanceof ExportIssuesCommand);
    expect(exported?.issue).toBe('officeLocation');
    expect(exported?.people.map(({ employee }) => employee.displayName)).toEqual(['Ana Lyst', 'Stray Person']);
    expect(exported?.loadedAt).toEqual(new Date(2026, 8, 30, 9, 5));
    expect(exported?.language).toBe('en');
    await waitFor(() => {
      expect(reportRegion(dialog).textContent).toBe('The list "No office" is exported.');
    });
  });

  it('says why an export failed, beside the list and to screen readers', async () => {
    const failure = new ServiceError('other', 'The browser refused the download.');
    const dialog = await renderReport({ exportFailure: failure }).open();
    fireEvent.click(toggle(dialog, /^No office/));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Export this list' }));

    const words = `Export failed: ${describeError(failure, 'en')}`;
    expect(await within(dialog).findByText(words)).toBeTruthy();
    await waitFor(() => {
      expect(reportRegion(dialog).textContent).toBe(words);
    });
  });

  it('checks the photos on request, with its progress, and Cancel on the same button, which keeps the focus', async () => {
    const photos = controlledPhotos();
    const { open, sent } = renderReport({ photos: photos.photos });
    const dialog = await open();
    expect(within(dialog).getByText(/^Checking asks Microsoft 365 about each person/)).toBeTruthy();
    const button = within(dialog).getByRole('button', { name: 'Check photos' });
    act(() => {
      button.focus();
    });

    fireEvent.click(button);
    photos.progress(2);

    expect(within(dialog).getByText('Checking photos: 2 of 4 people')).toBeTruthy();
    expect(button.textContent).toBe('Cancel');
    expect(sent.find((request) => request instanceof CheckPhotosCommand)?.employeeIds).toHaveLength(4);
    await waitFor(() => {
      expect(reportRegion(dialog).textContent).toBe('Checking photos...');
    });

    fireEvent.click(button);
    expect(photos.calls[0]?.signal?.aborted).toBe(true);
    await photos.answer(new Map([['ceo', true], ['dev', false]]));

    expect(await within(dialog).findByText('Cancelled with 2 of 4 people checked.')).toBeTruthy();
    expect(button.textContent).toBe('Check the rest');
    expect(document.activeElement).toBe(button);
    await waitFor(() => {
      expect(headingsIn(dialog)).toContain('No photo, 1 person');
      expect(reportRegion(dialog).textContent).toBe('Photo check cancelled.');
    });

    // The rest only: the answers found before the cancel are kept.
    fireEvent.click(button);
    expect(photos.calls[1]?.ids).toEqual(['analyst', 'stray']);
  });

  it('lists the people without a photo once checked, and says how many could not be checked', async () => {
    const photos = controlledPhotos();
    const dialog = await renderReport({ photos: photos.photos }).open();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Check photos' }));
    await photos.answer(new Map([['ceo', true], ['dev', false], ['stray', false]]));

    await waitFor(() => {
      expect(headingsIn(dialog)).toContain('No photo, 2 people');
    });
    expect(within(dialog).getByText('Could not check 1 person. Try again later.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Check again' })).toBeTruthy();
    await waitFor(() => {
      expect(reportRegion(dialog).textContent).toBe('Photos checked: 2 people without a photo. Could not check 1 person.');
    });
    fireEvent.click(toggle(dialog, /^No photo/));
    expect(within(dialog).getByRole('list', { name: 'No photo' }).textContent).toContain('Stray Person');
  });

  it('says why the photos could not be checked, with Try again on the same button', async () => {
    const photos = controlledPhotos();
    const dialog = await renderReport({ photos: photos.photos }).open();
    const button = within(dialog).getByRole('button', { name: 'Check photos' });

    fireEvent.click(button);
    const failure = new ServiceError('offline', 'Microsoft Graph could not be reached.');
    await photos.fail(failure);

    const words = `The photos could not be checked: ${describeError(failure, 'en')}`;
    expect(await within(dialog).findByText(words)).toBeTruthy();
    expect(button.textContent).toBe('Try again');
    await waitFor(() => {
      expect(reportRegion(dialog).textContent).toBe(words);
    });
  });

  it('stays failed where the photo source still reports progress after its failure, and tells it to stop', async () => {
    const photos = controlledPhotos();
    const dialog = await renderReport({ photos: photos.photos }).open();
    const button = within(dialog).getByRole('button', { name: 'Check photos' });
    fireEvent.click(button);
    photos.progress(1);
    const failure = new ServiceError('busy', 'Microsoft Graph request failed (500).');
    await photos.fail(failure);
    const words = `The photos could not be checked: ${describeError(failure, 'en')}`;
    await within(dialog).findByText(words);

    // As a batch that was under way when another failed answers late.
    photos.progress(3);

    expect(button.textContent).toBe('Try again');
    expect(within(dialog).getByText(words)).toBeTruthy();
    expect(within(dialog).queryByText(/^Checking photos:/)).toBeNull();
    expect(photos.calls[0]?.signal?.aborted).toBe(true);
  });

  it('hands the focus to the No photo heading as its button goes, once everyone has an answer', async () => {
    const photos = controlledPhotos();
    const dialog = await renderReport({ photos: photos.photos }).open();
    const button = within(dialog).getByRole('button', { name: 'Check photos' });
    act(() => {
      button.focus();
    });

    fireEvent.click(button);
    await photos.answer(new Map([['ceo', true], ['analyst', true], ['stray', true], ['dev', false]]));

    const heading = await within(dialog).findByRole('heading', { level: 3, name: 'No photo, 1 person' });
    expect(document.activeElement).toBe(heading);
    expect(within(dialog).queryByRole('button', { name: /^Check/ })).toBeNull();
    await waitFor(() => {
      expect(reportRegion(dialog).textContent).toBe('Photos checked: 1 person without a photo.');
    });
    // The people come with the report asked again, under the heading that has the focus.
    expect(await within(heading).findByRole('button', { name: 'No photo, 1 person' })).toBeTruthy();
  });

  it('keeps the photo check\'s answers for the session, which the report shows again without asking', async () => {
    const photos = controlledPhotos();
    const answers = new PhotoAnswers();
    const { open } = renderReport({ photos: photos.photos, answers });
    const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check photos' }));
    await photos.answer(new Map([['ceo', true], ['analyst', true], ['stray', false], ['dev', false]]));
    await waitFor(() => {
      expect(headingsIn(dialog)).toContain('No photo, 2 people');
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close directory health' }));

    const again = await open();

    expect(headingsIn(again)).toContain('No photo, 2 people');
    expect(within(again).queryByRole('button', { name: 'Check photos' })).toBeNull();
    expect(photos.calls).toHaveLength(1);
  });

  it('stops a check under way as the report closes, keeping what it found', async () => {
    const photos = controlledPhotos();
    const dialog = await renderReport({ photos: photos.photos }).open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Check photos' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close directory health' }));

    expect(photos.calls[0]?.signal?.aborted).toBe(true);
  });

  it('checks the directory again for a new chart, as after a refresh', async () => {
    const { open, sent, rerenderWith } = renderReport();
    await open();
    const asked = () => sent.filter((request) => request instanceof GetDirectoryHealthQuery).length;
    expect(asked()).toBe(1);

    rerenderWith(buildOrgChart(COMPANY, OPTIONS));

    await waitFor(() => {
      expect(asked()).toBe(2);
    });
  });

  it('says why the directory could not be checked, with Try again', async () => {
    const failure = new ServiceError('busy', 'Microsoft Graph request failed (503).');
    const { opener, healThen } = renderReport({ healthFailure: failure });
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Directory health' });

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain(`The directory could not be checked. ${describeError(failure, 'en')}`);
    expect(alert.textContent).toContain('Technical details: Microsoft Graph request failed (503).');
    healThen();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await within(dialog).findByText(/^4 people checked/)).toBeTruthy();
  });

  it('keeps Try again, unavailable, with the focus while it asks again, and hands the focus to the report as it comes', async () => {
    const failure = new ServiceError('busy', 'Microsoft Graph request failed (503).');
    const { opener, sent, healThen, holdHealth } = renderReport({ healthFailure: failure });
    const asked = () => sent.filter((request) => request instanceof GetDirectoryHealthQuery).length;
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Directory health' });
    const alert = await within(dialog).findByRole('alert');
    const tryAgain = within(alert).getByRole('button', { name: 'Try again' });
    act(() => {
      tryAgain.focus();
    });

    const release = holdHealth();
    fireEvent.click(tryAgain);

    expect(document.activeElement).toBe(tryAgain);
    expect(tryAgain.getAttribute('aria-disabled')).toBe('true');
    expect(alert.textContent).toContain('Checking the directory...');
    fireEvent.click(tryAgain);
    expect(asked()).toBe(2);

    // Failed again, the alert says so once more, and the button takes another press.
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(alert.textContent).toContain(`The directory could not be checked. ${describeError(failure, 'en')}`);
    });
    expect(tryAgain.getAttribute('aria-disabled')).toBeNull();
    expect(document.activeElement).toBe(tryAgain);

    healThen();
    fireEvent.click(tryAgain);

    const summary = await within(dialog).findByText(/^4 people checked/);
    expect(document.activeElement).toBe(summary);
  });
});
