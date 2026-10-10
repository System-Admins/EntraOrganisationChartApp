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
import type { OrgChart } from '@/domain/orgChart/orgChart';
import type { TeamShareFilter } from '@/domain/orgChart/teamSummary';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { MediatorProvider } from '../../shared/mediatorContext';
import type { PeopleLayout } from '../peopleList/PeopleList';
import { TeamView } from './TeamView';

const chartOf = (employees: readonly Employee[]) => buildOrgChart(employees, { topPersons: ['ceo'], hide: SHOW_EVERYONE });

/** Anna's team: Bo, and Ola with Kari below him; Ola and Bo in London. */
const COMPANY = [
  makeEmployee('ceo'),
  makeEmployee('anna', 'ceo', { displayName: 'Anna Lund', city: 'London' }),
  makeEmployee('ola', 'anna', { displayName: 'Ola Berg', jobTitle: 'Team Lead', city: 'London' }),
  makeEmployee('kari', 'ola', { displayName: 'Kari Dahl', jobTitle: null, department: 'Finance', city: 'Oslo' }),
  makeEmployee('bo', 'anna', { displayName: 'Bo Sund', city: 'London' }),
];

/** Answers whom a team's tiles reach as the planner does, signed in as nobody, and nothing else. */
function mediatorFor(sent: Request<unknown>[]): Sender {
  return {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      return Promise.resolve((request instanceof GetTeamContactQuery ? planTeamContact(request.team, null) : undefined) as T);
    },
  };
}

/** The view with the page's part played by mocks, and the layout kept as the page keeps it. */
function renderTeam(chart: OrgChart = chartOf(COMPANY), filter: TeamShareFilter | null = null) {
  const handlers = {
    onOpen: vi.fn<(id: string) => void>(),
    onShowWholeTeam: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    onLayoutChange: vi.fn<(layout: PeopleLayout) => void>(),
  };
  const sent: Request<unknown>[] = [];
  const mediator = mediatorFor(sent);
  function Page({ shown }: { shown: OrgChart }) {
    const [layout, setLayout] = useState<PeopleLayout>('list');
    return (
      <MediatorProvider mediator={mediator}>
        <TeamView
          chart={shown}
          managerId="anna"
          filter={filter}
          onShowWholeTeam={handlers.onShowWholeTeam}
          layout={layout}
          onLayoutChange={(next) => {
            handlers.onLayoutChange(next);
            setLayout(next);
          }}
          onOpen={handlers.onOpen}
          onBack={handlers.onBack}
          onClose={handlers.onClose}
        />
      </MediatorProvider>
    );
  }
  const { rerender } = render(<Page shown={chart} />);
  /** The same view over another chart, as the page renders it after a refresh or a change of filters. */
  const show = (other: OrgChart) => {
    rerender(<Page shown={other} />);
  };
  return { ...handlers, show, sent };
}

const panel = () => screen.getByRole('complementary');
const names = () =>
  within(screen.getByRole('list')).getAllByRole('button').map((row) => document.getElementById(row.getAttribute('aria-labelledby') ?? '')?.textContent);

afterEach(cleanup);

