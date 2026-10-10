// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildOrgChart } from '@/domain/orgChart/buildOrgChart';
import { departmentTree } from '@/domain/orgChart/departmentTree';
import { SHOW_EVERYONE } from '@/testing/hideRules';
import { makeEmployee } from '@/testing/makeEmployee';
import { ChartViewStore } from '../orgChart/chartViewStore';
import type { FocusOptions } from '../orgChart/useZoom';
import { DepartmentCanvas } from './DepartmentCanvas';

/** Management, with Finance and Strategy below it, Sales below Strategy, and an aide back in Management. */
const chart = buildOrgChart(
  [
    makeEmployee('ceo', null, { department: 'Management', displayName: 'Ingrid Solberg' }),
    makeEmployee('head', 'ceo', { department: 'Strategy', displayName: 'Hanna Lie' }),
    makeEmployee('lead', 'head', { department: 'Sales', displayName: 'Lars Moen' }),
    makeEmployee('rep', 'lead', { department: 'Sales', displayName: 'Rita Dahl' }),
    makeEmployee('cfo', 'ceo', { department: 'Finance', displayName: 'Finn Berg' }),
    makeEmployee('aide', 'head', { department: 'Management', displayName: 'Arne Vik' }),
  ],
  { topPersons: ['ceo'], hide: SHOW_EVERYONE },
);
const tree = departmentTree(chart);

function renderCanvas() {
  const store = new ChartViewStore(1);
  const onFocus = vi.fn<(element: HTMLElement, options: FocusOptions) => void>();
  const onExpandSiblings = vi.fn<(unfolded: number, folded: number) => void>();
  function Harness() {
    const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
    return (
      <DepartmentCanvas
        chart={chart}
        tree={tree}
        store={store}
        zoom={1}
        viewport={viewport}
        viewportRef={setViewport}
        onFocus={onFocus}
        label="Departments in Org"
        onSearchShortcut={vi.fn()}
        onExpandSiblings={onExpandSiblings}
      />
    );
  }
  render(<Harness />);
  return { store, onExpandSiblings };
}

const card = (name: string) => screen.getByRole('treeitem', { name });
/** What a card's aria-describedby points at, part by part. */
const descriptionOf = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);

beforeAll(() => {
  // jsdom lacks it.
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(cleanup);

describe('DepartmentCanvas', () => {
  it('shows the departments as a tree, those at the top unfolded, each named by the department and described by its people and leaders', () => {
    renderCanvas();

    expect(screen.getByRole('tree', { name: 'Departments in Org' })).toBeTruthy();
    expect(card('Management').getAttribute('aria-level')).toBe('1');
    expect(card('Management').getAttribute('aria-expanded')).toBe('true');
    expect(descriptionOf(card('Management'))).toEqual(['1 person', 'Led by Ingrid Solberg']);
    expect(within(card('Management')).getByRole('button', { name: '2 departments below' }).title).toBe('2 departments below, 6 people in all');
    expect(card('Finance').getAttribute('aria-level')).toBe('2');
    expect(card('Strategy').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('treeitem', { name: 'Sales' })).toBeNull();
  });

  it('folds or unfolds with a click, which selects the department, and with the badge, which selects nothing', () => {
    const { store } = renderCanvas();

    fireEvent.click(card('Strategy'));

    expect(card('Strategy').getAttribute('aria-expanded')).toBe('true');
    expect(card('Strategy').getAttribute('aria-selected')).toBe('true');
    expect(store.selectedId).toBe('management/strategy');
    expect(card('Sales')).toBeTruthy();

    fireEvent.click(within(card('Strategy')).getByRole('button', { name: '2 departments below' }));

    expect(card('Strategy').getAttribute('aria-expanded')).toBe('false');
    expect(store.selectedId).toBe('management/strategy');
  });

  it('moves with the arrow keys and finds a department by the letters typed', () => {
    renderCanvas();
    act(() => {
      card('Management').focus();
    });

    fireEvent.keyDown(card('Management'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(card('Finance'));
    fireEvent.keyDown(card('Finance'), { key: 's' });
    expect(document.activeElement).toBe(card('Strategy'));
    fireEvent.keyDown(card('Strategy'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(card('Management'));
  });

  it('unfolds the departments beside one with the asterisk key, and says how many', () => {
    const { onExpandSiblings } = renderCanvas();
    act(() => {
      card('Finance').focus();
    });

    fireEvent.keyDown(card('Finance'), { key: '*' });

    expect(card('Strategy').getAttribute('aria-expanded')).toBe('true');
    expect(onExpandSiblings).toHaveBeenCalledWith(1, 1);
  });

  it('marks a department that comes again below itself', () => {
    renderCanvas();
    fireEvent.click(card('Strategy'));

    const [, inner] = screen.getAllByRole('treeitem', { name: 'Management' });

    expect(inner && descriptionOf(inner)).toEqual(['Also higher up its path', '1 person', 'Led by Arne Vik']);
  });
});
