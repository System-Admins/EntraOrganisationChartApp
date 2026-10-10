// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { ContactEmployeeCommand } from '@/application/features/contact/contactEmployee';
import { GetPresencesQuery } from '@/application/features/presence/getPresences';
import type { Employee } from '@/domain/employees/employee';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import type { Presence } from '@/domain/presence/presence';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { makePresence } from '@/testing/makePresence';
import { DisplayOptionsProvider } from '../../shared/displayOptions';
import { MediatorProvider } from '../../shared/mediatorContext';
import { syncTheme } from '../../theme/themeSync';
import { DETAILS_PANEL_ID } from '../employeeDetails/detailsPanelId';
import { PresenceProvider } from '../presence/presenceContext';
import { ChartViewStore } from './chartViewStore';
import { OrgChartCanvas } from './OrgChartCanvas';
import { revealTargetOf } from './treeItems';
import type { FocusOptions } from './useZoom';

const chart = buildOrgChart(
  [
    makeEmployee('ceo', null, {
      businessPhone: '+47 123 45 678',
      jobTitle: 'CEO',
      department: 'Management',
      officeLocation: 'Oslo HQ',
    }),
    makeEmployee('lead', 'ceo', { jobTitle: null, department: null, mail: null }),
    makeEmployee('dev', 'lead'),
  ],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

/** A person without a manager beside the top person: a flagged root. */
const flaggedChart = buildOrgChart([makeEmployee('ceo'), makeEmployee('stray', null, { officeLocation: 'Oslo HQ' })], {
  topPersons: ['ceo'],
  hide: SHOW_EVERYONE,
});

/** Names that start alike, for the letters typed in the chart; Bjørn has a team of his own. */
const namedChart = buildOrgChart(
  [
    makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
    makeEmployee('anders', 'ceo', { displayName: 'Anders Dahl' }),
    makeEmployee('anna', 'ceo', { displayName: 'Anna Berg' }),
    makeEmployee('arne', 'ceo', { displayName: 'Arne Lie' }),
    makeEmployee('bjorn', 'ceo', { displayName: 'Bjørn Moen' }),
    makeEmployee('oystein', 'bjorn', { displayName: 'Øystein Holm' }),
  ],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

/** `count` people named in order, `prefix001` on, under `managerId`, or without a manager. */
const crowd = (prefix: string, count: number, managerId: string | null): Employee[] =>
  Array.from({ length: count }, (_, index) => makeEmployee(`${prefix}${String(index + 1).padStart(3, '0')}`, managerId));

/** A lead with 60 agents, a page and ten more; only the last agent has an office, which no card on the first page shows. */
const longTeam = buildOrgChart(
  [
    makeEmployee('ceo'),
    makeEmployee('lead', 'ceo'),
    ...crowd('agent', 59, 'lead'),
    makeEmployee('agent060', 'lead', { officeLocation: 'Oslo HQ' }),
  ],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

/** 130 agents under the CEO: two pages and thirty more. */
const bigTeam = buildOrgChart([makeEmployee('ceo'), ...crowd('agent', 130, 'ceo')], { topPersons: ['ceo'], hide: SHOW_EVERYONE });

/** Beside the CEO, two people without a manager and one whose manager is gone. */
const flaggedGroups = buildOrgChart(
  [makeEmployee('ceo'), makeEmployee('stray'), makeEmployee('wanderer'), makeEmployee('orphan', 'gone')],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);

/** Sixty agents under the CEO, and a person without a manager beside them. */
const pagedAndFlagged = buildOrgChart([makeEmployee('ceo'), ...crowd('agent', 60, 'ceo'), makeEmployee('stray')], {
  topPersons: ['ceo'],
  hide: SHOW_EVERYONE,
});

type FocusSpy = ReturnType<typeof vi.fn<(element: HTMLElement, options: FocusOptions) => void>>;

interface HarnessProps {
  readonly chart: OrgChart;
  readonly store: ChartViewStore;
  readonly zoom: number;
  readonly onFocus: FocusSpy;
  readonly onSearchShortcut: () => void;
  readonly onExpandSiblings: (unfolded: number, folded: number, groups: boolean) => void;
}

/** Owns the viewport element the way OrgChartPage does, so the canvas effects run. */
function Harness({ chart, store, zoom, onFocus, onSearchShortcut, onExpandSiblings }: HarnessProps) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  return (
    <OrgChartCanvas
      chart={chart}
      store={store}
      zoom={zoom}
      viewport={viewport}
      viewportRef={setViewport}
      onFocus={onFocus}
      label="Org"
      onSearchShortcut={onSearchShortcut}
      onExpandSiblings={onExpandSiblings}
    />
  );
}

interface RenderOptions {
  readonly shown?: OrgChart;
  readonly zoom?: number;
  /** Everyone's Teams presence; without it presence is switched off. */
  readonly presence?: Presence;
  readonly showLevels?: boolean;
}

function renderChart(expandDepth: number, { shown = chart, zoom = 1, presence, showLevels = false }: RenderOptions = {}) {
  const store = new ChartViewStore(expandDepth);
  const onFocus: FocusSpy = vi.fn();
  const onSearchShortcut = vi.fn<() => void>();
  const onExpandSiblings = vi.fn<(unfolded: number, folded: number, groups: boolean) => void>();
  const sent: Request<unknown>[] = [];
  const answer = (request: Request<unknown>) =>
    presence && request instanceof GetPresencesQuery ? new Map(request.employeeIds.map((id) => [id, presence])) : undefined;
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      sent.push(request);
      return Promise.resolve(answer(request) as T);
    },
  };
  const { container } = render(
    <MediatorProvider mediator={mediator}>
      <DisplayOptionsProvider value={{ showLevels }}>
        <PresenceProvider enabled={presence !== undefined}>
          <Harness
            chart={shown}
            store={store}
            zoom={zoom}
            onFocus={onFocus}
            onSearchShortcut={onSearchShortcut}
            onExpandSiblings={onExpandSiblings}
          />
        </PresenceProvider>
      </DisplayOptionsProvider>
    </MediatorProvider>,
  );
  return { store, sent, onFocus, onSearchShortcut, onExpandSiblings, container };
}

