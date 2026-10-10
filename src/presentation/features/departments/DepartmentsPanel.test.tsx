// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { departmentTree } from '@/domain/orgChart/departmentTree';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { NO_DEPARTMENT } from './departmentsOf';
import { DepartmentsPanel } from './DepartmentsPanel';

const inDepartment = (id: string, managerId: string | null, department: string | null) => makeEmployee(id, managerId, { department });

/** Management, with Finance and Strategy M&A below it, Business Development below that, an aide back in Management, and a temp without a department. */
const COMPANY = [
  inDepartment('ceo', null, 'Management'),
  inDepartment('head', 'ceo', 'Strategy M&A'),
  inDepartment('lead', 'head', 'Business Development'),
  inDepartment('dev', 'lead', 'Business Development'),
  inDepartment('aide', 'head', 'Management'),
  inDepartment('cfo', 'ceo', 'Finance'),
  inDepartment('temp', 'ceo', null),
];

/** The panel with its folding kept as the page keeps it. */
function renderPanel(employees: readonly Employee[] = COMPANY, returnTo: string | null = null) {
  const tree = departmentTree(buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE }));
  const onOpen = vi.fn<(id: string) => void>();
  function Page() {
    const [folds, setFolds] = useState<ReadonlyMap<string, boolean>>(() => new Map());
    return (
      <DepartmentsPanel
        tree={tree}
        folds={folds}
        onFold={(id, unfolded) => {
          setFolds((shown) => new Map(shown).set(id, unfolded));
        }}
        onOpen={onOpen}
        returnTo={returnTo}
        onClose={vi.fn()}
      />
    );
  }
  render(<Page />);
  return { onOpen };
}

const toggle = (department: string) => screen.getByRole('button', { name: `Departments in ${department}` });

afterEach(cleanup);

describe('DepartmentsPanel', () => {
  it('shows the departments at the top unfolded, each named by how many people it and the departments below it have', () => {
    renderPanel();

    expect(screen.getByRole('complementary', { name: 'Departments' })).toBeTruthy();
    expect(screen.getByText('5 departments')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Management 6 people' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finance 1 person' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Strategy M&A 4 people' })).toBeTruthy();
    expect(toggle('Management').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('Strategy M&A').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /Business Development/ })).toBeNull();
  });

  it('unfolds and folds the departments below a department from its disclosure button', () => {
    renderPanel();

    fireEvent.click(toggle('Strategy M&A'));

    expect(toggle('Strategy M&A').getAttribute('aria-expanded')).toBe('true');
    const below = document.getElementById(toggle('Strategy M&A').getAttribute('aria-controls') ?? '');
    expect(below?.contains(screen.getByRole('button', { name: 'Business Development 2 people' }))).toBe(true);
    // The same department again, below a department that is below it.
    expect(screen.getByRole('button', { name: 'Management 1 person also higher up its path' })).toBeTruthy();

    fireEvent.click(toggle('Strategy M&A'));

    expect(toggle('Strategy M&A').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /Business Development/ })).toBeNull();
  });

  it('opens a department, and the people without one, from their rows', () => {
    const { onOpen } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Finance 1 person' }));
    fireEvent.click(screen.getByRole('button', { name: 'No department set 1 person' }));

    expect(onOpen.mock.calls).toEqual([['management/finance'], [NO_DEPARTMENT]]);
  });

  it('gathers the departments of flagged branches under a heading each, after the others', () => {
    renderPanel([...COMPANY, inDepartment('solo', null, 'Research')]);

    const heading = screen.getByRole('heading', { name: 'No manager set' });
    const research = screen.getByRole('button', { name: 'Research 1 person' });

    expect(heading.compareDocumentPosition(research) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Management 6 people' }).compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('puts the focus on the heading as it opens, or on the row that Back returns to', () => {
    renderPanel();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Departments' }));
    cleanup();

    renderPanel(COMPANY, 'management/finance');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Finance 1 person' }));
  });

  it('leaves out the people without a department where everyone has one', () => {
    renderPanel(COMPANY.filter(({ id }) => id !== 'temp'));

    expect(screen.queryByRole('button', { name: /No department set/ })).toBeNull();
  });
});
