// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { ContactTeamCommand } from '@/application/features/contact/contactTeam';
import { GetTeamContactQuery } from '@/application/features/contact/getTeamContact';
import { planTeamContact } from '@/application/features/contact/teamContact';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { departmentTree } from '@/domain/orgChart/departmentTree';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { MediatorProvider } from '../../shared/mediatorContext';
import type { PeopleLayout } from '../peopleList/PeopleList';
import { NO_DEPARTMENT } from './departmentsOf';
import { DepartmentView, type DepartmentBack } from './DepartmentView';

const inDepartment = (id: string, managerId: string | null, department: string | null, displayName: string) =>
  makeEmployee(id, managerId, { department, displayName });

/** Management, with Strategy M&A below it, Business Development below that, an aide back in Management, and a temp without a department. */
const COMPANY = [
  inDepartment('ceo', null, 'Management', 'Ingrid Solberg'),
  inDepartment('head', 'ceo', 'Strategy M&A', 'Hanna Lie'),
  inDepartment('lead', 'head', 'Business Development', 'Lars Moen'),
  inDepartment('dev', 'lead', 'Business Development', 'Dina Berg'),
  inDepartment('aide', 'head', 'Management', 'Arne Dahl'),
  inDepartment('temp', 'ceo', null, 'Tore Vik'),
];

/** Answers whom the tiles reach as the planner does, signed in as nobody, and nothing else. */
function mediatorFor(sent: Request<unknown>[]): Sender {
  return {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      return Promise.resolve((request instanceof GetTeamContactQuery ? planTeamContact(request.team, null) : undefined) as T);
    },
  };
}

function renderView(
  departmentId: string,
  { back = { to: 'departments' }, returnTo = null, employees = COMPANY }: { back?: DepartmentBack; returnTo?: string | null; employees?: readonly Employee[] } = {},
) {
  const chart = buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });
  const tree = departmentTree(chart);
  const handlers = { onOpenDepartment: vi.fn<(id: string) => void>(), onOpen: vi.fn<(id: string) => void>(), onBack: vi.fn(), onClose: vi.fn() };
  const sent: Request<unknown>[] = [];
  function Page() {
    const [layout, setLayout] = useState<PeopleLayout>('list');
    return (
      <MediatorProvider mediator={mediatorFor(sent)}>
        <DepartmentView
          chart={chart}
          tree={tree}
          departmentId={departmentId}
          layout={layout}
          onLayoutChange={setLayout}
          back={back}
          returnTo={returnTo}
          {...handlers}
        />
      </MediatorProvider>
    );
  }
  render(<Page />);
  return { ...handlers, sent };
}

/** The people listed, by name, in their order. */
const people = (label: string) =>
  within(screen.getByRole('list', { name: label }))
    .getAllByRole('button')
    .map((row) => document.getElementById(row.getAttribute('aria-labelledby') ?? '')?.textContent);

afterEach(cleanup);

describe('DepartmentView', () => {
  it('heads a department with its name and people, the departments above it, and its leaders', () => {
    const { onOpenDepartment } = renderView('management/strategyma/businessdevelopment');

    expect(screen.getByRole('complementary', { name: 'Business Development' })).toBeTruthy();
    expect(screen.getByText('2 people')).toBeTruthy();
    const path = within(screen.getByRole('list', { name: 'Department path' }));
    expect(path.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Management›', 'Strategy M&A›', 'Business Development']);
    expect(screen.getByText('Led by Lars Moen')).toBeTruthy();

    fireEvent.click(path.getByRole('button', { name: 'Strategy M&A' }));

    expect(onOpenDepartment).toHaveBeenCalledWith('management/strategyma');
  });

  it('counts the people of the departments below it too, and opens those departments from their rows', () => {
    const { onOpenDepartment } = renderView('management/strategyma');

    expect(screen.getByText('1 person, 4 with the departments below it')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Departments below' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Business Development 2 people' }));

    expect(onOpenDepartment).toHaveBeenCalledWith('management/strategyma/businessdevelopment');
    expect(screen.getByRole('button', { name: 'Management 1 person also higher up its path' })).toBeTruthy();
  });

  it('lists its own people, its leaders first, who open in the chart', () => {
    const logistics = [
      inDepartment('ceo', null, 'Management', 'Ingrid Solberg'),
      inDepartment('anna', 'ceo', 'Logistics', 'Anna Lund'),
      inDepartment('al', 'anna', 'Logistics', 'Ali Sund'),
      inDepartment('bo', 'ceo', 'Logistics', 'Bo Berg'),
    ];
    const { onOpen } = renderView('management/logistics', { employees: logistics });

    expect(people('People in Logistics')).toEqual(['Anna Lund', 'Bo Berg', 'Ali Sund']);
    expect(screen.getByText('Led by Anna Lund and Bo Berg')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ali Sund' }));

    expect(onOpen).toHaveBeenCalledWith('al');
  });

  it('says where the same department comes higher up its path', () => {
    renderView('management/strategyma/management');

    expect(screen.getByText(/This department also comes higher up its path/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Department path' })).getAllByRole('button').map(({ textContent }) => textContent)).toEqual([
      'Management',
      'Strategy M&A',
    ]);
  });

  it('lists the people without a department, with neither a path, leaders nor ways to contact them', () => {
    renderView(NO_DEPARTMENT);

    expect(screen.getByRole('complementary', { name: 'No department set' })).toBeTruthy();
    expect(people('People without a department')).toEqual(['Tore Vik']);
    expect(screen.queryByRole('list', { name: 'Department path' })).toBeNull();
    expect(screen.queryByText(/^Led by/)).toBeNull();
  });

  it('reaches its people in one step, in a group chat named after the department', async () => {
    const { sent } = renderView('management/strategyma/businessdevelopment');

    fireEvent.click(await screen.findByRole('button', { name: 'Chat with everyone in Business Development' }));

    expect(sent.find((request) => request instanceof ContactTeamCommand)?.topic).toBe('Business Development');
  });

  it('names Back by where it goes', () => {
    const { onBack } = renderView('management/strategyma/businessdevelopment');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the departments' }));
    expect(onBack).toHaveBeenCalled();
    cleanup();

    renderView('management/strategyma/businessdevelopment', { back: { to: 'department', id: 'management/strategyma' } });
    expect(screen.getByRole('button', { name: 'Back to Strategy M&A' })).toBeTruthy();
    cleanup();

    renderView('management/strategyma/businessdevelopment', { back: { to: 'details', name: 'Hanna Lie' } });
    expect(screen.getByRole('button', { name: 'Back to the details for Hanna Lie' })).toBeTruthy();
  });

  it('puts the focus on the heading as it opens, or on the row that Back returns to', () => {
    renderView('management/strategyma');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Strategy M&A' }));
    cleanup();

    renderView('management/strategyma', { returnTo: 'management/strategyma/businessdevelopment' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Business Development 2 people' }));
  });
});
