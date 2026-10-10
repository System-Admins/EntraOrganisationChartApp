// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { ClearRecentPeopleCommand } from '@/application/features/employeeSearch/clearRecentPeople';
import { GetRecentPeopleQuery, type RecentPeople } from '@/application/features/employeeSearch/getRecentPeople';
import { SearchEmployeesQuery, type EmployeeSearchHit } from '@/application/features/employeeSearch/searchEmployees';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import type { ExtraField } from '@/application/settings/extraFields';
import type { OrgChartOptions } from '@/domain/orgChart/orgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { makePresence } from '@/testing/makePresence';
import { MediatorProvider } from '../../shared/mediatorContext';
import { Avatar } from '../photos/Avatar';
import { PresenceProvider } from '../presence/presenceContext';
import { COUNT_PAUSE_MS, SearchBox, type SearchBoxHandle } from './SearchBox';
import stylesheet from './SearchBox.module.css?raw';
import { searchHint } from './searchHint';

const hit = (id: string, overrides: Partial<EmployeeSearchHit> = {}): EmployeeSearchHit => ({
  employee: makeEmployee(id),
  matchedFields: [],
  matchedExtraFields: [],
  path: [],
  managerName: null,
  ...overrides,
});

const OPTIONS: OrgChartOptions = { topPersons: [], hide: SHOW_EVERYONE };

// The organization's own fields as config.json names them: a cost centre that search looks in, and an employee type it doesn't.
const COST_CENTRE: ExtraField = { property: 'employeeOrgData.costCenter', label: 'Cost centre', search: true, export: false };
const EMPLOYEE_TYPE: ExtraField = { property: 'employeeType', label: 'Employee type', search: false, export: true };

/** The stub finds people by the start of their id; `beyond` more match than it lists; `offered` is what the empty field offers. */
function renderSearch(
  people: EmployeeSearchHit[],
  beyond = 0,
  offered: Partial<RecentPeople> = {},
  extraFields: readonly ExtraField[] = [],
) {
  const onSelect = vi.fn<(hit: EmployeeSearchHit) => void>();
  const onShowAll = vi.fn<(term: string) => void>();
  const sent: Request<unknown>[] = [];
  let recent: RecentPeople = { you: null, yourManager: null, recent: [], ...offered };
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      if (request instanceof GetRecentPeopleQuery) return Promise.resolve(recent as T);
      if (request instanceof ClearRecentPeopleCommand) {
        recent = { ...recent, recent: [] };
        return Promise.resolve(undefined as T);
      }
      const text = request instanceof SearchEmployeesQuery ? request.text : '';
      const hits = people.filter((person) => person.employee.id.startsWith(text));
      return Promise.resolve({ hits, total: hits.length + beyond } as T);
    },
  };
  const handle = createRef<SearchBoxHandle>();
  render(
    <MediatorProvider mediator={mediator}>
      <SearchBox
        options={OPTIONS}
        extraFields={extraFields}
        disabled={false}
        onSelect={onSelect}
        onShowAll={onShowAll}
        handleRef={handle}
      />
    </MediatorProvider>,
  );
  const input = screen.getByRole('combobox', { name: 'Search' });
  return { input, onSelect, onShowAll, sent, handle };
}

/** Types the text with the field focused, as a person does. */
const type = (input: HTMLElement, text: string) => {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
};

const described = (element: HTMLElement) => document.getElementById(element.getAttribute('aria-describedby') ?? '')?.textContent;

