// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import { makeEmployee } from '@/testing/makeEmployee';
import { makePresence } from '@/testing/makePresence';
import { MediatorProvider } from '../../shared/mediatorContext';
import { PresenceProvider } from '../presence/presenceContext';
import { PeopleList, PEOPLE_LIST_CAP, type PeopleLayout, type PeopleListEntry } from './PeopleList';

const ASE = { employee: makeEmployee('ase', null, { displayName: 'Åse Vik', jobTitle: 'Team Lead', department: 'Retail Sales' }), detail: 'Team Lead' };
const OLA = { employee: makeEmployee('ola', null, { displayName: 'Ola Berg', jobTitle: 'Engineer', department: 'Øst' }), detail: 'Engineer' };
const KARI = { employee: makeEmployee('kari', null, { displayName: 'Kari Dahl', jobTitle: null, department: null }), detail: null };

/** The people given, then `count` support agents named P000, P001 and so on. */
function peopleOf(named: readonly PeopleListEntry[], count = 0): PeopleListEntry[] {
  const agents = Array.from({ length: count }, (_, index) => {
    const employee = makeEmployee(`p${String(index).padStart(3, '0')}`, null, { jobTitle: 'Support Agent', department: 'Support' });
    return { employee, detail: employee.jobTitle };
  });
  return [...named, ...agents];
}

interface Setup {
  readonly layout?: PeopleLayout;
  /** Teams status for everyone, Busy; without it presence is switched off. */
  readonly busy?: boolean;
  /** What a press does, where the list's place doesn't make it plain. */
  readonly action?: string;
}

function renderList(people: readonly PeopleListEntry[], { layout, busy = false, action }: Setup = {}) {
  const onOpen = vi.fn<(entry: PeopleListEntry) => void>();
  const mediator: Sender = {
    send: <T,>(request: Request<T>) =>
      Promise.resolve(
        (request instanceof GetPresencesQuery
          ? new Map(request.employeeIds.map((id) => [id, makePresence({ availability: 'busy' })]))
          : undefined) as T,
      ),
  };
  render(
    <MediatorProvider mediator={mediator}>
      <PresenceProvider enabled={busy}>
        <PeopleList people={people} label="The team" layout={layout} action={action} onOpen={onOpen} />
      </PresenceProvider>
    </MediatorProvider>,
  );
  return { onOpen };
}

const rows = () => within(screen.getByRole('list', { name: 'The team' })).getAllByRole('button');
/** The rows' names, which come from the person's name alone. */
const names = () => rows().map((row) => document.getElementById(row.getAttribute('aria-labelledby') ?? '')?.textContent);
const field = () => screen.getByRole('searchbox', { name: 'Narrow the list' });
const narrow = (text: string) => {
  fireEvent.change(field(), { target: { value: text } });
};

afterEach(cleanup);

