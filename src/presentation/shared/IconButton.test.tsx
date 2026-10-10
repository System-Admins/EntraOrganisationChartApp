// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

const tooltip = () => document.querySelector('[class*="tip"]');

function renderButton(disabled = false) {
  const onClick = vi.fn();
  const view = render(<IconButton icon="print" label="Print" onClick={onClick} disabled={disabled} />);
  const button = screen.getByRole('button', { name: 'Print' });
  return { button, onClick, ...view };
}

afterEach(cleanup);

describe('IconButton', () => {
  it('is named by its label and has no native tooltip', () => {
    const { button } = renderButton();

    expect(button.hasAttribute('title')).toBe(false);
    expect(tooltip()).toBeNull();
  });

  it('shows its label while a mouse is over it, and not after a touch', () => {
    const { button } = renderButton();

    fireEvent.pointerEnter(button, { pointerType: 'touch' });
    expect(tooltip()).toBeNull();

    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(tooltip()?.textContent).toBe('Print');
    expect(tooltip()?.getAttribute('aria-hidden')).toBe('true');

    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    expect(tooltip()).toBeNull();
  });

  it('shows its label while it has keyboard focus, also when the mouse leaves', () => {
    const { button } = renderButton();

    act(() => {
      button.focus();
    });
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    expect(tooltip()?.textContent).toBe('Print');

    act(() => {
      button.blur();
    });
    expect(tooltip()).toBeNull();
  });

  it('hides the tooltip on Escape without letting the key reach anything else, once', () => {
    const { button } = renderButton();
    const onDocumentKeyDown = vi.fn();
    document.addEventListener('keydown', onDocumentKeyDown);
    act(() => {
      button.focus();
    });
    expect(tooltip()?.textContent).toBe('Print');

    const unhandled = fireEvent.keyDown(button, { key: 'Escape' });

    expect(tooltip()).toBeNull();
    expect(unhandled).toBe(false);
    expect(onDocumentKeyDown).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(onDocumentKeyDown).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', onDocumentKeyDown);
  });

  it('hides the tooltip on a press, which may open something that covers the button without the mouse leaving it', () => {
    const { button } = renderButton();
    act(() => {
      button.focus();
    });
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });

    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    expect(tooltip()).toBeNull();

    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(tooltip()?.textContent).toBe('Print');
  });

  it('does not press the button when the tooltip is clicked', () => {
    const { button, onClick } = renderButton();
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });

    fireEvent.click(tooltip() as Element);
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows no tooltip while disabled, and none is left over when it is enabled again', () => {
    const { button, rerender } = renderButton();
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });

    rerender(<IconButton icon="print" label="Print" disabled />);
    expect(tooltip()).toBeNull();

    rerender(<IconButton icon="print" label="Print" />);
    expect(tooltip()).toBeNull();
  });
});
