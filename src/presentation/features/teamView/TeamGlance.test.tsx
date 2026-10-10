// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { TeamShareFilter } from '@/domain/orgChart/teamSummary';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { TeamGlance } from './TeamGlance';

function renderGlance(employees: readonly Employee[], id: string, onShowPeople?: (filter: TeamShareFilter) => void) {
  const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });
  return render(<TeamGlance chart={chart} employeeId={id} onShowPeople={onShowPeople} />);
}

/** The tiles, each as screen readers read it: its number, then its word. */
const numbers = () =>
  within(screen.getByRole('list', { name: 'The team in numbers' }))
    .getAllByRole('listitem')
    .map((tile) => tile.textContent);

/** The rows of the list under `heading`: the name, then the count with the word screen readers hear after it. */
const rows = (heading: string) =>
  within(screen.getByRole('list', { name: heading }))
    .getAllByRole('listitem')
    .map((row) => Array.from(row.firstElementChild?.children ?? [], (part) => part.textContent).slice(0, 2).join(' '));

/** How wide each row's bar of the list under `heading` is drawn, as a share of the team. */
const bars = (heading: string) =>
  within(screen.getByRole('list', { name: heading }))
    .getAllByRole('listitem')
    .map((row) => (row.querySelector('[aria-hidden="true"]')?.firstElementChild as HTMLElement | null | undefined)?.style.width);

const member = (id: string, managerId: string, department: string | null, city: string | null) =>
  makeEmployee(id, managerId, { department, city });

/** Two levels below the CEO: Anna's team in Oslo and Bergen, and Eva on her own in London. */
const COMPANY = [
  makeEmployee('ceo'),
  member('anna', 'ceo', 'Sales', 'Oslo'),
  member('bo', 'anna', 'Sales', 'Bergen'),
  member('cy', 'anna', 'Marketing', 'Oslo'),
  member('eva', 'ceo', 'Finance', 'London'),
];

/** The CEO's direct reports, one in each of the cities given. */
const spreadOver = (cities: readonly string[], department: (index: number) => string = () => 'Sales') => [
  makeEmployee('ceo'),
  ...cities.map((city, index) => member(`p${String(index)}`, 'ceo', department(index), city)),
];

afterEach(cleanup);

describe('TeamGlance', () => {
  it('shows the team\'s size, how many levels deep it goes and its managers as tiles, each read as a number and its word', () => {
    renderGlance(COMPANY, 'ceo');

    expect(numbers()).toEqual(['4 people', '2 levels', '1 manager']);
  });

  it('shows only the size of a team of direct reports alone, whose depth the list of them says already', () => {
    renderGlance(COMPANY, 'anna');
    expect(numbers()).toEqual(['2 people']);
    cleanup();

    renderGlance([makeEmployee('ceo'), member('dev', 'ceo', null, null)], 'ceo');
    expect(numbers()).toEqual(['1 person']);
  });

  it('lists the largest departments and cities under headings of their own, each with its count and a bar of its share of the team', () => {
    renderGlance(COMPANY, 'ceo');

    expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)).toEqual(['Departments', 'Cities']);
    expect(rows('Departments')).toEqual(['Sales 2 people', 'Marketing 1 person', 'Finance 1 person']);
    expect(rows('Cities')).toEqual(['Oslo 2 people', 'Bergen 1 person', 'London 1 person']);
    expect(bars('Departments')).toEqual(['50%', '25%', '25%']);
    // The words carry the counts; the bars only draw them.
    expect(screen.getByRole('list', { name: 'Cities' }).querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  it('names the three largest, and shows the rest on request from a button that keeps the focus as it folds them again', () => {
    renderGlance(
      spreadOver(['Oslo', 'Oslo', 'Bergen', 'Paris', 'Rome', 'Lima'], (index) => `Unit ${String(index)}`),
      'ceo',
    );
    expect(rows('Cities')).toEqual(['Oslo 2 people', 'Bergen 1 person', 'Paris 1 person']);
    expect(rows('Departments')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Show 3 more departments' })).toBeTruthy();
    const more = screen.getByRole('button', { name: 'Show 2 more cities', expanded: false });
    expect(more.getAttribute('aria-controls')).toBe(screen.getByRole('list', { name: 'Cities' }).id);
    more.focus();

    fireEvent.click(more);

    expect(rows('Cities')).toEqual(['Oslo 2 people', 'Bergen 1 person', 'Paris 1 person', 'Rome 1 person', 'Lima 1 person']);
    expect(more.textContent).toBe('Show fewer cities');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(more);
    // Each list folds on its own.
    expect(rows('Departments')).toHaveLength(3);

    fireEvent.click(more);
    expect(rows('Cities')).toHaveLength(3);
    expect(more.textContent).toBe('Show 2 more cities');
  });

  it('names a fourth where it is the only one left, rather than a line that counts one more', () => {
    renderGlance(spreadOver(['Oslo', 'Bergen', 'Paris', 'Rome']), 'ceo');

    expect(rows('Cities')).toEqual(['Oslo 1 person', 'Bergen 1 person', 'Paris 1 person', 'Rome 1 person']);
    expect(screen.queryByText(/ more /)).toBeNull();
  });

  it('shows a list of a single entry all the same', () => {
    renderGlance(spreadOver(['Oslo', 'Oslo']), 'ceo');

    expect(rows('Departments')).toEqual(['Sales 2 people']);
    expect(bars('Departments')).toEqual(['100%']);
    expect(rows('Cities')).toEqual(['Oslo 2 people']);
  });

  it('shows a department spelled several ways as one row, under the spelling most of the team uses', () => {
    renderGlance(spreadOver(['Oslo', 'Oslo', 'Oslo'], (index) => ['Energy Facilities', 'energy facilities', 'Energy Facilities '][index] ?? ''), 'ceo');

    expect(rows('Departments')).toEqual(['Energy Facilities 3 people']);
  });

  it('leaves out a list the directory has nothing for, and keeps the numbers', () => {
    renderGlance([makeEmployee('ceo'), member('dev', 'ceo', null, 'Oslo')], 'ceo');

    expect(screen.queryByRole('heading', { name: 'Departments' })).toBeNull();
    expect(rows('Cities')).toEqual(['Oslo 1 person']);
    expect(numbers()).toEqual(['1 person']);
  });

  it('lists a department\'s or a city\'s people from its row, a button named by the name and the count, where it may', () => {
    const onShowPeople = vi.fn<(filter: TeamShareFilter) => void>();
    renderGlance(COMPANY, 'ceo', onShowPeople);

    fireEvent.click(within(screen.getByRole('list', { name: 'Cities' })).getByRole('button', { name: 'Oslo 2 people' }));
    fireEvent.click(within(screen.getByRole('list', { name: 'Departments' })).getByRole('button', { name: 'Finance 1 person' }));

    expect(onShowPeople.mock.calls).toEqual([[{ field: 'city', name: 'Oslo' }], [{ field: 'department', name: 'Finance' }]]);
    expect(rows('Cities')).toEqual(['Oslo 2 people', 'Bergen 1 person', 'London 1 person']);
    cleanup();

    // Without a way to list them, the rows are only read.
    renderGlance(COMPANY, 'ceo');
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(rows('Cities')).toEqual(['Oslo 2 people', 'Bergen 1 person', 'London 1 person']);
  });
});
