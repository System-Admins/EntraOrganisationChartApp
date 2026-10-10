// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SignedInUser } from '@/application/abstractions/signedInUser';
import type { Request, Sender } from '@/application/common/mediator';
import { CopyTextCommand } from '@/application/features/clipboard/copyText';
import type { FilterEffects } from '@/application/features/orgChart/getFilterEffects';
import { LANGUAGES } from '@/application/settings/language';
import type { UserSettings } from '@/application/settings/userSettings';
import type { HideRules } from '@/domain/orgChart/hideRules';
import { installDialogMethods } from '@/testing/dialog';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { DialogSection } from '../../shared/DialogSection';
import { MediatorProvider } from '../../shared/mediatorContext';
import { AccountSettings } from './AccountSettings';
import { DisplaySettings } from './DisplaySettings';
import { EmbedSettings } from './EmbedSettings';
import { FilterSettings } from './FilterSettings';
import { ReportsSettings } from './ReportsSettings';
import { SettingsDialog } from './SettingsDialog';
import { DISPLAY_STRINGS } from './strings';

beforeAll(installDialogMethods);

afterEach(cleanup);

/** A page with the button that opens the dialog, as the toolbar has it. */
function Page({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Settings
      </button>
      <SettingsDialog
        open={open}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
      >
        <DialogSection title="Sound">
          <p>Some text to select</p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </button>
        </DialogSection>
      </SettingsDialog>
    </>
  );
}

function openDialog() {
  const onClose = vi.fn();
  render(<Page onClose={onClose} />);
  const opener = screen.getByRole('button', { name: 'Settings' });
  act(() => {
    opener.focus();
  });
  fireEvent.click(opener);
  return { opener, onClose, dialog: screen.getByRole<HTMLDialogElement>('dialog', { name: 'Settings' }) };
}

const described = (element: HTMLElement) => document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;