describe('TeamView', () => {
  it('lists everyone below the manager at every level, in the outline\'s order, under the team\'s name and size', () => {
    renderTeam();

    expect(screen.getByRole('complementary', { name: "Anna Lund's team" })).toBeTruthy();
    expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe("Anna Lund's team");
    expect(panel().textContent).toContain('3 people');
    expect(screen.getByRole('list', { name: "People in Anna Lund's team" })).toBeTruthy();
    expect(names()).toEqual(['Bo Sund', 'Ola Berg', 'Kari Dahl']);
    // The job title under the name, else the department.
    expect(screen.getByRole('button', { name: 'Ola Berg', description: 'Team Lead' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kari Dahl', description: 'Finance' })).toBeTruthy();
  });

  it('lists and reaches nobody the address list hides, and the people below their place all the same', async () => {
    const hiding = COMPANY.map((employee) => (employee.id === 'ola' ? { ...employee, hiddenFromAddressList: true } : employee));
    const { sent } = renderTeam(buildOrgChart(hiding, { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } }));

    expect(names()).toEqual(['Bo Sund', 'Kari Dahl']);
    expect(panel().textContent).toContain('2 people');
    await within(panel()).findByRole('button', { name: 'Chat with the whole team' });
    expect(sent.find((request) => request instanceof GetTeamContactQuery)?.team.map(({ id }) => id)).toEqual(['bo', 'kari']);
  });

  it('offers to reach the whole team it lists, the manager left out, under a heading below the list\'s own', async () => {
    const { sent } = renderTeam();

    const chat = await within(panel()).findByRole('button', { name: 'Chat with the whole team' });
    expect(within(panel()).getByRole('heading', { level: 3 }).textContent).toBe('Contact the whole team');
    expect(sent.find((request) => request instanceof GetTeamContactQuery)?.team.map(({ id }) => id)).toEqual(['bo', 'ola', 'kari']);
    expect(screen.queryByRole('button', { name: 'See the whole team' })).toBeNull();

    fireEvent.click(chat);
    expect(sent.find((request) => request instanceof ContactTeamCommand)?.topic).toBe("Anna Lund's team");
  });

  it('lists only the team\'s people in one department or city, says which, reaches them alone, and leads to the whole team', async () => {
    const { onShowWholeTeam, sent } = renderTeam(chartOf(COMPANY), { field: 'city', name: 'London' });

    expect(screen.getByRole('complementary', { name: "Anna Lund's team in London" })).toBeTruthy();
    expect(within(panel()).getByRole('heading', { level: 2 }).textContent).toBe("Anna Lund's team in London");
    expect(panel().textContent).toContain('2 people');
    expect(screen.getByRole('list', { name: "People in Anna Lund's team in London" })).toBeTruthy();
    // Kari works in Oslo, and Anna heads the team rather than being in it.
    expect(names()).toEqual(['Bo Sund', 'Ola Berg']);

    fireEvent.click(await within(panel()).findByRole('button', { name: 'Chat with everyone in London' }));
    expect(within(panel()).getByRole('heading', { level: 3 }).textContent).toBe('Contact everyone in London');
    expect(sent.find((request) => request instanceof ContactTeamCommand)).toEqual(
      new ContactTeamCommand(
        names().map((name) => COMPANY.find((employee) => employee.displayName === name) as Employee),
        'chat',
        "Anna Lund's team in London",
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'See the whole team' }));
    expect(onShowWholeTeam).toHaveBeenCalledOnce();
  });

  it('takes the focus to its heading as it opens, as the button that opened it was in the details', () => {
    renderTeam();

    expect(document.activeElement).toBe(within(panel()).getByRole('heading', { level: 2 }));
  });

  it('switches between a list and a photo board with two radio buttons', () => {
    const { onLayoutChange } = renderTeam();
    const group = screen.getByRole('group', { name: 'Show as' });
    const [list, board] = within(group).getAllByRole<HTMLInputElement>('radio');
    expect([list?.checked, board?.checked]).toEqual([true, false]);
    expect(within(group).getByRole('radio', { name: 'List' })).toBe(list);

    fireEvent.click(within(group).getByRole('radio', { name: 'Photo board' }));

    expect(onLayoutChange).toHaveBeenCalledExactlyOnceWith('board');
    expect(board?.checked).toBe(true);
    const photo = screen.getByRole('button', { name: 'Bo Sund' }).querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(photo?.style.width).toBe('64px');
  });

  it('opens a person of the team, and goes back to the manager\'s details with Back', () => {
    const { onOpen, onBack } = renderTeam();

    fireEvent.click(screen.getByRole('button', { name: 'Kari Dahl' }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('kari');

    const back = screen.getByRole('button', { name: 'Back to the details for Anna Lund' });
    expect(back.textContent).toBe('Back');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('closes with its Close button and with Escape', () => {
    const { onClose } = renderTeam();

    fireEvent.click(screen.getByRole('button', { name: 'Close the team list' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('lists the team of the chart it is given, which a refresh or other filters change', () => {
    const { show } = renderTeam();

    show(chartOf(COMPANY.filter((employee) => employee.id !== 'kari')));

    expect(names()).toEqual(['Bo Sund', 'Ola Berg']);
    expect(panel().textContent).toContain('2 people');
  });

  it('shows at most 300 of a large team, with a field to narrow it down', () => {
    const agents = Array.from({ length: 304 }, (_, index) => makeEmployee(`agent${String(index).padStart(3, '0')}`, 'anna'));
    renderTeam(chartOf([...COMPANY.slice(0, 2), ...agents]));

    expect(names()).toHaveLength(300);
    expect(panel().textContent).toContain('304 people');
    expect(screen.getByText('The first 300 of 304 people are listed. Narrow the list to find the others.')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Narrow the list' }), { target: { value: 'agent303' } });
    expect(names()).toEqual(['Agent303']);
  });
});