const card = (name: string) => screen.getByRole('treeitem', { name });

/** The text that aria-describedby points at, part by part. */
const descriptionOf = (item: HTMLElement) =>
  (item.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent);

/** The cards that only measure how tall a card gets. */
const measuringCards = (container: HTMLElement) => [...(container.querySelector('[inert]')?.children ?? [])];

beforeAll(() => {
  // jsdom lacks these browser APIs.
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(cleanup);

describe('OrgChartCanvas', () => {
  it('shows name, job title, department, e-mail, phone and office on the card', () => {
    renderChart(0);

    const text = card('Ceo').textContent;
    expect(text).toContain('CEO');
    expect(text).toContain('Management');
    expect(text).toContain('ceo@contoso.com');
    expect(text).toContain('Oslo HQ');
    expect(screen.getByRole('link', { name: /\+47 123 45 678/ }).getAttribute('href')).toBe('tel:+4712345678');
  });

  it('leaves out fields that are not filled in', () => {
    renderChart(1);

    const lead = card('Lead');
    expect(lead.textContent).not.toContain('Engineer');
    expect(lead.textContent).not.toContain('@');
    expect(lead.textContent).not.toContain('Office');
  });

  it('folds, unfolds and selects when a card is clicked or activated with the keyboard', () => {
    const { store } = renderChart(1);
    expect(card('Ceo').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('treeitem', { name: 'Dev' })).toBeNull();

    fireEvent.click(card('Lead'));
    expect(card('Dev')).toBeTruthy();
    expect(store.selectedId).toBe('lead');

    fireEvent.keyDown(card('Ceo'), { key: 'Enter' });
    expect(screen.queryByRole('treeitem', { name: 'Lead' })).toBeNull();
    expect(card('Ceo').getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(card('Ceo'), { key: ' ' });
    expect(card('Lead')).toBeTruthy();
    // The keys of a button inside a card are the button's own.
    fireEvent.keyDown(within(card('Lead')).getByRole('button', { name: '1 direct report' }), { key: 'Enter' });
    expect(store.selectedId).toBe('ceo');
  });

  it('zooms to the whole branch when unfolding and centres the card otherwise, on every click', () => {
    const { onFocus } = renderChart(1);

    fireEvent.click(card('Lead'));
    const [unfoldTarget, unfoldOptions] = onFocus.mock.calls[0] ?? [];
    expect(unfoldTarget?.tagName).toBe('LI');
    expect(unfoldTarget?.contains(card('Lead'))).toBe(true);
    expect(unfoldTarget?.contains(card('Dev'))).toBe(true);
    expect(unfoldOptions).toEqual({ fit: true, minZoom: 0.5, maxZoom: 1, align: 'centre' });

    fireEvent.click(card('Lead'));
    expect(onFocus).toHaveBeenLastCalledWith(card('Lead'), { fit: false, align: 'centre' });

    fireEvent.click(card('Lead'));
    expect(onFocus).toHaveBeenCalledTimes(3);
  });

  it('starts an e-mail without folding the card, and leaves chat to the details panel', () => {
    const { sent } = renderChart(1);

    fireEvent.click(screen.getByRole('button', { name: /E-mail.*ceo@contoso\.com/ }));

    const commands = sent.filter((request) => request instanceof ContactEmployeeCommand);
    expect(commands.map(({ employee, channel }) => [employee.id, channel])).toEqual([['ceo', 'email']]);
    expect(card('Ceo').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('button', { name: /chat/i })).toBeNull();
  });

  it('reveals a search hit by expanding its ancestors, focusing it and marking it', () => {
    const { store, onFocus } = renderChart(0);

    act(() => {
      store.revealEmployee({ id: 'dev', ancestorIds: ['ceo', 'lead'] });
    });

    const dev = card('Dev');
    expect(dev.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(dev);
    expect(dev.querySelector('[class*="pulse"]')).not.toBeNull();
    expect(onFocus).toHaveBeenLastCalledWith(dev, { fit: false, minZoom: 0.75, align: 'centre' });
  });

  it('folds and unfolds from the report badge without selecting the person', () => {
    const { store, onFocus } = renderChart(1);
    const badge = within(card('Lead')).getByRole('button', { name: '1 direct report' });

    fireEvent.click(badge);

    expect(card('Lead').getAttribute('aria-expanded')).toBe('true');
    expect(badge.getAttribute('aria-expanded')).toBe('true');
    expect(card('Lead').getAttribute('aria-selected')).toBe('false');
    expect(store.selectedId).toBeNull();
    expect(onFocus).toHaveBeenLastCalledWith(card('Lead').parentElement, expect.objectContaining({ fit: true }));

    fireEvent.click(badge);

    expect(card('Lead').getAttribute('aria-expanded')).toBe('false');
    expect(store.selectedId).toBeNull();
  });

  it('shows each card\'s level where levels are switched on, which assistive technology gets from aria-level', () => {
    const { container } = renderChart(1, { showLevels: true });

    expect(card('Ceo').textContent).toContain('Level 1');
    expect(card('Lead').textContent).toContain('Level 2');
    expect(card('Lead').getAttribute('aria-level')).toBe('2');
    for (const measured of measuringCards(container)) expect(measured.textContent).toContain('Level 1');
  });

  it('shows no level where levels are switched off, on the measuring cards either, and keeps aria-level', () => {
    const { container } = renderChart(1);

    expect(screen.getByRole('tree').textContent).not.toContain('Level');
    expect(card('Ceo').getAttribute('aria-level')).toBe('1');
    expect(card('Lead').getAttribute('aria-level')).toBe('2');
    expect(measuringCards(container)).toHaveLength(2);
    for (const measured of measuringCards(container)) expect(measured.textContent).not.toContain('Level');
  });

  it('marks only revealed cards, not clicked ones', () => {
    renderChart(1);

    fireEvent.click(card('Ceo'));

    expect(card('Ceo').querySelector('[class*="pulse"]')).toBeNull();
  });

  it('keeps exactly one card, and its buttons, in the tab order', () => {
    renderChart(1);
    const tabbable = () =>
      screen
        .getAllByRole('treeitem')
        .filter((item) => item.tabIndex === 0)
        .map((item) => document.getElementById(item.getAttribute('aria-labelledby') ?? '')?.textContent);

    const emailButton = (id: string) => screen.getByRole('button', { name: new RegExp(`E-mail.*${id}@contoso\\.com`) });

    expect(tabbable()).toEqual(['Ceo']);
    expect(emailButton('ceo').tabIndex).toBe(0);

    fireEvent.click(card('Lead'));
    fireEvent.click(card('Dev'));

    expect(tabbable()).toEqual(['Dev']);
    expect(emailButton('dev').tabIndex).toBe(0);
    expect(emailButton('ceo').tabIndex).toBe(-1);
  });

  it('moves, unfolds and folds with the arrow keys', () => {
    const { store } = renderChart(1);
    card('Ceo').focus();

    fireEvent.keyDown(card('Ceo'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(card('Lead'));

    fireEvent.keyDown(card('Lead'), { key: 'ArrowRight' });
    expect(card('Lead').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(card('Lead'));

    fireEvent.keyDown(card('Lead'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(card('Dev'));

    fireEvent.keyDown(card('Dev'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(card('Lead'));

    fireEvent.keyDown(card('Lead'), { key: 'ArrowLeft' });
    expect(card('Lead').getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(card('Lead'), { key: 'Home' });
    expect(document.activeElement).toBe(card('Ceo'));
    expect(store.selectedId).toBeNull();
  });

  it('frames a team unfolded with the arrow keys like one unfolded with a click', () => {
    const { onFocus } = renderChart(1);
    card('Lead').focus();

    fireEvent.keyDown(card('Lead'), { key: 'ArrowRight' });
    expect(onFocus).toHaveBeenLastCalledWith(card('Lead').parentElement, {
      fit: true,
      minZoom: 0.5,
      maxZoom: 1,
      align: 'centre',
    });

    fireEvent.keyDown(card('Lead'), { key: 'ArrowLeft' });
    expect(onFocus).toHaveBeenLastCalledWith(card('Lead'), { fit: false, align: 'centre' });
  });

  describe('typed letters', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('move to the next name that starts with the letter, round to the top, and frame the card as the arrows do', () => {
      const { onFocus } = renderChart(1, { shown: namedChart });
      card('Arne Lie').focus();

      const handled = !fireEvent.keyDown(card('Arne Lie'), { key: 'a' });

      expect(handled).toBe(true);
      expect(document.activeElement).toBe(card('Anders Dahl'));
      expect(onFocus).toHaveBeenLastCalledWith(card('Anders Dahl'), { fit: false, align: 'nearest' });
    });

    it('move on to the next name with the same letter as it is typed again', () => {
      renderChart(1, { shown: namedChart });
      card('Ingrid Solberg').focus();

      const reached = ['a', 'a', 'a', 'a'].map((key) => {
        fireEvent.keyDown(document.activeElement as HTMLElement, { key });
        return document.activeElement;
      });

      expect(reached).toEqual(['Anders Dahl', 'Anna Berg', 'Arne Lie', 'Anders Dahl'].map(card));
    });

    it('spell a name that starts with the same letter twice, rather than move on', () => {
      renderChart(1, {
        shown: buildOrgChart(
          [
            makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
            makeEmployee('aase', 'ceo', { displayName: 'Aase Lunde' }),
            makeEmployee('anders', 'ceo', { displayName: 'Anders Dahl' }),
            makeEmployee('arne', 'ceo', { displayName: 'Arne Lie' }),
          ],
          { topPersons: ['ceo'], hide: SHOW_EVERYONE },
        ),
      });
      card('Ingrid Solberg').focus();

      for (const key of ['a', 'a']) fireEvent.keyDown(document.activeElement as HTMLElement, { key });

      expect(document.activeElement).toBe(card('Aase Lunde'));
    });

    it('spell a name when typed in quick succession, and start over after half a second', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      renderChart(1, { shown: namedChart });
      card('Ingrid Solberg').focus();
      const type = (keys: string) => {
        for (const key of keys) fireEvent.keyDown(document.activeElement as HTMLElement, { key });
      };

      type('An');
      // Anders Dahl still starts with what has been typed.
      expect(document.activeElement).toBe(card('Anders Dahl'));
      type('n');
      expect(document.activeElement).toBe(card('Anna Berg'));

      vi.setSystemTime(Date.now() + 499);
      type('b');
      expect(document.activeElement).toBe(card('Anna Berg'));
      vi.setSystemTime(Date.now() + 501);
      type('b');
      expect(document.activeElement).toBe(card('Bjørn Moen'));
    });

    it('take in a space typed in quick succession, so a whole name can be typed, and leave a later space to press the card', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { store } = renderChart(1, {
        shown: buildOrgChart(
          [
            makeEmployee('ceo', null, { displayName: 'Ingrid Solberg' }),
            makeEmployee('bakke', 'ceo', { displayName: 'Anna Bakke' }),
            makeEmployee('per', 'bakke', { displayName: 'Per Moe' }),
            makeEmployee('silva', 'ceo', { displayName: 'Anna Silva' }),
            makeEmployee('liv', 'silva', { displayName: 'Liv Dahl' }),
          ],
          { topPersons: ['ceo'], hide: SHOW_EVERYONE },
        ),
      });
      card('Ingrid Solberg').focus();
      /** Whether the key was marked handled, which keeps a space from scrolling the page. */
      const press = (key: string) => !fireEvent.keyDown(document.activeElement as HTMLElement, { key });

      for (const key of 'anna') press(key);
      expect(document.activeElement).toBe(card('Anna Bakke'));
      expect(press(' ')).toBe(true);
      press('s');

      expect(document.activeElement).toBe(card('Anna Silva'));
      expect(store.selectedId).toBeNull();
      expect(card('Anna Bakke').getAttribute('aria-expanded')).toBe('false');

      vi.setSystemTime(Date.now() + 501);
      expect(press(' ')).toBe(true);
      expect(store.selectedId).toBe('silva');
      expect(card('Anna Silva').getAttribute('aria-expanded')).toBe('true');
    });

    it('find a name whatever its case and accents, among the cards on screen only', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      renderChart(1, { shown: namedChart });
      card('Ingrid Solberg').focus();
      /** A letter typed on the CEO's card a while after the one before. */
      const type = (key: string) => {
        vi.setSystemTime(Date.now() + 1000);
        fireEvent.keyDown(card('Ingrid Solberg'), { key });
      };

      type('o');
      // Øystein Holm is in Bjørn Moen's folded team.
      expect(document.activeElement).toBe(card('Ingrid Solberg'));

      fireEvent.keyDown(card('Bjørn Moen'), { key: 'ArrowRight' });
      for (const key of ['o', 'Ø']) {
        type(key);
        expect(document.activeElement, key).toBe(card('Øystein Holm'));
      }
      type('B');
      expect(document.activeElement).toBe(card('Bjørn Moen'));
    });

    it('are left to the browser and the system with Ctrl, Alt or Cmd, and while an input method composes', () => {
      renderChart(1, { shown: namedChart });
      card('Ingrid Solberg').focus();

      const unhandled = [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }].map((modifier) =>
        fireEvent.keyDown(card('Ingrid Solberg'), { key: 'a', ...modifier }),
      );

      expect(unhandled).toEqual([true, true, true, true]);
      expect(document.activeElement).toBe(card('Ingrid Solberg'));
    });
  });

  it('unfolds the teams beside the card with \'*\', keeping the focus and the card in view', () => {
    const { store, onFocus, onExpandSiblings } = renderChart(1, { shown: namedChart });
    card('Anders Dahl').focus();

    const handled = !fireEvent.keyDown(card('Anders Dahl'), { key: '*' });

    expect(handled).toBe(true);
    expect(card('Bjørn Moen').getAttribute('aria-expanded')).toBe('true');
    expect(card('Øystein Holm')).toBeTruthy();
    expect(onExpandSiblings).toHaveBeenCalledExactlyOnceWith(1, 1, false);
    expect(document.activeElement).toBe(card('Anders Dahl'));
    expect(onFocus).toHaveBeenLastCalledWith(card('Anders Dahl'), { fit: false, align: 'centre' });
    expect(store.selectedId).toBeNull();

    fireEvent.keyDown(card('Anders Dahl'), { key: '*' });
    expect(onExpandSiblings).toHaveBeenLastCalledWith(0, 0, false);
  });

  it('unfolds the teams of everyone at the top with \'*\' on a card there, top persons side by side', () => {
    const coLeaders = buildOrgChart(
      [
        makeEmployee('kari', null, { displayName: 'Kari Nord' }),
        makeEmployee('per', 'kari', { displayName: 'Per Ås' }),
        makeEmployee('liv', null, { displayName: 'Liv Sand' }),
        makeEmployee('ola', 'liv', { displayName: 'Ola Strand' }),
      ],
      { topPersons: ['kari', 'liv'], hide: SHOW_EVERYONE },
    );
    const { onExpandSiblings } = renderChart(0, { shown: coLeaders });
    expect(screen.queryByRole('treeitem', { name: 'Ola Strand' })).toBeNull();
    card('Kari Nord').focus();

    fireEvent.keyDown(card('Kari Nord'), { key: '*' });

    expect([card('Kari Nord'), card('Liv Sand')].map((item) => item.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    expect(card('Per Ås')).toBeTruthy();
    expect(card('Ola Strand')).toBeTruthy();
    expect(onExpandSiblings).toHaveBeenCalledExactlyOnceWith(2, 2, false);
    expect(document.activeElement).toBe(card('Kari Nord'));
  });

  it('unfolds no team with \'*\' that would put more cards on screen than Expand all does', () => {
    const leads = crowd('lead', 50, 'big');
    const crowded = buildOrgChart(
      [
        makeEmployee('ceo'),
        makeEmployee('big', 'ceo'),
        makeEmployee('small', 'ceo'),
        makeEmployee('helper', 'small'),
        ...leads,
        ...leads.flatMap(({ id }) => crowd(`${id}dev`, 50, id)),
      ],
      { topPersons: ['ceo'], hide: SHOW_EVERYONE },
    );
    const { store, onExpandSiblings } = renderChart(1, { shown: crowded });
    // Big's leads unfolded already, whose teams unfolding Big would bring back: fifty pages of fifty people.
    act(() => {
      store.expandMany(
        leads.map(({ id }) => id),
        'small',
      );
    });
    card('Small').focus();

    fireEvent.keyDown(card('Small'), { key: '*' });

    expect(card('Small').getAttribute('aria-expanded')).toBe('true');
    expect(card('Big').getAttribute('aria-expanded')).toBe('false');
    expect(onExpandSiblings).toHaveBeenCalledExactlyOnceWith(1, 2, false);
  });

  it('hands \'/\' to the page, to go to the search, and keeps it from the browser', () => {
    const { onSearchShortcut } = renderChart(1);
    card('Lead').focus();

    const handled = !fireEvent.keyDown(card('Lead'), { key: '/' });

    expect(handled).toBe(true);
    expect(onSearchShortcut).toHaveBeenCalledOnce();
  });

  it('names a card by the person alone and describes it with the warning, job title and department', () => {
    renderChart(1, { shown: flaggedChart });

    expect(descriptionOf(card('Stray'))).toEqual(['No manager set', 'Engineer', 'Engineering']);
    expect(descriptionOf(card('Ceo'))).toEqual(['Engineer', 'Engineering']);
  });

  it('gives a card without those lines no description', () => {
    renderChart(1);

    expect(card('Lead').hasAttribute('aria-describedby')).toBe(false);
  });

  it('adds the Teams presence to the description, not to the name', async () => {
    const { sent } = renderChart(0, { presence: makePresence({ availability: 'busy', activity: 'InACall' }) });

    await waitFor(() => {
      expect(descriptionOf(card('Ceo'))).toEqual(['CEO', 'Management', 'Busy · In a call']);
    });
    // Only the person shown is followed: the measuring cards stand for nobody.
    const followed = sent.filter((request) => request instanceof GetPresencesQuery).flatMap((request) => request.employeeIds);
    expect(followed).toEqual(['ceo']);
  });

  it('leaves the Teams note, the automatic reply and the work location out of the card, which the details panel shows', async () => {
    const presence = makePresence({
      availability: 'offline',
      activity: 'OutOfOffice',
      outOfOffice: true,
      outOfOfficeMessage: 'I am on holiday.',
      statusMessage: 'Back on Monday',
      workLocation: 'timeOff',
    });
    renderChart(0, { presence });

    await waitFor(() => {
      expect(descriptionOf(card('Ceo'))).toEqual(['CEO', 'Management', 'Out of office · Offline']);
    });
    expect(card('Ceo').textContent).not.toMatch(/holiday|Monday|Time off/);
  });

  it('points the selected card, and only that one, at the details panel', () => {
    renderChart(1);
    expect(card('Ceo').hasAttribute('aria-controls')).toBe(false);

    fireEvent.click(card('Lead'));

    expect(card('Lead').getAttribute('aria-controls')).toBe(DETAILS_PANEL_ID);
    expect(card('Ceo').hasAttribute('aria-controls')).toBe(false);
  });

  it('tells the stylesheet the zoom, which keeps the focus ring as wide on screen at every zoom level', () => {
    renderChart(0, { zoom: 0.62 });

    expect(screen.getByRole('tree').parentElement?.style.getPropertyValue('--chart-zoom')).toBe('0.62');
  });

  it('measures the card height on hidden cards with every line that someone has, outside the tree', () => {
    const { container } = renderChart(0, { shown: flaggedChart });
    const probes = container.querySelector('[inert]');
    const [measured] = measuringCards(container);

    expect(probes?.getAttribute('aria-hidden')).toBe('true');
    expect(probes?.closest('[role="tree"]')).toBeNull();
    expect(measuringCards(container)).toHaveLength(2);
    expect(measured?.textContent).toContain('No manager set');
    // Ceo has the job title, department and e-mail; only Stray has an office and the warning.
    expect(measured?.textContent).toContain('Office:');
    expect(measured?.textContent).not.toContain('Phone:');
    // Every person's card in the tree, and only those; the heading over Stray is nobody.
    expect(container.querySelectorAll('[data-employee-id]')).toHaveLength(screen.getAllByRole('treeitem').length - 1);
    expect(probes?.querySelector('[role="treeitem"], [data-employee-id], img')).toBeNull();
  });

  it('hands the measured heights to the cards, and again when the measuring cards change size', () => {
    let height = 150;
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.closest('[inert]') ? height : 0 } as DOMRect;
    });
    const resized: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized.push(callback);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    try {
      renderChart(0);
      const canvas = screen.getByRole('tree').parentElement;

      // A pixel more than measured, so that the fullest card also ends at the minimum.
      expect(canvas?.style.getPropertyValue('--card-body-height-tree')).toBe('151px');
      expect(canvas?.style.getPropertyValue('--card-body-height-outline')).toBe('151px');

      height = 172;
      for (const notify of resized) notify();

      expect(canvas?.style.getPropertyValue('--card-body-height-tree')).toBe('173px');
    } finally {
      measure.mockRestore();
      // jsdom has none; unstubbing every global would also drop matchMedia.
      vi.stubGlobal('ResizeObserver', undefined);
    }
  });

  it('measures the cards in the text size chosen, and in the standard size for paper, which syncTheme sets as printing starts', () => {
    /** A measuring card's body in each text size, as the stylesheets would lay it out. */
    const bodies: Readonly<Record<string, number>> = { standard: 120, large: 136, larger: 152 };
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { height: this.closest('[inert]') ? (bodies[document.documentElement.dataset.textSize ?? ''] ?? 0) : 0 } as DOMRect;
    });
    const resized: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized.push(callback);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const themeListening = new AbortController();
    try {
      // As start.tsx does, before the chart registers its own print listeners.
      const setTheme = syncTheme(
        { preference: 'light', textSize: 'larger' },
        { theme: null, onThemeChange: () => undefined },
        {},
        themeListening.signal,
      );
      renderChart(0);
      const treeHeight = () => screen.getByRole('tree').parentElement?.style.getPropertyValue('--card-body-height-tree');
      expect(treeHeight()).toBe('153px');

      // The stylesheets resize the measuring cards, which the observer reports.
      setTheme({ preference: 'light', textSize: 'large' });
      for (const notify of resized) notify();
      expect(treeHeight()).toBe('137px');

      // The browser copies the page for paper before any observer answers.
      window.dispatchEvent(new Event('beforeprint'));
      expect(treeHeight()).toBe('121px');
      window.dispatchEvent(new Event('afterprint'));
      expect(treeHeight()).toBe('137px');
    } finally {
      themeListening.abort();
      measure.mockRestore();
      vi.stubGlobal('ResizeObserver', undefined);
      delete document.documentElement.dataset.theme;
      delete document.documentElement.dataset.textSize;
    }
  });

  describe('with someone the address list hides', () => {
    /** The head of audit, whom the address list hides, over an auditor who is listed, beside Nina. */
    const hiddenHead = buildOrgChart(
      [
        makeEmployee('ceo'),
        makeEmployee('nina', 'ceo'),
        makeEmployee('auditHead', 'ceo', {
          displayName: 'Hanne Hidden',
          jobTitle: 'Head of Internal Audit',
          businessPhone: '+47 123 45 678',
          hiddenFromAddressList: true,
        }),
        makeEmployee('auditor', 'auditHead'),
      ],
      { topPersons: ['ceo'], hide: { ...SHOW_EVERYONE, hiddenFromAddressList: true } },
    );
    const place = () => card('Not in the address list');

    it('holds their place with a card that names, shows and reaches nothing of them, over the team below it', async () => {
      const { sent } = renderChart(1, { shown: hiddenHead, presence: makePresence() });

      await waitFor(() => {
        expect(descriptionOf(card('Nina'))).toContain('Available');
      });
      expect(place().textContent).not.toMatch(/Hanne|Audit|contoso|\+47/);
      expect(place().hasAttribute('aria-describedby')).toBe(false);
      expect(place().hasAttribute('aria-selected')).toBe(false);
      // Found by the tree's keys as a heading is, and passed over by printing, which loads the photos of people's cards.
      expect([place().dataset.treeKey, place().dataset.employeeId]).toEqual(['auditHead', undefined]);
      expect(within(place()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['1 direct report']);
      const followed = sent.filter((request) => request instanceof GetPresencesQuery).flatMap((request) => request.employeeIds);
      expect(followed).not.toContain('auditHead');
    });

    it('folds and unfolds that card with a click, Enter or Space, and selects nobody', () => {
      const { store } = renderChart(1, { shown: hiddenHead });

      fireEvent.click(place());
      expect(card('Auditor')).toBeTruthy();
      fireEvent.keyDown(place(), { key: 'Enter' });
      expect(screen.queryByRole('treeitem', { name: 'Auditor' })).toBeNull();
      fireEvent.keyDown(place(), { key: ' ' });
      expect(place().getAttribute('aria-expanded')).toBe('true');

      expect(store.selectedId).toBeNull();
      expect(place().tabIndex).toBe(0);
    });

    it('is reached with the arrow keys, and passed over by typed letters, as it has no name', () => {
      renderChart(1, { shown: hiddenHead });
      card('Ceo').focus();

      const reached = ['n', 'n'].map((key) => {
        fireEvent.keyDown(document.activeElement as HTMLElement, { key });
        return document.activeElement;
      });
      fireEvent.keyDown(card('Nina'), { key: 'ArrowDown' });

      expect(reached).toEqual([card('Nina'), card('Nina')]);
      expect(document.activeElement).toBe(place());
    });
  });

  describe('with long teams and flagged people', () => {
    const cardsOf = (prefix: string) => screen.getAllByRole('treeitem').filter((item) => item.dataset.employeeId?.startsWith(prefix));
    /** A tree item's place in its list, the list's size and the item's level, as assistive technology gets them. */
    const placeOf = (item: HTMLElement) => ['aria-posinset', 'aria-setsize', 'aria-level'].map((name) => item.getAttribute(name));

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows a long team fifty at a time, numbering each card among all of them, then Show more as the next of them', () => {
      renderChart(2, { shown: longTeam });

      expect(cardsOf('agent').map((agent) => agent.getAttribute('aria-posinset'))).toEqual(
        Array.from({ length: 50 }, (_, index) => String(index + 1)),
      );
      expect(placeOf(card('Agent050'))).toEqual(['50', '60', '3']);
      const more = screen.getByRole('treeitem', { name: 'Show 10 more' });
      expect(placeOf(more)).toEqual(['51', '60', '3']);
      // Nobody to select, and nothing to fold.
      expect(more.hasAttribute('aria-selected')).toBe(false);
      expect(more.hasAttribute('aria-expanded')).toBe(false);
      expect(within(card('Lead')).getByRole('button', { name: '60 direct reports' })).toBeTruthy();
    });

    it('says how many people a long team leaves out where they are more than its next page', () => {
      renderChart(1, { shown: bigTeam });

      expect(screen.getByRole('treeitem', { name: 'Show 50 more (80 not shown)' })).toBeTruthy();
    });

    it('shows the next page from Show more, with a click or the keyboard, taking the focus to the first person it adds', () => {
      const { store, onFocus } = renderChart(1, { shown: bigTeam });

      fireEvent.click(screen.getByRole('treeitem', { name: 'Show 50 more (80 not shown)' }));

      expect(document.activeElement).toBe(card('Agent051'));
      expect(onFocus).toHaveBeenLastCalledWith(card('Agent051'), { fit: false, align: 'nearest' });
      expect(cardsOf('agent')).toHaveLength(100);
      const rest = screen.getByRole('treeitem', { name: 'Show 30 more' });
      rest.focus();
      fireEvent.keyDown(rest, { key: 'Enter' });

      expect(document.activeElement).toBe(card('Agent101'));
      expect(cardsOf('agent')).toHaveLength(130);
      expect(screen.queryByRole('treeitem', { name: /^Show/ })).toBeNull();
      expect(store.selectedId).toBeNull();
    });

    it('reveals a person past the page, showing as many pages as it takes', () => {
      const { store } = renderChart(0, { shown: bigTeam });

      act(() => {
        store.revealEmployee(revealTargetOf(bigTeam, 'agent077'));
      });

      expect(document.activeElement).toBe(card('Agent077'));
      expect(card('Agent077').getAttribute('aria-selected')).toBe('true');
      expect(placeOf(card('Agent077'))).toEqual(['77', '130', '2']);
      expect(screen.getByRole('treeitem', { name: 'Show 30 more' })).toBeTruthy();
    });

    it('gathers flagged people under a heading per flag, named with their number, a level above them', () => {
      renderChart(1, { shown: flaggedGroups });

      const noManager = screen.getByRole('treeitem', { name: 'No manager set (2 people)' });
      const notShown = screen.getByRole('treeitem', { name: 'Manager not shown (1 person)' });
      expect([card('Ceo'), noManager, notShown].map(placeOf)).toEqual([
        ['1', '3', '1'],
        ['2', '3', '1'],
        ['3', '3', '1'],
      ]);
      expect([card('Stray'), card('Wanderer'), card('Orphan')].map(placeOf)).toEqual([
        ['1', '2', '2'],
        ['2', '2', '2'],
        ['1', '1', '2'],
      ]);
      expect(noManager.getAttribute('aria-expanded')).toBe('true');
      expect(noManager.hasAttribute('aria-selected')).toBe(false);
      expect(document.getElementById(noManager.getAttribute('aria-owns') ?? '')?.contains(card('Stray'))).toBe(true);
    });

    it('folds and unfolds a heading with a click, Enter or Space, and never selects anyone', () => {
      const { store } = renderChart(1, { shown: flaggedGroups });
      const heading = () => screen.getByRole('treeitem', { name: 'No manager set (2 people)' });

      fireEvent.click(heading());
      expect(heading().getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('treeitem', { name: 'Stray' })).toBeNull();
      fireEvent.keyDown(heading(), { key: 'Enter' });
      expect(card('Stray')).toBeTruthy();
      fireEvent.keyDown(heading(), { key: ' ' });
      expect(heading().getAttribute('aria-expanded')).toBe('false');

      expect(store.selectedId).toBeNull();
      expect(screen.getAllByRole('treeitem').filter((item) => item.getAttribute('aria-selected') === 'true')).toEqual([]);
      expect(heading().tabIndex).toBe(0);
    });

    it('starts a heading over more than fifty people folded, and pages the people under it once unfolded', () => {
      renderChart(1, {
        shown: buildOrgChart([makeEmployee('ceo'), ...crowd('stray', 60, null)], { topPersons: ['ceo'], hide: SHOW_EVERYONE }),
      });
      const heading = screen.getByRole('treeitem', { name: 'No manager set (60 people)' });
      expect(heading.getAttribute('aria-expanded')).toBe('false');
      heading.focus();

      fireEvent.keyDown(heading, { key: 'ArrowRight' });
      expect(heading.getAttribute('aria-expanded')).toBe('true');
      expect(cardsOf('stray')).toHaveLength(50);
      expect(placeOf(screen.getByRole('treeitem', { name: 'Show 10 more' }))).toEqual(['51', '60', '2']);

      fireEvent.keyDown(heading, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(card('Stray001'));
      fireEvent.keyDown(card('Stray001'), { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(heading);
    });

    it('moves over headings and Show more with the arrow keys, Home and End, as over any card, and up to the manager', () => {
      renderChart(1, { shown: pagedAndFlagged });
      const heading = screen.getByRole('treeitem', { name: 'No manager set (1 person)' });
      const more = screen.getByRole('treeitem', { name: 'Show 10 more' });
      card('Ceo').focus();

      fireEvent.keyDown(card('Ceo'), { key: 'End' });
      expect(document.activeElement).toBe(card('Stray'));
      fireEvent.keyDown(card('Stray'), { key: 'ArrowUp' });
      expect(document.activeElement).toBe(heading);
      fireEvent.keyDown(heading, { key: 'ArrowUp' });
      expect(document.activeElement).toBe(more);
      // Show more has nothing to unfold; Left goes up to the manager whose list it ends.
      fireEvent.keyDown(more, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(more);
      fireEvent.keyDown(more, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(card('Ceo'));
    });

    it('reaches a heading and Show more with typed letters, by the words they start with', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      renderChart(1, { shown: pagedAndFlagged });
      card('Ceo').focus();
      /** A letter typed a while after the one before. */
      const type = (key: string) => {
        vi.setSystemTime(Date.now() + 1000);
        fireEvent.keyDown(document.activeElement as HTMLElement, { key });
      };

      type('s');
      expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'Show 10 more' }));
      type('s');
      expect(document.activeElement).toBe(card('Stray'));
      type('n');
      expect(document.activeElement).toBe(screen.getByRole('treeitem', { name: 'No manager set (1 person)' }));
    });

    it('unfolds with \'*\' on a heading the groups of the headings beside it, which it tells apart from teams', () => {
      const { onExpandSiblings } = renderChart(1, {
        shown: buildOrgChart([makeEmployee('ceo'), ...crowd('stray', 60, null), ...crowd('orphan', 55, 'gone')], {
          topPersons: ['ceo'],
          hide: SHOW_EVERYONE,
        }),
      });
      const noManager = screen.getByRole('treeitem', { name: 'No manager set (60 people)' });
      const notShown = screen.getByRole('treeitem', { name: 'Manager not shown (55 people)' });
      noManager.focus();

      fireEvent.keyDown(noManager, { key: '*' });

      expect([noManager, notShown].map((heading) => heading.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
      expect(onExpandSiblings).toHaveBeenCalledExactlyOnceWith(2, 2, true);
      expect(document.activeElement).toBe(noManager);
    });

    it('unfolds with \'*\' the teams of the people a page shows, and none past it, also from Show more', () => {
      const { store, onExpandSiblings } = renderChart(1, {
        shown: buildOrgChart(
          [makeEmployee('ceo'), ...crowd('agent', 60, 'ceo'), makeEmployee('aide', 'agent010'), makeEmployee('helper', 'agent055')],
          { topPersons: ['ceo'], hide: SHOW_EVERYONE },
        ),
      });
      card('Agent001').focus();

      fireEvent.keyDown(card('Agent001'), { key: '*' });

      expect(card('Agent010').getAttribute('aria-expanded')).toBe('true');
      expect(card('Aide')).toBeTruthy();
      expect(store.isExpanded('agent055', 1)).toBe(false);
      expect(onExpandSiblings).toHaveBeenCalledExactlyOnceWith(1, 1, false);

      fireEvent.keyDown(screen.getByRole('treeitem', { name: 'Show 10 more' }), { key: '*' });
      expect(onExpandSiblings).toHaveBeenLastCalledWith(0, 0, false);
    });

    it('puts the first heading in the tab order where nobody at the top goes without a flag', () => {
      renderChart(1, { shown: buildOrgChart([makeEmployee('orphan', 'gone')], { topPersons: [], hide: SHOW_EVERYONE }) });

      expect(screen.getByRole('treeitem', { name: 'Manager not shown (1 person)' }).tabIndex).toBe(0);
      expect(card('Orphan').tabIndex).toBe(-1);
    });

    it('measures the cards with the people past a page too, so that every card stays as tall as more are shown', () => {
      const { container } = renderChart(2, { shown: longTeam });

      expect(screen.queryByRole('treeitem', { name: 'Agent060' })).toBeNull();
      expect(measuringCards(container)).toHaveLength(2);
      for (const measured of measuringCards(container)) expect(measured.textContent).toContain('Office:');
    });

    it('tells paper that only the people shown print, and gives a list that goes on the number it leaves out there', () => {
      const { container } = renderChart(1, { shown: bigTeam });

      expect(container.querySelector('[class*="printNotice"]')?.textContent).toBe(
        'Only the people shown on screen are printed. Where a long list goes on, the number of people not shown takes their place.',
      );
      const more = screen.getByRole('treeitem', { name: 'Show 50 more (80 not shown)' });
      expect(within(more).getByText('80 not shown').getAttribute('aria-hidden')).toBe('true');
    });
  });
});
