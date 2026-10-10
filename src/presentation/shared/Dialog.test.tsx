// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installDialogMethods } from '@/testing/dialog';
import { Dialog } from './Dialog';
import styles from './Dialog.module.css';

beforeAll(installDialogMethods);

afterEach(cleanup);

/** A page with the button that opens the dialog. */
function Page({ wide }: { wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open the report
      </button>
      <Dialog
        open={open}
        title="Directory health"
        closeLabel="Close directory health"
        wide={wide}
        onClose={() => {
          setOpen(false);
        }}
      >
        <p>The report</p>
      </Dialog>
    </>
  );
}

function openDialog(wide?: boolean) {
  render(<Page wide={wide} />);
  const opener = screen.getByRole('button', { name: 'Open the report' });
  act(() => {
    opener.focus();
  });
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole<HTMLDialogElement>('dialog', { name: 'Directory health' }) };
}

describe('Dialog', () => {
  it('is named by its title, with a heading and a Close button that says what it closes, and its content only while open', () => {
    render(<Page />);
    expect(document.querySelector('dialog')?.childElementCount).toBe(0);
    cleanup();

    const { dialog } = openDialog();

    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe('Directory health');
    expect(within(dialog).getByText('The report')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close directory health' }));
  });

  it('closes from its Close button, and hands the focus back to the button that opened it', () => {
    const { opener, dialog } = openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close directory health' }));

    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(dialog.childElementCount).toBe(0);
  });

  it('takes the wide variant\'s room only where it is asked for', () => {
    expect(openDialog(true).dialog.classList).toContain(styles.wide);
    cleanup();

    expect(openDialog().dialog.classList).not.toContain(styles.wide);
  });
});
