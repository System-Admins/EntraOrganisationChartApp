// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PeoplePicker, PickedPerson } from '@/application/abstractions/peoplePicker';
import type { TabSetup } from '@/application/settings/tabSetup';
import { TabConfigPage } from './TabConfigPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Every description of a control, in the order it names them. */
const described = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');

const NEW_TAB: TabSetup = { topPersons: [], depth: null };
const ANNA: PickedPerson = { id: 'id-anna', identifier: 'anna@contoso.com', displayName: 'Anna Lund' };
const ERIK: PickedPerson = { id: 'id-erik', identifier: 'erik@contoso.com', displayName: 'Erik Haugen' };

interface Setup {
  readonly initialSetup?: TabSetup;
  /** What Teams' picker answers each time it opens, in turn: the people chosen, null for a cancel, or a failure. No picker without it. */
  readonly picks?: (readonly PickedPerson[] | null | Error)[];
}

function renderPage({ initialSetup = NEW_TAB, picks }: Setup = {}) {
  const onSetupChange = vi.fn<(setup: TabSetup | null) => void>();
  const pick = vi.fn<PeoplePicker['pick']>(() => {
    const answer = picks?.shift() ?? null;
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
  render(
    <TabConfigPage
      title="Organization chart"
      initialSetup={initialSetup}
      defaultDepth={1}
      peoplePicker={picks ? { pick } : null}
      onSetupChange={onSetupChange}
    />,
  );
  /** What Teams would save if the person pressed Save now; null where Save is unavailable. */
  const saving = () => onSetupChange.mock.lastCall?.[0];
  return { pick, saving };
}

const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Top persons (optional)' });
const chosen = () => within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.firstElementChild?.textContent);
const choose = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Choose people' }));
};
/** The page's live region, which says what the tab shows after a pick or a removal. */
const status = () => screen.getByRole('status');

