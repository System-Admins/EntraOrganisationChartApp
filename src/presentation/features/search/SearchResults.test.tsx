// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import {
  SearchEmployeesQuery,
  type EmployeeSearchHit,
  type EmployeeSearchResult,
} from '@/application/features/employeeSearch/searchEmployees';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { OrgChart, OrgChartOptions } from '@/domain/orgChart/orgChart';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { describeError } from '../../shared/errors';
import { MediatorProvider } from '../../shared/mediatorContext';
import { PEOPLE_LIST_CAP } from '../peopleList/PeopleList';
import { SearchResults } from './SearchResults';

const OPTIONS: OrgChartOptions = { topPersons: ['ceo'], hide: SHOW_EVERYONE };

const hit = (id: string, overrides: Partial<EmployeeSearchHit> = {}): EmployeeSearchHit => ({
  employee: makeEmployee(id, 'ceo'),
  matchedFields: [],
  matchedExtraFields: [],
  path: ['ceo'],
  managerName: 'Ceo',
  ...overrides,
});

const ANNA = hit('anna', { employee: makeEmployee('anna', 'ceo', { displayName: 'Anna Lund', city: 'Oslo' }), matchedFields: ['city'] });
const ANDERS = hit('anders');

const chartOf = (options: OrgChartOptions): OrgChart => buildOrgChart([makeEmployee('ceo'), ANNA.employee, ANDERS.employee], options);

/** Answers every search with `answer`, which may fail; keeps the searches asked. */
function renderResults(answer: () => Promise<EmployeeSearchResult>) {
  const asked: SearchEmployeesQuery[] = [];
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      if (!(request instanceof SearchEmployeesQuery)) return Promise.resolve(undefined as T);
      asked.push(request);
      return answer() as Promise<T>;
    },
  };
  const onOpen = vi.fn<(employeeId: string) => void>();
  const onClose = vi.fn();
  const page = (chart: OrgChart, options: OrgChartOptions) => (
    <MediatorProvider mediator={mediator}>
      <SearchResults chart={chart} options={options} term="an" onOpen={onOpen} onClose={onClose} />
    </MediatorProvider>
  );
  const { rerender } = render(page(chartOf(OPTIONS), OPTIONS));
  /** The same results beside a chart built again, as after a refresh, which keeps the options, or a change of filters. */
  const rebuild = (options: OrgChartOptions = OPTIONS) => {
    rerender(page(chartOf(options), options));
  };
  return { asked, onOpen, onClose, rebuild };
}

const found = (...hits: EmployeeSearchHit[]) => () => Promise.resolve({ hits, total: hits.length });
const panel = () => screen.getByRole('complementary', { name: 'Search results' });

afterEach(cleanup);

describe('SearchResults', () => {
  it('lists every match, as many as a list shows, with what each was found by, and says how many match', async () => {
    const { asked } = renderResults(found(ANNA, ANDERS));

    expect(await within(panel()).findByText('2 matches for "an"')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Anna Lund', description: 'Oslo · anna@contoso.com · Reports to Ceo' })).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'People found' })).getAllByRole('button')).toHaveLength(2);
    expect(asked.map(({ text, limit, options }) => [text, limit, options])).toEqual([['an', PEOPLE_LIST_CAP, OPTIONS]]);
  });

  it('takes the focus to its heading as it opens, as Show all was in the search field, far from the panel', async () => {
    renderResults(found(ANNA));

    const heading = within(panel()).getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('Search results');
    expect(document.activeElement).toBe(heading);
    expect(panel().textContent).toContain('Searching...');
    await within(panel()).findByText('1 match for "an"');
  });

  it('says where it lists only the best matches, as more match than a list shows', async () => {
    const best = Array.from({ length: PEOPLE_LIST_CAP }, (_, index) => hit(`p${String(index)}`));
    renderResults(() => Promise.resolve({ hits: best, total: 1234 }));

    expect(await within(panel()).findByText('1,234 matches for "an"')).toBeTruthy();
    expect(screen.getByText('The best 300 are listed. Search for more words to find the others.')).toBeTruthy();
  });

  it('opens the match a row stands for, as a suggestion does', async () => {
    const { onOpen } = renderResults(found(ANNA, ANDERS));

    fireEvent.click(await screen.findByRole('button', { name: 'Anders' }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith('anders');
  });

  it('searches again for every chart: a refresh, which keeps the options, and other filters change who matches', async () => {
    const { asked, rebuild } = renderResults(found(ANNA));
    await within(panel()).findByText('1 match for "an"');

    rebuild();
    await waitFor(() => {
      expect(asked).toHaveLength(2);
    });
    const hidingGuests = { ...OPTIONS, hide: { ...SHOW_EVERYONE, guests: true } };
    rebuild(hidingGuests);

    await waitFor(() => {
      expect(asked.at(-1)?.options).toBe(hidingGuests);
    });
    expect(asked).toHaveLength(3);
  });

  it('says why the search failed and offers to try again, with the technical detail for IT', async () => {
    const failure = new Error('Out of memory.');
    const answers = [() => Promise.reject(failure), found(ANNA)];
    renderResults(() => (answers.shift() ?? found())());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(describeError(failure, 'en'));
    expect(within(alert).getByText('Out of memory.').getAttribute('lang')).toBe('en');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Anna Lund' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('closes with its Close button and with Escape', async () => {
    const { onClose } = renderResults(found(ANNA));
    await screen.findByRole('button', { name: 'Anna Lund' });

    fireEvent.click(screen.getByRole('button', { name: 'Close search results' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
