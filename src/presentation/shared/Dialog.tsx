import { useId, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { classNames } from './classNames';
import styles from './Dialog.module.css';
import { Icon } from './Icon';

interface DialogProps {
  readonly open: boolean;
  /** The heading, which names the dialog. */
  readonly title: string;
  /** The Close button's name, which says what it closes. */
  readonly closeLabel: string;
  /** Room for lists of people, as a report has; the standard width suits a column of settings. */
  readonly wide?: boolean;
  /** The dialog closed itself (its Close button, Escape, a click beside it): set `open` to false. */
  readonly onClose: () => void;
  /** Rendered only while the dialog is open, so that each opening starts afresh. */
  readonly children: ReactNode;
}

/** Native modal dialog: the focus stays inside and Escape closes it. The owner closes it through `open`, because only close() hands the focus back. */
export function Dialog({ open, title, closeLabel, wide = false, onClose, children }: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBeside = useRef(false);
  const titleId = useId();

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element || element.open === open) return;
    if (open) element.showModal();
    else element.close();
  }, [open]);

  // The content covers the dialog's box, so only the backdrop has the dialog itself as the target.
  const isBeside = (event: MouseEvent<HTMLDialogElement>) => event.target === event.currentTarget;

  return (
    <dialog
      ref={dialog}
      className={classNames(styles.dialog, wide && styles.wide)}
      aria-labelledby={titleId}
      onClose={onClose}
      onMouseDown={(event) => {
        pressedBeside.current = isBeside(event);
      }}
      // A text selection dragged out of the dialog also ends as a click on the dialog, so the press counts too.
      onClick={(event) => {
        if (pressedBeside.current && isBeside(event)) dialog.current?.close();
      }}
    >
      {open && (
        <div className={styles.content}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button type="button" className={styles.close} aria-label={closeLabel} onClick={() => dialog.current?.close()}>
              <Icon name="close" />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