describe('TabConfigPage', () => {
  describe('where the host has no people picker, as Outlook and microsoft365.com have none', () => {
    it('names the tab being added and asks for its top persons, saying what they do', () => {
      renderPage();

      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Add Organization chart');
      expect(screen.getByText('The tab shows the whole organization.')).toBeTruthy();
      expect(field().value).toBe('');
      expect(field().placeholder).toBe('anna@contoso.com, erik@contoso.com');
      expect(described(field())).toBe(
        'To show a single department, enter the e-mail addresses of the people at its top, separated by commas. ' +
          'Only their teams are shown.',
      );
      expect(screen.queryByRole('button', { name: 'Choose people' })).toBeNull();
    });

    it('starts from the top persons the tab shows now, and reports every change, as Teams reads the setup on Save', () => {
      const { saving } = renderPage({ initialSetup: { topPersons: ['anna@contoso.com'], depth: 2 } });
      expect(field().value).toBe('anna@contoso.com');
      expect(saving()).toEqual({ topPersons: ['anna@contoso.com'], depth: 2 });

      fireEvent.change(field(), { target: { value: 'anna@contoso.com; erik@contoso.com,' } });

      expect(field().value).toBe('anna@contoso.com; erik@contoso.com,');
      expect(saving()).toEqual({ topPersons: ['anna@contoso.com', 'erik@contoso.com'], depth: 2 });
    });

    it('says that the tab shows the whole organization only while the field holds no top persons', () => {
      renderPage({ initialSetup: { topPersons: ['anna@contoso.com'], depth: null } });

      expect(screen.getByText('The tab shows only the teams of these people:')).toBeTruthy();
      expect(screen.queryByText('The tab shows the whole organization.')).toBeNull();

      fireEvent.change(field(), { target: { value: ' , ' } });
      expect(screen.getByText('The tab shows the whole organization.')).toBeTruthy();
      expect(screen.queryByText('The tab shows only the teams of these people:')).toBeNull();

      fireEvent.change(field(), { target: { value: 'erik@contoso.com' } });
      expect(screen.getByText('The tab shows only the teams of these people:')).toBeTruthy();
    });

    it('withholds Save while an entry names nobody, and says which once the person leaves the field', () => {
      const { saving } = renderPage();

      fireEvent.change(field(), { target: { value: 'anna@contoso.com, Erik Haugen' } });
      expect(saving()).toBeNull();
      // Not while the person may still be typing.
      expect(field().getAttribute('aria-invalid')).toBeNull();
      expect(screen.queryByText(/not an e-mail address/)).toBeNull();

      fireEvent.blur(field());
      expect(field().getAttribute('aria-invalid')).toBe('true');
      expect(described(field())).toContain('Erik Haugen is not an e-mail address.');

      fireEvent.change(field(), { target: { value: 'anna@contoso.com, Erik Haugen, Bo' } });
      expect(screen.getByText('Erik Haugen and Bo are not e-mail addresses.')).toBeTruthy();

      fireEvent.change(field(), { target: { value: 'anna@contoso.com, erik@contoso.com' } });
      expect(saving()).toEqual({ topPersons: ['anna@contoso.com', 'erik@contoso.com'], depth: null });
      expect(field().getAttribute('aria-invalid')).toBeNull();
      expect(screen.queryByText(/not an e-mail address/)).toBeNull();
    });
  });

  it('offers the levels unfolded at start, from config.json\'s default up to the chart\'s limit, and reports the choice', () => {
    const { saving } = renderPage({ initialSetup: { topPersons: [], depth: 3 } });
    const depth = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Levels unfolded at start' });

    expect(Array.from(depth.options, (option) => option.textContent)).toEqual([
      'Default (1)',
      ...Array.from({ length: 11 }, (_, levels) => String(levels)),
    ]);
    expect(depth.value).toBe('3');
    expect(described(depth)).toBe(
      'At 0 only the top of the chart shows. With several top persons it always starts folded, side by side.',
    );

    fireEvent.change(depth, { target: { value: '0' } });
    expect(saving()).toEqual({ topPersons: [], depth: 0 });
    fireEvent.change(depth, { target: { value: '' } });
    expect(saving()).toEqual({ topPersons: [], depth: null });
  });

  describe('with Teams\' people picker', () => {
    it('lists the people chosen in it, each with a Remove button, and reports them as the picker names them', async () => {
      const BO_ID = '00000000-0000-4000-8000-0000000000b0';
      const BO: PickedPerson = { id: BO_ID, identifier: BO_ID, displayName: 'Bo Ek' };
      const { pick, saving } = renderPage({ picks: [[ANNA, BO]] });
      expect(screen.getByText('The tab shows the whole organization.')).toBeTruthy();
      expect(described(screen.getByRole('button', { name: 'Choose people' }))).toBe(
        'To show a single department, choose the people at its top. Only their teams are shown.',
      );
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(status().textContent).toBe('');

      choose();

      const list = await screen.findByRole('list', { name: 'The tab shows only the teams of these people:' });
      expect(pick).toHaveBeenCalledExactlyOnceWith([]);
      expect(chosen()).toEqual(['Anna Lundanna@contoso.com', `Bo Ek${BO_ID}`]);
      expect(within(list).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
        'Remove Anna Lund',
        'Remove Bo Ek',
      ]);
      expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual(['Remove', 'Remove']);
      expect(saving()).toEqual({ topPersons: ['anna@contoso.com', BO_ID], depth: null });
      expect(status().textContent).toBe('The tab shows only the teams of Anna Lund and Bo Ek.');
    });

    it('opens with those it chose shown as chosen, takes its answer for them, and keeps the people a tab saved before named', async () => {
      const { pick, saving } = renderPage({ initialSetup: { topPersons: ['ceo@contoso.com'], depth: null }, picks: [[ANNA], [ERIK]] });
      expect(chosen()).toEqual(['ceo@contoso.com']);

      choose();
      await waitFor(() => {
        expect(chosen()).toEqual(['ceo@contoso.com', 'Anna Lundanna@contoso.com']);
      });
      // Anna is unticked in the picker, and Erik ticked.
      choose();

      await waitFor(() => {
        expect(chosen()).toEqual(['ceo@contoso.com', 'Erik Haugenerik@contoso.com']);
      });
      expect(pick.mock.calls).toEqual([[[]], [['id-anna']]]);
      expect(saving()).toEqual({ topPersons: ['ceo@contoso.com', 'erik@contoso.com'], depth: null });
    });

    it('names each person once, where a tab saved by hand repeated one, or the picker gives one by e-mail that it named by id', async () => {
      const { saving } = renderPage({
        initialSetup: { topPersons: ['anna@contoso.com', 'ANNA@contoso.com', 'id-erik'], depth: null },
        picks: [[ERIK]],
      });
      expect(chosen()).toEqual(['anna@contoso.com', 'id-erik']);

      choose();

      await waitFor(() => {
        expect(chosen()).toEqual(['anna@contoso.com', 'Erik Haugenerik@contoso.com']);
      });
      expect(saving()).toEqual({ topPersons: ['anna@contoso.com', 'erik@contoso.com'], depth: null });
    });

    it('changes nothing where the person cancelled the picker', async () => {
      const { pick, saving } = renderPage({ initialSetup: { topPersons: ['anna@contoso.com'], depth: null }, picks: [null] });

      choose();

      await waitFor(() => {
        expect(pick).toHaveBeenCalledOnce();
      });
      expect(chosen()).toEqual(['anna@contoso.com']);
      expect(saving()).toEqual({ topPersons: ['anna@contoso.com'], depth: null });
      expect(status().textContent).toBe('');
    });

    it('hands the focus to the next Remove button, else the previous one, else Choose people, and says what the tab shows', async () => {
      const BO: PickedPerson = { id: 'id-bo', identifier: 'bo@contoso.com', displayName: 'Bo Ek' };
      const { saving } = renderPage({ picks: [[ANNA, ERIK, BO]] });
      choose();
      await screen.findByRole('list');
      const remove = (name: string) => {
        fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
      };

      remove('Erik Haugen');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Bo Ek' }));
      expect(status().textContent).toBe('The tab shows only the teams of Anna Lund and Bo Ek.');

      remove('Bo Ek');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Anna Lund' }));

      remove('Anna Lund');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Choose people' }));
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.getByText('The tab shows the whole organization.', { selector: 'p' })).toBeTruthy();
      expect(status().textContent).toBe('The tab shows the whole organization.');
      expect(saving()).toEqual({ topPersons: [], depth: null });
    });

    it('withholds Save for names a tab saved before holds, and says which beside the list until they are removed', () => {
      const { saving } = renderPage({ initialSetup: { topPersons: ['Anna Lund', 'erik@contoso.com'], depth: null }, picks: [] });

      expect(saving()).toBeNull();
      expect(described(screen.getByRole('list'))).toBe('Anna Lund is not an e-mail address.');

      fireEvent.click(screen.getByRole('button', { name: 'Remove Anna Lund' }));

      expect(saving()).toEqual({ topPersons: ['erik@contoso.com'], depth: null });
      expect(screen.queryByText(/not an e-mail address/)).toBeNull();
    });

    it('offers the field to type addresses in, with the people chosen so far, where Teams could not show its picker', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { saving } = renderPage({ picks: [[ANNA], new Error('Teams could not show its people picker (error 100).')] });
      choose();
      await screen.findByRole('list');

      choose();

      await waitFor(() => {
        expect(document.activeElement).toBe(field());
      });
      expect(field().value).toBe('anna@contoso.com');
      expect(described(field())).toBe(
        'Teams could not show its people picker, so enter the e-mail addresses here instead. ' +
          'To show a single department, enter the e-mail addresses of the people at its top, separated by commas. ' +
          'Only their teams are shown.',
      );
      expect(screen.queryByRole('button', { name: 'Choose people' })).toBeNull();
      expect(warn).toHaveBeenCalledOnce();

      fireEvent.change(field(), { target: { value: 'anna@contoso.com, erik@contoso.com' } });
      expect(saving()).toEqual({ topPersons: ['anna@contoso.com', 'erik@contoso.com'], depth: null });
    });
  });
});
