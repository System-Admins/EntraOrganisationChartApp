// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useAnnouncer } from './useAnnouncer';

function Harness() {
  const { region, announce } = useAnnouncer();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          announce('Saved');
        }}
      >
        Save
      </button>
      <span ref={region} role="status" />
    </>
  );
}

afterEach(cleanup);

describe('useAnnouncer', () => {
  it('puts each message in the live region, emptied first so a repeated message is a change again', async () => {
    render(<Harness />);
    const region = screen.getByRole('status');
    const changes: string[] = [];
    new MutationObserver(() => changes.push(region.textContent)).observe(region, { childList: true });
    expect(region.textContent).toBe('');

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(region.textContent).toBe('Saved');
    });
    fireEvent.click(screen.getByRole('button'));
    expect(region.textContent).toBe('');
    await waitFor(() => {
      expect(changes).toEqual(['Saved', '', 'Saved']);
    });
  });
});