describe('PeopleList', () => {
  it('lists each person as a button named after them alone and described by the line under the name', () => {
    renderList([ASE, OLA, KARI]);

    expect(names()).toEqual(['Åse Vik', 'Ola Berg', 'Kari Dahl']);
    expect(screen.getByRole('button', { name: 'Åse Vik', description: 'Team Lead' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kari Dahl' }).hasAttribute('aria-describedby')).toBe(false);
  });

  it('opens the person a row stands for', () => {
    const { onOpen } = renderList([ASE, OLA]);

    fireEvent.click(screen.getByRole('button', { name: 'Ola Berg' }));

    expect(onOpen).toHaveBeenCalledExactlyOnceWith(OLA);
  });

  it('describes each person\'s Teams status, which the photo shows, and keeps it out of the name', async () => {
    renderList([ASE], { busy: true });

    expect(await screen.findByRole('button', { name: 'Åse Vik', description: 'Team Lead Busy' })).toBeTruthy();
  });

  it('says at the end of each row what a press does, where the list is asked to, as part of the row\'s description', () => {
    renderList([ASE, KARI], { action: 'Show in chart' });

    expect(names()).toEqual(['Åse Vik', 'Kari Dahl']);
    expect(screen.getByRole('button', { name: 'Åse Vik', description: 'Team Lead Show in chart' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kari Dahl', description: 'Show in chart' }).textContent).toContain('Show in chart');
  });

  it('reads a short list at a glance, without a field to narrow it', () => {
    renderList(peopleOf([ASE], 9));

    expect(rows()).toHaveLength(10);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('narrows nothing with the text left in its field once the list has become short, as after a refresh', () => {
    const onOpen = vi.fn();
    const list = (people: readonly PeopleListEntry[]) => (
      <MediatorProvider mediator={{ send: <T,>() => Promise.resolve(undefined as T) }}>
        <PeopleList people={people} label="The team" onOpen={onOpen} />
      </MediatorProvider>
    );
    const { rerender } = render(list(peopleOf([ASE, OLA], 10)));
    narrow('vik');
    expect(names()).toEqual(['Åse Vik']);

    rerender(list(peopleOf([ASE, OLA], 3)));

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(rows()).toHaveLength(5);
  });

  describe('a long list', () => {
    it('narrows by name, job title or department, case, accents and letters such as ø aside, every word counting', () => {
      renderList(peopleOf([ASE, OLA, KARI], 10));

      narrow('ase');
      expect(names()).toEqual(['Åse Vik']);
      narrow('OST');
      expect(names()).toEqual(['Ola Berg']);
      narrow('support 007');
      expect(names()).toEqual(['P007']);
      narrow('engineer berg');
      expect(names()).toEqual(['Ola Berg']);
      narrow('');
      expect(rows()).toHaveLength(13);
    });

    it('describes the field by what it compares', () => {
      renderList(peopleOf([ASE, OLA, KARI], 10));

      expect(document.getElementById(field().getAttribute('aria-describedby') ?? '')?.textContent).toBe(
        'Finds people in the list by name, job title or department.',
      );
    });

    it('says how many people the field leaves, in a live region that is there before anything is typed', () => {
      renderList(peopleOf([ASE, OLA, KARI], 10));
      const status = screen.getByRole('status');
      expect(status.textContent).toBe('');

      narrow('vik');
      expect(status.textContent).toBe('1 of 13 people');
      narrow('zz');
      expect(status.textContent).toBe('No one in the list matches.');
      expect(screen.queryByRole('list')).toBeNull();
      narrow(' ');
      expect(status.textContent).toBe('');
    });

    it('clears the field with Escape, which then goes no further, and leaves an empty field\'s Escape to the panel', () => {
      renderList(peopleOf([], 11));
      narrow('p00');
      expect(rows()).toHaveLength(10);

      expect(fireEvent.keyDown(field(), { key: 'Escape' })).toBe(false);
      expect((field() as HTMLInputElement).value).toBe('');
      expect(rows()).toHaveLength(11);
      expect(fireEvent.keyDown(field(), { key: 'Escape' })).toBe(true);
    });

    it('shows at most 300 people, says so above them, and lets the field narrow down the rest', () => {
      renderList(peopleOf([OLA], PEOPLE_LIST_CAP + 4));

      expect(rows()).toHaveLength(PEOPLE_LIST_CAP);
      const note = screen.getByText('The first 300 of 305 people are listed. Narrow the list to find the others.');
      expect(note.compareDocumentPosition(screen.getByRole('list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(names()).not.toContain('P303');

      narrow('p303');
      expect(names()).toEqual(['P303']);
      expect(screen.queryByText(/are listed/)).toBeNull();
    });
  });

  it('lays the people out as a photo board, with larger photos', () => {
    const photoOf = () => screen.getByRole('button', { name: 'Åse Vik' }).querySelector<HTMLElement>('[aria-hidden="true"]');
    renderList([ASE], { layout: 'board' });
    expect(photoOf()?.style.width).toBe('64px');
    cleanup();

    renderList([ASE]);
    expect(photoOf()?.style.width).toBe('32px');
  });
});
