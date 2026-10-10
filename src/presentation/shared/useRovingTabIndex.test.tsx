// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useRovingTabIndex } from './useRovingTabIndex';

const NAMES = ['One', 'Two', 'Three', 'Four'] as const;
type Name = (typeof NAMES)[number];

function Toolbar({ disabled = [], extra = false }: { disabled?: readonly Name[]; extra?: boolean }) {
  const toolbar = useRovingTabIndex();
  return (
    <div role="toolbar" {...toolbar}>
      {NAMES.map((name) => (
        <button key={name} type="button" disabled={disabled.includes(name)}>
          {name}
        </button>
      ))}
      {extra && <button type="button">Extra</button>}
    </div>
  );
}

const button = (name: string) => screen.getByText<HTMLButtonElement>(name);
const tabStops = () => screen.getAllByRole('button', { hidden: true }).filter((item) => item.tabIndex === 0).map((item) => item.textContent);
const focused = () => document.activeElement?.textContent;

let layoutChanged: () => void = () => undefined;

beforeAll(() => {
  // jsdom lays nothing out: `hidden` stands in for a layout's display: none.
  HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
    return (this.closest('[hidden]') ? [] : [new DOMRect()]) as unknown as DOMRectList;
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        layoutChanged = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

describe('useRovingTabIndex', () => {
  it('keeps one button in the tab order: the first, then the one that had focus last', () => {
    render(<Toolbar />);
    expect(tabStops()).toEqual(['One']);

    button('Three').focus();

    expect(tabStops()).toEqual(['Three']);
  });

  it('moves with Left and Right, wrapping at the ends, and with Home and End', () => {
    render(<Toolbar />);
    button('One').focus();

    fireEvent.keyDown(button('One'), { key: 'ArrowRight' });
    expect(focused()).toBe('Two');
    fireEvent.keyDown(button('Two'), { key: 'End' });
    expect(focused()).toBe('Four');
    fireEvent.keyDown(button('Four'), { key: 'ArrowRight' });
    expect(focused()).toBe('One');
    fireEvent.keyDown(button('One'), { key: 'ArrowLeft' });
    expect(focused()).toBe('Four');
    fireEvent.keyDown(button('Four'), { key: 'Home' });
    expect(focused()).toBe('One');
    expect(tabStops()).toEqual(['One']);
  });

  it('leaves the arrow keys to the browser when a modifier is held', () => {
    render(<Toolbar />);
    button('One').focus();

    const unhandled = fireEvent.keyDown(button('One'), { key: 'ArrowRight', altKey: true });

    expect(unhandled).toBe(true);
    expect(focused()).toBe('One');
  });

  it('skips disabled buttons and buttons the layout hides', () => {
    render(<Toolbar disabled={['Two']} />);
    button('Four').hidden = true;
    button('One').focus();

    fireEvent.keyDown(button('One'), { key: 'ArrowRight' });
    expect(focused()).toBe('Three');
    fireEvent.keyDown(button('Three'), { key: 'ArrowRight' });
    expect(focused()).toBe('One');
    fireEvent.keyDown(button('One'), { key: 'End' });
    expect(focused()).toBe('Three');
  });

  it('falls back to the first button while the remembered one is disabled, and returns to it afterwards', () => {
    const { rerender } = render(<Toolbar />);
    button('Three').focus();

    rerender(<Toolbar disabled={['Three']} />);
    expect(tabStops()).toEqual(['One']);

    rerender(<Toolbar />);
    expect(tabStops()).toEqual(['Three']);
  });

  it('finds the neighbours of a focused button that was disabled meanwhile', () => {
    const { rerender } = render(<Toolbar />);
    button('Three').focus();
    rerender(<Toolbar disabled={['Three']} />);

    fireEvent.keyDown(button('Three'), { key: 'ArrowLeft' });

    expect(focused()).toBe('Two');
  });

  it('keeps a button that appears later out of the tab order', () => {
    const { rerender } = render(<Toolbar />);

    rerender(<Toolbar extra />);

    expect(tabStops()).toEqual(['One']);
    expect(button('Extra').tabIndex).toBe(-1);
  });

  it('moves the tab stop when a layout switch hides the remembered button, and back when it returns', () => {
    render(<Toolbar />);
    button('Two').focus();

    button('Two').hidden = true;
    act(layoutChanged);
    expect(tabStops()).toEqual(['One']);

    button('Two').hidden = false;
    act(layoutChanged);
    expect(tabStops()).toEqual(['Two']);
  });
});