describe('SettingsDialog', () => {
  it('holds nothing until it is opened, then shows its sections under their headings with the focus inside', () => {
    render(<Page onClose={vi.fn()} />);
    expect(document.querySelector('dialog')?.childElementCount).toBe(0);
    cleanup();

    const { dialog } = openDialog();

    expect(dialog.open).toBe(true);
    expect(within(dialog).getByRole('region', { name: 'Sound' })).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close settings' }));
  });

  it('closes from its Close button and hands the focus back to the button that opened it', () => {
    const { opener, onClose, dialog } = openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }));

    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(opener);
    expect(dialog.childElementCount).toBe(0);
  });

  it('hands the focus back as well when its owner closes it', () => {
    const { opener, dialog } = openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('closes on a click beside it, but not when a press inside it ends there', () => {
    const { onClose, dialog } = openDialog();

    fireEvent.mouseDown(screen.getByText('Some text to select'));
    fireEvent.click(dialog);
    expect(dialog.open).toBe(true);

    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ends with who developed the chart, as a link to their site in a new tab that says so before the press', () => {
    const { dialog } = openDialog();
    const link = within(dialog).getByRole('link', { name: 'System Admins' });
    const line = link.closest('p');

    expect(link.getAttribute('href')).toBe('https://www.systemadmins.com/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(described(link)).toBe('(opens in a new tab)');
    expect(line?.textContent).toContain('Developed by System Admins');
    // After every section, whatever the page puts in the dialog.
    expect(dialog.lastElementChild?.lastElementChild).toBe(line);
    expect(within(dialog).getByRole('region', { name: 'Sound' }).compareDocumentPosition(link)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

describe('FilterSettings', () => {
  const defaults: HideRules = { ...SHOW_EVERYONE, guests: true, withoutManager: true };

  function renderFilters(hide: HideRules = defaults, hasTopPersons = true, peopleCount: number | null = 12) {
    const onChange = vi.fn<(hide: HideRules) => void>();
    render(
      <FilterSettings hide={hide} defaults={defaults} hasTopPersons={hasTopPersons} peopleCount={peopleCount} onChange={onChange} />,
    );
    const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });
    return { onChange, box, reset: screen.getByRole('button', { name: 'Reset filters' }) };
  }
  /** The count on screen, beside the live region that says it. */
  const shownCount = () => screen.getByText(/in the chart$/, { selector: 'p:not([role])' });

  it('ticks the people who are shown, in one group, and says how many people that leaves', () => {
    const { box } = renderFilters();
    const filters = within(screen.getByRole('region', { name: 'Filters' }));

    expect(within(filters.getByRole('group', { name: 'Show in the chart' })).getAllByRole('checkbox')).toHaveLength(9);
    expect(box('Guests').checked).toBe(false);
    expect(box('People without a manager').checked).toBe(false);
    expect(box('Disabled accounts').checked).toBe(true);
    expect(box('People hidden from the address list').checked).toBe(true);
    expect(shownCount().textContent).toBe('12 people in the chart');
    // Nothing to say as the dialog opens: screen readers read the count on screen.
    expect(shownCount().getAttribute('aria-hidden')).toBeNull();
    expect(filters.getByRole('status').textContent).toBe('');
  });

  it('says the count a change leads to', () => {
    const filters = (peopleCount: number) => (
      <FilterSettings hide={defaults} defaults={defaults} hasTopPersons peopleCount={peopleCount} onChange={vi.fn()} />
    );
    const { rerender } = render(filters(12));
    const region = screen.getByRole('status');

    rerender(filters(13));
    expect(region.textContent).toBe('13 people in the chart');
    // Read once: the line on screen is left to the region while both say the same.
    expect(shownCount().getAttribute('aria-hidden')).toBe('true');

    rerender(filters(12));
    expect(region.textContent).toBe('12 people in the chart');
    expect(screen.getByRole('status')).toBe(region);
  });

  it('switches one rule and keeps the others', () => {
    const { onChange, box } = renderFilters();

    fireEvent.click(box('Guests'));
    expect(onChange).toHaveBeenLastCalledWith({ ...defaults, guests: false });

    fireEvent.click(box('Disabled accounts'));
    expect(onChange).toHaveBeenLastCalledWith({ ...defaults, disabledAccounts: true });
  });

  it('leaves out the rule about the top persons\' teams where the chart names no top persons', () => {
    renderFilters(defaults, false);

    expect(screen.queryByRole('checkbox', { name: "People outside the top persons' teams" })).toBeNull();
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
  });

  it('resets to config.json\'s rules, with a button that keeps the focus while there is nothing to reset', () => {
    const unchanged = renderFilters();
    expect(unchanged.reset.getAttribute('aria-disabled')).toBe('true');
    expect(unchanged.reset.hasAttribute('disabled')).toBe(false);
    fireEvent.click(unchanged.reset);
    expect(unchanged.onChange).not.toHaveBeenCalled();
    cleanup();

    const changed = renderFilters({ ...defaults, guests: false });
    expect(changed.reset.getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(changed.reset);
    expect(changed.onChange).toHaveBeenCalledExactlyOnceWith(defaults);
  });

  it('says nothing about the count while there is no chart', () => {
    renderFilters(defaults, true, null);

    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByText(/in the chart$/, { selector: 'p' })).toBeNull();
  });

  /** What GetFilterEffectsQuery could answer: how many people each rule leaves out while it is on. */
  const EFFECTS: FilterEffects = {
    withoutManager: 12,
    withHiddenManager: 54,
    inManagerCycle: 0,
    disabledAccounts: 3,
    guests: 1234,
    unlicensed: 5,
    withoutJobTitle: 1,
    hiddenFromAddressList: 2,
    unattached: 120,
  };

  it('adds to each checkbox how many people its rule hides, or shows while it is off, and what the numbers assume', () => {
    render(<FilterSettings hide={defaults} defaults={defaults} hasTopPersons peopleCount={12} effects={EFFECTS} onChange={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Show in the chart' });

    expect(within(group).getAllByRole<HTMLInputElement>('checkbox').map((box) => box.labels?.[0]?.textContent)).toEqual([
      'People without a manager, 12 hidden',
      'People whose manager is not shown, 54 shown',
      'People in a circular manager chain, 0 shown',
      'Disabled accounts, 3 shown',
      'Guests, 1,234 hidden',
      'Accounts without a license, 5 shown',
      'People without a job title, 1 shown',
      'People hidden from the address list, 2 shown',
      "People outside the top persons' teams, 120 shown",
    ]);
    expect(described(group)).toBe('Each number assumes that the other filters stay as they are.');
  });

  it('fills the numbers in without a word in the count\'s live region, and words them for each rule as it is now', () => {
    const filters = (hide: HideRules, effects?: FilterEffects) => (
      <FilterSettings hide={hide} defaults={defaults} hasTopPersons peopleCount={12} effects={effects} onChange={vi.fn()} />
    );
    const { rerender } = render(filters(defaults));
    const region = screen.getByRole('status');
    expect(screen.getByRole('checkbox', { name: 'Guests' })).toBeTruthy();
    expect(screen.getByRole('group').hasAttribute('aria-describedby')).toBe(false);

    rerender(filters(defaults, EFFECTS));
    expect(screen.getByRole('checkbox', { name: 'Guests, 1,234 hidden' })).toBeTruthy();
    expect(region.textContent).toBe('');

    // A rule's number is the same either way; only whether its people are hidden or shown changes.
    rerender(filters({ ...defaults, guests: false }, EFFECTS));
    expect(screen.getByRole('checkbox', { name: 'Guests, 1,234 shown' })).toBeTruthy();
  });
});

describe('DisplaySettings', () => {
  const SETTINGS: UserSettings = {
    hide: SHOW_EVERYONE,
    showLevels: true,
    language: 'auto',
    team: null,
    startAt: 'top',
    theme: 'auto',
    textSize: 'standard',
  };

  function renderDisplay(changes: Partial<UserSettings> = {}, themeFromTeams = false) {
    const settings = { ...SETTINGS, ...changes };
    const onChange = vi.fn<(settings: UserSettings) => void>();
    render(<DisplaySettings settings={settings} onChange={onChange} themeFromTeams={themeFromTeams} />);
    const display = within(screen.getByRole('region', { name: 'Display' }));
    return { settings, onChange, display };
  }
  const levels = () => screen.getByRole<HTMLInputElement>('checkbox', { name: "Show each person's level" });

  it('ticks the level while it is shown, and says what a level is and that the reporting line stays', () => {
    renderDisplay();
    const box = levels();

    expect(box.checked).toBe(true);
    expect(described(box)).toBe("The top of the chart is Level 1. A person's details keep the reporting line either way.");
  });

  it('hands over the other choice on a press, and leaves saying so to the checkbox', () => {
    const shown = renderDisplay();
    fireEvent.click(levels());
    expect(shown.onChange).toHaveBeenCalledExactlyOnceWith({ ...shown.settings, showLevels: false });
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();

    const hidden = renderDisplay({ showLevels: false });
    expect(levels().checked).toBe(false);
    fireEvent.click(levels());
    expect(hidden.onChange).toHaveBeenCalledExactlyOnceWith({ ...hidden.settings, showLevels: true });
  });

  it('offers no choice of language while the chart speaks only one', () => {
    const { display } = renderDisplay();

    // Once LANGUAGES has a second language the choice is back, and this test gives way to tests of it.
    expect(LANGUAGES).toHaveLength(1);
    expect(display.queryByRole('group', { name: 'Language' })).toBeNull();
    expect(display.queryByText(DISPLAY_STRINGS.en.languageHint)).toBeNull();
    expect(display.getByRole('group', { name: 'Theme' })).toBeTruthy();
    expect(display.getByRole('group', { name: 'Text size' })).toBeTruthy();
    expect(levels()).toBeTruthy();
    expect(display.getByRole('group', { name: 'When the chart opens' })).toBeTruthy();
  });

  it('offers where the chart opens, with the choice checked and what comes first either way explained', () => {
    const { display } = renderDisplay({ startAt: 'me' });

    const group = display.getByRole('group', { name: 'When the chart opens' });
    const choices = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(choices.map((choice) => choice.labels?.[0]?.textContent)).toEqual(['At the top', 'At my own card', 'Where I left off']);
    expect(choices.map((choice) => choice.checked)).toEqual([false, true, false]);
    expect(described(group)).toBe(
      'A chart you left less than 30 minutes ago opens where you were either way, and a link to a person opens on them.',
    );
  });

  it('words how long a chart reopens where it was left from the rule itself', () => {
    expect(DISPLAY_STRINGS.en.startHint(1)).toBe(
      'A chart you left less than 1 minute ago opens where you were either way, and a link to a person opens on them.',
    );
  });

  it('hands over where the chart opens with the other settings kept, and nothing for the choice already made', () => {
    const { settings, onChange, display } = renderDisplay();

    fireEvent.click(display.getByRole('radio', { name: 'At the top' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(display.getByRole('radio', { name: 'Where I left off' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, startAt: 'lastView' });
  });

  it('offers Automatic and each theme, with the one chosen checked and Automatic explained', () => {
    const { display } = renderDisplay({ theme: 'contrast' });

    const group = display.getByRole('group', { name: 'Theme' });
    const choices = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(choices.map((choice) => choice.labels?.[0]?.textContent)).toEqual(['Automatic', 'Light', 'Dark', 'High contrast']);
    expect(choices.map((choice) => choice.checked)).toEqual([false, false, false, true]);
    expect(described(group)).toBe(
      'Automatic follows the theme the chart is set up with, otherwise the light or dark setting of your system.',
    );
  });

  it('hands over the theme chosen with the other settings kept, and nothing for the one already chosen', () => {
    const { settings, onChange, display } = renderDisplay({ language: 'en', showLevels: false });
    const group = within(display.getByRole('group', { name: 'Theme' }));

    fireEvent.click(group.getByRole('radio', { name: 'Automatic' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(group.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, theme: 'dark' });
  });

  it('says in Teams that the theme follows Teams, in place of a choice Teams would overrule', () => {
    const { display } = renderDisplay({ theme: 'dark' }, true);

    expect(display.queryByRole('group', { name: 'Theme' })).toBeNull();
    expect(display.queryByRole('radio', { name: 'Dark' })).toBeNull();
    expect(display.getByText('The chart follows the theme you chose in Teams.')).toBeTruthy();
    // The text size is the chart's own in Teams too.
    expect(display.getByRole('group', { name: 'Text size' })).toBeTruthy();
  });

  it('offers three text sizes, with the one chosen checked, and says the cards widen and paper stays standard', () => {
    const { settings, onChange, display } = renderDisplay({ textSize: 'large' });

    const group = display.getByRole('group', { name: 'Text size' });
    const choices = within(group).getAllByRole<HTMLInputElement>('radio');
    expect(choices.map((choice) => choice.labels?.[0]?.textContent)).toEqual(['Standard', 'Large', 'Larger']);
    expect(choices.map((choice) => choice.checked)).toEqual([false, true, false]);
    expect(described(group)).toBe('Larger text makes the cards wider too. The chart always prints in the standard size.');

    fireEvent.click(within(group).getByRole('radio', { name: 'Large' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole('radio', { name: 'Larger' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...settings, textSize: 'larger' });
  });
});

describe('AccountSettings', () => {
  const anna: SignedInUser = { id: 'anna', displayName: 'Anna Jensen', userPrincipalName: 'anna@contoso.com', isGuest: false };
  /** The avatar asks for the photo. */
  const mediator: Sender = { send: <T,>() => Promise.resolve(undefined as T) };

  const MY_ACCOUNT = 'https://myaccount.microsoft.com/';
  const renderAccount = (props: Partial<Parameters<typeof AccountSettings>[0]> = {}) => {
    render(
      <MediatorProvider mediator={mediator}>
        <AccountSettings user={anna} changePhotoUrl={MY_ACCOUNT} {...props} />
      </MediatorProvider>,
    );
    return screen.getByRole('region', { name: 'Account' });
  };

  it('says who is signed in and offers what the toolbar\'s profile and Sign out do', () => {
    const onShow = vi.fn();
    const onSignOut = vi.fn();
    renderAccount({ onShow, onSignOut });
    const account = screen.getByRole('region', { name: 'Account' });

    expect(account.textContent).toContain('Anna Jensen');
    expect(account.textContent).toContain('anna@contoso.com');
    expect(within(account).getAllByRole('button').map((button) => button.textContent)).toEqual(['Show me in the chart', 'Sign out']);
    fireEvent.click(within(account).getByRole('button', { name: 'Show me in the chart' }));
    fireEvent.click(within(account).getByRole('button', { name: 'Sign out' }));

    expect(onShow).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('offers a manager their team beside their own card', () => {
    const onShowTeam = vi.fn();
    const account = renderAccount({ onShow: vi.fn(), onShowTeam, changePhotoUrl: null });

    expect(within(account).getAllByRole('button').map((button) => button.textContent)).toEqual(['Show me in the chart', 'Show my team']);
    fireEvent.click(within(account).getByRole('button', { name: 'Show my team' }));
    expect(onShowTeam).toHaveBeenCalledOnce();
  });

  it('still offers Sign out before the account is known, without a chart to show anyone in or a photo to change', () => {
    const account = renderAccount({ user: null, onSignOut: vi.fn() });

    expect(within(account).getAllByRole('button').map((button) => button.textContent)).toEqual(['Sign out']);
    expect(within(account).queryByRole('link')).toBeNull();
  });

  it('leads to Microsoft\'s account page for a new profile photo, in a new tab, and says so before the press', () => {
    const account = renderAccount();
    const link = within(account).getByRole('link', { name: 'Change profile photo' });

    expect(link.getAttribute('href')).toBe(MY_ACCOUNT);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    const hint = described(link);
    expect(hint).toContain('opens your Microsoft account page in a new tab');
    expect(hint).toContain('Select your photo there');
    // Where the host page owns the sign-in, there is nothing to sign out of here.
    expect(within(account).queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('only says that another page opens in a new tab, which it cannot describe', () => {
    const account = renderAccount({ changePhotoUrl: 'https://intranet.contoso.com/photo' });
    const link = within(account).getByRole('link', { name: 'Change profile photo' });

    expect(link.getAttribute('href')).toBe('https://intranet.contoso.com/photo');
    expect(described(link)).toBe('Change profile photo opens in a new tab.');
  });

  it('has no photo link where config.json offers none', () => {
    const account = renderAccount({ changePhotoUrl: null });

    expect(within(account).queryByRole('link')).toBeNull();
    expect(account.textContent).not.toContain('new tab');
  });

  it('offers to forget this browser\'s copy where the host page owns the sign-in, and says what that does before the press', () => {
    const onForget = vi.fn();
    const account = renderAccount({ user: null, changePhotoUrl: null, onForget });
    const forget = within(account).getByRole('button', { name: "Forget this browser's copy" });

    expect(described(forget)).toBe(
      'Deletes what the chart keeps in this browser, such as its copy of the directory, then reloads the chart. Meant for shared computers.',
    );
    expect(within(account).getAllByRole('button')).toEqual([forget]);
    fireEvent.click(forget);
    expect(onForget).toHaveBeenCalledOnce();
    cleanup();

    // Each hint belongs to its own control.
    renderAccount({ onForget });
    expect(described(screen.getByRole('button', { name: "Forget this browser's copy" }))).toContain('Meant for shared computers.');
    expect(described(screen.getByRole('link', { name: 'Change profile photo' }))).toContain('Microsoft account page');
  });
});

describe('EmbedSettings', () => {
  const ADDRESS = 'https://chart.contoso.com/?team=lead@contoso.com';

  interface EmbedSetup {
    readonly address?: string;
    readonly title?: string;
    /** What the clipboard answers. */
    readonly copies?: boolean;
  }

  function renderEmbed({ address = ADDRESS, title = 'Organization chart', copies = true }: EmbedSetup = {}) {
    const copied: string[] = [];
    const mediator: Sender = {
      send: <T,>(request: Request<T>) => {
        if (request instanceof CopyTextCommand) copied.push(request.text);
        return Promise.resolve(copies as T);
      },
    };
    render(
      <MediatorProvider mediator={mediator}>
        <EmbedSettings address={address} title={title} />
      </MediatorProvider>,
    );
    const section = within(screen.getByRole('region', { name: 'Embed this chart' }));
    return { copied, section, code: section.getByRole<HTMLTextAreaElement>('textbox', { name: 'Embed code' }) };
  }
  /** The frame as the page the code is pasted into reads it. */
  const frameIn = (code: string) => new DOMParser().parseFromString(code, 'text/html').querySelector('iframe');
  const frame = () =>
    act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

  it('offers code for the web parts of a SharePoint page, with the chart\'s title naming the frame, and says what it shows', () => {
    const { section, code } = renderEmbed();

    expect(code.value).toBe(
      '<iframe src="https://chart.contoso.com/?team=lead@contoso.com" title="Organization chart" ' +
        'width="100%" height="800" style="border:0"></iframe>',
    );
    expect(code.readOnly).toBe(true);
    const hint =
      "Paste the code into a SharePoint page's Organization chart web part or Embed web part. It shows the people the chart shows now, " +
      "with the same team and filters, and nobody's details open.";
    expect(described(code)).toBe(hint);
    expect(described(section.getByRole('button', { name: 'Copy code' }))).toBe(hint);
  });

  it('escapes what would end an attribute or read as markup, so that the frame gets the address and the title as they are', () => {
    const address = 'https://chart.contoso.com/?top=ceo@contoso.com&show=guests';
    const title = 'R&D "chart" <beta>';
    const { code } = renderEmbed({ address, title });

    expect(code.value).toContain('src="https://chart.contoso.com/?top=ceo@contoso.com&amp;show=guests"');
    expect(code.value).toContain('title="R&amp;D &quot;chart&quot; &lt;beta&gt;"');
    expect(frameIn(code.value)?.getAttribute('src')).toBe(address);
    expect(frameIn(code.value)?.getAttribute('title')).toBe(title);
  });

  it('copies the code as shown, and says so', async () => {
    const { copied, section, code } = renderEmbed();
    const button = section.getByRole('button', { name: 'Copy code' });
    const region = section.getByRole('status');
    expect(region.textContent).toBe('');

    fireEvent.click(button);

    await waitFor(() => {
      expect(button.textContent).toBe('Copied');
    });
    expect(copied).toEqual([code.value]);
    await frame();
    expect(region.textContent).toBe('Code copied');
  });

  it('selects the code in its field, to copy by hand, where nothing could copy it', async () => {
    const { section, code } = renderEmbed({ copies: false });

    fireEvent.click(section.getByRole('button', { name: 'Copy code' }));

    await waitFor(() => {
      expect(document.activeElement).toBe(code);
    });
    expect([code.selectionStart, code.selectionEnd]).toEqual([0, code.value.length]);
    expect(section.getByRole('status').textContent).toBe('');
    expect(section.getByRole('button', { name: 'Copy code' }).textContent).toBe('Copy code');
  });
});

describe('ReportsSettings', () => {
  it('offers the directory health report as a dialog of its own, and says what it holds before the press', () => {
    const onShowDirectoryHealth = vi.fn();
    render(<ReportsSettings onShowDirectoryHealth={onShowDirectoryHealth} />);
    const reports = within(screen.getByRole('region', { name: 'Reports' }));
    const button = reports.getByRole('button', { name: 'Directory health' });

    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(described(button)).toBe(
      'Who is missing what in the directory: a manager, a job title, a department, an office, a phone, an e-mail address ' +
        'or a photo, with lists to copy addresses from and export.',
    );
    fireEvent.click(button);
    expect(onShowDirectoryHealth).toHaveBeenCalledOnce();
  });
});