beforeAll(() => {
  // jsdom lacks element scrolling.
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(cleanup);

describe('SearchBox', () => {
  it('shows "No matches" instead of an empty list', async () => {
    const { input } = renderSearch([]);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zz' } });

    // The live region says it too, once typing has paused (see "the count it says").
    expect((await screen.findByText('No matches', { selector: 'p' })).getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('chooses a suggestion on click, so a press can still be cancelled by moving away', async () => {
    const { input, onSelect } = renderSearch([hit('anna')]);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'an' } });
    const option = await screen.findByRole('option', { name: /Anna/ });

    fireEvent.mouseDown(option);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(option);

    expect(onSelect.mock.calls[0]?.[0].employee.id).toBe('anna');
  });

  it('shows what the search found a person by first, then the address and the manager, each once', async () => {
    const anna = makeEmployee('anna', 'ceo', { officeLocation: 'Oslo HQ', city: 'Oslo', mobilePhone: '+47 400 00 000' });
    const { input } = renderSearch([
      hit('anna', { employee: anna, matchedFields: ['officeLocation', 'mail', 'mobilePhone'], managerName: 'Ceo' }),
      hit('anders', { employee: makeEmployee('anders', null, { mail: null }) }),
    ]);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'an' } });

    expect(await screen.findByRole('option', { name: 'AnnaOslo HQ · anna@contoso.com · +47 400 00 000 · Reports to Ceo' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Anders' })).toBeTruthy();
  });

  it('names the organization\'s own field that found a person, after the built-in details, as its values are codes as often as words', async () => {
    const anna = makeEmployee('anna', 'ceo', { city: 'Oslo', extra: { 'employeeOrgData.costCenter': '4170' } });
    const { input } = renderSearch([
      hit('anna', { employee: anna, matchedFields: ['city'], matchedExtraFields: [COST_CENTRE], managerName: 'Ceo' }),
    ]);

    type(input, 'an');

    expect(await screen.findByRole('option', { name: 'AnnaOslo · Cost centre: 4170 · anna@contoso.com · Reports to Ceo' })).toBeTruthy();
  });

  it('keeps the suggestion list out of the Tab order', async () => {
    const { input } = renderSearch([hit('anna')]);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'an' } });

    expect((await screen.findByRole('listbox', { name: 'People' })).tabIndex).toBe(-1);
  });

  it('names each option after its person, so the active descendant changes exactly when the active person does', async () => {
    const { input } = renderSearch([hit('anders'), hit('anna')]);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'an' } });
    const anna = await screen.findByRole('option', { name: /Anna/ });
    const annaId = anna.id;
    const andersId = screen.getByRole('option', { name: /Anders/ }).id;

    expect(annaId).not.toBe(andersId);
    expect(input.getAttribute('aria-activedescendant')).toBe(andersId);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(annaId);

    // Anna moves from second to first place; a position-based id would now belong to another element.
    fireEvent.change(input, { target: { value: 'ann' } });
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /Anders/ })).toBeNull();
    });

    expect(screen.getByRole('option', { name: /Anna/ })).toBe(anna);
    expect(anna.id).toBe(annaId);
    expect(anna.getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(annaId);
  });

  it('builds valid, distinct option ids from directory ids that are not valid ids themselves', async () => {
    const { input } = renderSearch([hit('a b'), hit('a_b'), hit('a_20_b')]);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } });
    const ids = (await screen.findAllByRole('option')).map((option) => option.id);

    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(/^\S+$/);
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[0]);
  });

  it('refers to no option while there is none to refer to', async () => {
    const { input } = renderSearch([hit('anna')]);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'an' } });
    await screen.findByRole('option');
    expect(input.hasAttribute('aria-activedescendant')).toBe(true);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);

    fireEvent.change(input, { target: { value: 'zz' } });
    await screen.findByText('No matches', { selector: 'p' });
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('is labelled "Search", and tells assistive technology what it looks in as its description', () => {
    const { input } = renderSearch([]);

    expect(input.getAttribute('placeholder')).toBe('Search');
    expect(input.hasAttribute('title')).toBe(false);
    expect(described(input)).toBe(searchHint('en'));
  });

  it('names the organization\'s own fields that search looks in last in its description, by the labels config.json gives them', () => {
    const { input } = renderSearch([], 0, {}, [COST_CENTRE, EMPLOYEE_TYPE]);

    expect(described(input)).toBe('Finds people by name, phone, e-mail, office, company, job title, department, city, country, or Cost centre.');
  });

  it('makes the whole field, not only the text, a press target of the input', () => {
    const { input } = renderSearch([]);

    expect(input.closest('label')).not.toBeNull();
    expect((input as HTMLInputElement).labels).toHaveLength(1);
    // The label has no text; the name must keep coming from the input itself.
    expect(screen.getByRole('combobox', { name: 'Search' })).toBe(input);
  });

  it('takes the focus back from the page with its list closed, and opens the list when the page focuses it otherwise', async () => {
    const { input, handle } = renderSearch([hit('anna')]);
    type(input, 'an');
    await screen.findByRole('listbox');
    // The person opened the results beside the chart, which took the focus.
    fireEvent.blur(input);

    act(() => {
      handle.current?.returnFocus();
    });

    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      input.blur();
    });
    act(() => {
      handle.current?.focus();
    });
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('lets Escape clear the text without the key reaching the rest of the page', () => {
    const { input } = renderSearch([]);
    fireEvent.change(input, { target: { value: 'an' } });
    fireEvent.blur(input);

    const notPrevented = fireEvent.keyDown(input, { key: 'Escape' });

    expect(notPrevented).toBe(false);
    expect((input as HTMLInputElement).value).toBe('');
  });

  describe('beyond the suggestions', () => {
    it('shows how many people match above the suggestions, hidden from screen readers, as the live region says it', async () => {
      const { input } = renderSearch([hit('anna'), hit('anders')], 35);

      type(input, 'an');

      const count = await screen.findByText('37 matches', { selector: 'p' });
      expect(count.getAttribute('aria-hidden')).toBe('true');
      expect(screen.getByRole('listbox').contains(count)).toBe(false);
    });

    it('offers every match as the last option, reached with the arrow keys and chosen with Enter', async () => {
      const { input, onShowAll, onSelect } = renderSearch([hit('anna'), hit('anders')], 35);
      type(input, 'an');
      const all = await screen.findByRole('option', { name: 'Show all 37' });
      expect(screen.getAllByRole('option').at(-1)).toBe(all);

      for (let presses = 0; presses < 3; presses++) fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input.getAttribute('aria-activedescendant')).toBe(all.id);
      expect(all.getAttribute('aria-selected')).toBe('true');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onShowAll).toHaveBeenCalledExactlyOnceWith('an');
      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('shows them all on a click too, which a press can still cancel by moving away', async () => {
      const { input, onShowAll } = renderSearch([hit('anna')], 5);
      type(input, 'an');
      const all = await screen.findByRole('option', { name: 'Show all 6' });

      fireEvent.mouseDown(all);
      expect(onShowAll).not.toHaveBeenCalled();
      fireEvent.click(all);

      expect(onShowAll).toHaveBeenCalledExactlyOnceWith('an');
    });

    it('keeps the ids of the people\'s options, and gives Show all one no person can have', async () => {
      const { input } = renderSearch([hit('all'), hit('a_all')], 1);
      type(input, 'a');
      const all = await screen.findByRole('option', { name: 'Show all 3' });
      const ids = screen.getAllByRole('option').map((option) => option.id);

      expect(new Set(ids).size).toBe(3);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /^A_all/ }).id);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input.getAttribute('aria-activedescendant')).toBe(all.id);
    });

    it('makes Show all, and Clear recent, which shares its look, a target as tall as every other control', () => {
      const all = /(?:^|\})\s*\.all\s*\{([^}]*)\}/.exec(stylesheet.replace(/\/\*[\s\S]*?\*\//g, ''))?.[1] ?? '';

      expect(all).toMatch(/(?:^|;)\s*min-height:\s*44px\s*;/);
    });

    it('offers no Show all where the suggestions hold every match', async () => {
      const { input } = renderSearch([hit('anna')]);
      type(input, 'an');

      await screen.findByRole('option', { name: /^Anna/ });
      expect(screen.queryByRole('option', { name: /^Show all/ })).toBeNull();
      expect(screen.getByText('1 match', { selector: 'p' })).toBeTruthy();
    });

    it('puts a small photo beside each suggestion, which leaves the option named after the person', async () => {
      const { input } = renderSearch([hit('anna')]);
      type(input, 'an');

      const option = await screen.findByRole('option', { name: /^Anna/ });
      const avatar = option.querySelector<HTMLElement>('[aria-hidden="true"]');
      expect(avatar?.style.width).toBe('24px');
      expect(avatar?.textContent).toBe('A');
    });

    it('shows no Teams status in a suggestion, as the option\'s name leaves it out, even where the status is known', async () => {
      const mediator: Sender = {
        send: <T,>(request: Request<T>) =>
          Promise.resolve(
            (request instanceof GetPresencesQuery
              ? new Map(request.employeeIds.map((id) => [id, makePresence({ availability: 'busy' })]))
              : { hits: [hit('anna')], total: 1 }) as T,
          ),
      };
      const { container } = render(
        <MediatorProvider mediator={mediator}>
          <PresenceProvider enabled>
            <SearchBox
              options={{ topPersons: [], hide: SHOW_EVERYONE }}
              extraFields={[]}
              disabled={false}
              onSelect={vi.fn()}
              onShowAll={vi.fn()}
            />
            {/* Anna's photo elsewhere on the page, such as on her card, which keeps her status known. */}
            <Avatar employee={makeEmployee('anna')} size={40} />
          </PresenceProvider>
        </MediatorProvider>,
      );

      type(screen.getByRole('combobox'), 'an');

      const option = await screen.findByRole('option', { name: /^Anna/ });
      await waitFor(() => {
        expect(container.querySelector('[data-presence="busy"]')).not.toBeNull();
      });
      expect(option.querySelector('[data-presence]')).toBeNull();
    });
  });

  describe('the count it says', () => {
    /** Moves the faked clock on, with what the timers set off rendered. */
    const pass = (milliseconds: number) => act(() => vi.advanceTimersByTimeAsync(milliseconds));
    /** Long enough for the search's own pause, after which the list shows what was typed. */
    const SEARCH_SETTLES_MS = 200;
    const spoken = () => screen.getByRole('status').textContent;
    /** In two steps: the timer of the count's pause is only set once the list shows what the search found. */
    const pauseTyping = async () => {
      await pass(SEARCH_SETTLES_MS);
      await pass(COUNT_PAUSE_MS);
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('says how many match once typing has paused for a second, and "No matches" where nobody does', async () => {
      const { input } = renderSearch([hit('anna'), hit('anders')]);

      type(input, 'an');
      await pass(SEARCH_SETTLES_MS);
      expect(screen.getByText('2 matches', { selector: 'p' })).toBeTruthy();
      expect(spoken()).toBe('');
      await pass(COUNT_PAUSE_MS);
      expect(spoken()).toBe('2 matches');

      fireEvent.change(input, { target: { value: 'zz' } });
      await pauseTyping();
      expect(spoken()).toBe('No matches');
    });

    it('says nothing while typing goes on in short pauses, then the count it settles on', async () => {
      const { input } = renderSearch([hit('anna'), hit('anders'), hit('bo')]);

      type(input, 'a');
      await pass(400);
      fireEvent.change(input, { target: { value: 'an' } });
      await pass(400);
      fireEvent.change(input, { target: { value: 'ann' } });
      await pass(400);
      expect(spoken()).toBe('');

      await pass(COUNT_PAUSE_MS);
      expect(spoken()).toBe('1 match');
    });

    it('leaves the region as it is when more typing keeps the count, so that it is not said again, and says a new count', async () => {
      const { input } = renderSearch([hit('anna'), hit('anders')]);
      type(input, 'a');
      await pauseTyping();
      const region = screen.getByRole('status');
      expect(region.textContent).toBe('2 matches');
      const changes: (string | null)[] = [];
      const observer = new MutationObserver(() => {
        changes.push(region.textContent);
      });
      observer.observe(region, { childList: true, characterData: true, subtree: true });

      try {
        fireEvent.change(input, { target: { value: 'an' } });
        await pauseTyping();
        expect(changes).toEqual([]);

        fireEvent.change(input, { target: { value: 'and' } });
        await pauseTyping();
        expect(changes).toEqual(['1 match']);
      } finally {
        observer.disconnect();
      }
    });

    it('empties the region as the list closes, saying nothing, and waits for a pause after the next term too', async () => {
      const { input } = renderSearch([hit('anna'), hit('anders'), hit('bob'), hit('bo')]);
      type(input, 'an');
      await pauseTyping();
      expect(spoken()).toBe('2 matches');

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(spoken()).toBe('');

      // As many match the next term, which still waits for its own pause.
      fireEvent.change(input, { target: { value: 'bo' } });
      await pass(SEARCH_SETTLES_MS);
      expect(spoken()).toBe('');
      await pass(COUNT_PAUSE_MS);
      expect(spoken()).toBe('2 matches');
    });
  });

  describe('before anything is typed', () => {
    const ASE = hit('ase', { managerName: 'Lars' });
    const LARS = hit('lars');
    const ANNA = hit('anna', { managerName: 'Ceo' });
    const BO = hit('bo');
    const OFFERED: RecentPeople = { you: ASE, yourManager: LARS, recent: [ANNA, BO] };
    const options = () => screen.getAllByRole('option');

    it('offers the signed-in user and their manager, then the people opened lately and Clear recent, in named groups', async () => {
      const { input } = renderSearch([], 0, OFFERED);

      fireEvent.focus(input);

      const list = await screen.findByRole('listbox', { name: 'People' });
      const own = within(list).getByRole('group', { name: 'You and your manager' });
      expect(within(own).getAllByRole('option')).toEqual([
        within(own).getByRole('option', { name: 'AseYou · ase@contoso.com · Reports to Lars' }),
        within(own).getByRole('option', { name: 'LarsYour manager · lars@contoso.com' }),
      ]);
      const recent = within(list).getByRole('group', { name: 'Recent' });
      expect(within(recent).getAllByRole('option')).toEqual([
        within(recent).getByRole('option', { name: 'Annaanna@contoso.com · Reports to Ceo' }),
        within(recent).getByRole('option', { name: 'Bobo@contoso.com' }),
      ]);
      expect(options().at(-1)).toBe(screen.getByRole('option', { name: 'Clear recent' }));
      expect(list.tabIndex).toBe(-1);
      expect(input.getAttribute('aria-expanded')).toBe('true');
      // Nothing is active until the arrows go there, so that Enter in an empty field opens nobody.
      expect(input.hasAttribute('aria-activedescendant')).toBe(false);
      expect(screen.getByRole('status').textContent).toBe('');
    });

    it('goes through both groups with the arrow keys, and opens the person chosen with Enter or a click', async () => {
      const { input, onSelect } = renderSearch([], 0, OFFERED);
      fireEvent.focus(input);
      await screen.findByRole('listbox');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /^Ase/ }).id);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(screen.getByRole('option', { name: /^Anna/ }).getAttribute('aria-selected')).toBe('true');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSelect).toHaveBeenCalledExactlyOnceWith(ANNA);
      expect(screen.queryByRole('listbox')).toBeNull();

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      const bo = await screen.findByRole('option', { name: /^Bo/ });
      fireEvent.mouseDown(bo);
      fireEvent.click(bo);
      expect(onSelect).toHaveBeenLastCalledWith(BO);
    });

    it('opens nobody with Enter before an option is chosen', async () => {
      const { input, onSelect } = renderSearch([], 0, OFFERED);
      fireEvent.focus(input);
      await screen.findByRole('listbox');

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.getByRole('listbox')).toBeTruthy();
    });

    it('opens nobody with Enter in a field emptied of what was typed, whose list comes back with no option active', async () => {
      const { input, onSelect } = renderSearch([ANNA], 0, OFFERED);
      type(input, 'an');
      await screen.findByRole('option', { name: /^Anna/ });

      fireEvent.change(input, { target: { value: '' } });
      await screen.findByRole('group', { name: 'Recent' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input.hasAttribute('aria-activedescendant')).toBe(false);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('gives each person the option id a search gives them, and Clear recent one no person can have', async () => {
      const { input } = renderSearch([ANNA], 0, { recent: [ANNA, hit('clear')] });
      fireEvent.focus(input);
      await screen.findByRole('listbox');
      const ids = options().map((option) => option.id);
      const annaId = screen.getByRole('option', { name: /^Anna/ }).id;

      fireEvent.change(input, { target: { value: 'an' } });
      await screen.findByRole('option', { name: /^Anna/ });

      expect(new Set(ids).size).toBe(3);
      expect(screen.getByRole('option', { name: /^Anna/ }).id).toBe(annaId);
    });

    it('gives way to the suggestions as soon as something is typed', async () => {
      const { input } = renderSearch([hit('anders'), ANNA], 0, OFFERED);
      fireEvent.focus(input);
      await screen.findByRole('group', { name: 'Recent' });

      fireEvent.change(input, { target: { value: 'an' } });

      await screen.findByRole('option', { name: /^Anders/ });
      expect(screen.queryByRole('group')).toBeNull();
      expect(screen.queryByRole('option', { name: 'Clear recent' })).toBeNull();
      expect(screen.getByText('2 matches', { selector: 'p' })).toBeTruthy();
    });

    it('closes with Escape, which goes no further and clears neither the field nor the recent people', async () => {
      const { input, sent } = renderSearch([], 0, OFFERED);
      const outside = vi.fn();
      document.addEventListener('keydown', outside);
      fireEvent.focus(input);
      await screen.findByRole('listbox');

      const notPrevented = fireEvent.keyDown(input, { key: 'Escape' });
      document.removeEventListener('keydown', outside);

      expect(notPrevented).toBe(false);
      expect(outside).not.toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(input.getAttribute('aria-expanded')).toBe('false');
      expect(sent.some((request) => request instanceof ClearRecentPeopleCommand)).toBe(false);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(await screen.findByRole('group', { name: 'Recent' })).toBeTruthy();
    });

    it('clears the recent people with its last option, says so, and still offers the user and their manager', async () => {
      const { input, sent } = renderSearch([], 0, OFFERED);
      act(() => {
        input.focus();
      });
      const clear = await screen.findByRole('option', { name: 'Clear recent' });

      for (let presses = 0; presses < 5; presses++) fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(input.getAttribute('aria-activedescendant')).toBe(clear.id);
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.queryByRole('group', { name: 'Recent' })).toBeNull();
      });
      expect(sent.filter((request) => request instanceof ClearRecentPeopleCommand)).toHaveLength(1);
      expect(screen.getByRole('group', { name: 'You and your manager' })).toBeTruthy();
      expect(screen.queryByRole('option', { name: 'Clear recent' })).toBeNull();
      expect(screen.getByRole('status').textContent).toBe('Recent people cleared.');
      expect(document.activeElement).toBe(input);
    });

    it('is expanded only while it offers someone: never without anyone to offer, nor once Clear recent leaves nobody', async () => {
      const nobody = renderSearch([], 0, {});
      fireEvent.focus(nobody.input);
      await waitFor(() => {
        expect(nobody.sent.some((request) => request instanceof GetRecentPeopleQuery)).toBe(true);
      });
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(nobody.input.getAttribute('aria-expanded')).toBe('false');
      cleanup();

      const { input } = renderSearch([], 0, { recent: [ANNA] });
      fireEvent.focus(input);
      const clear = await screen.findByRole('option', { name: 'Clear recent' });
      fireEvent.mouseDown(clear);
      fireEvent.click(clear);

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).toBeNull();
      });
      expect(input.getAttribute('aria-expanded')).toBe('false');
    });

    it('asks again with the chart\'s options each time the list opens, as people are opened in the meantime', async () => {
      const { input, sent } = renderSearch([], 0, OFFERED);
      const asked = () => sent.filter((request) => request instanceof GetRecentPeopleQuery);
      fireEvent.focus(input);
      await screen.findByRole('listbox');

      fireEvent.blur(input);
      expect(screen.queryByRole('listbox')).toBeNull();
      fireEvent.focus(input);

      await waitFor(() => {
        expect(asked()).toHaveLength(2);
      });
      expect(asked()[1]?.options).toBe(OPTIONS);
    });

    it('names a group of the user alone or of their manager alone', async () => {
      const { input } = renderSearch([], 0, { you: ASE });
      fireEvent.focus(input);

      expect(await screen.findByRole('group', { name: 'You' })).toBeTruthy();
      cleanup();

      const manager = renderSearch([], 0, { yourManager: LARS });
      fireEvent.focus(manager.input);
      expect(await screen.findByRole('group', { name: 'Your manager' })).toBeTruthy();
    });
  });
});
