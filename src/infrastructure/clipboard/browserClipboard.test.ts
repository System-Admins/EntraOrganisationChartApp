// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installDialogMethods } from '@/testing/dialog';
import { BrowserClipboard } from './browserClipboard';

const DETAILS = 'About this chart\nVersion: 1.0.42';

type WriteText = (text: string) => Promise<void>;

function setUp(writeText: WriteText, execCommand: (command: string) => boolean = () => false) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
}

const blocked = () => Promise.reject(new DOMException('', 'NotAllowedError'));

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

describe('BrowserClipboard', () => {
  it('copies with the Clipboard API where the page may', async () => {
    const writeText = vi.fn<WriteText>(() => Promise.resolve());
    const execCommand = vi.fn(() => true);
    setUp(writeText, execCommand);

    expect(await new BrowserClipboard().copy(DETAILS)).toBe(true);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(DETAILS);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('copies the whole text through a selection where the API is blocked, and gives the focus back', async () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    let selected = '';
    setUp(blocked, () => {
      selected = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.value : '';
      return true;
    });

    expect(await new BrowserClipboard().copy(DETAILS)).toBe(true);
    expect(selected).toBe(DETAILS);
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('textarea')).toBeNull();
    button.remove();
  });

  it('copies inside the open modal dialog, as the rest of the page is inert there, also where a click left no focus', async () => {
    installDialogMethods();
    const dialog = document.body.appendChild(document.createElement('dialog'));
    const button = dialog.appendChild(document.createElement('button'));
    dialog.showModal();
    const copiedIn: (Element | null | undefined)[] = [];
    const selected: string[] = [];
    setUp(blocked, () => {
      copiedIn.push(document.activeElement?.closest('dialog'));
      selected.push(document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.value : '');
      return true;
    });

    expect(await new BrowserClipboard().copy(DETAILS)).toBe(true);
    expect(document.activeElement).toBe(button);
    // Safari doesn't focus a button that is clicked.
    button.blur();
    expect(await new BrowserClipboard().copy(DETAILS)).toBe(true);

    expect(copiedIn).toEqual([dialog, dialog]);
    expect(selected).toEqual([DETAILS, DETAILS]);
    expect(dialog.querySelector('textarea')).toBeNull();
    dialog.remove();
  });

  it('answers false without copying where the field could not take the focus, so that the text is offered instead', async () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    const execCommand = vi.fn(() => true);
    setUp(blocked, execCommand);
    // As when something inert around the field keeps the focus from it: the copy would take nothing.
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus').mockImplementation(() => undefined);
    try {
      expect(await new BrowserClipboard().copy(DETAILS)).toBe(false);
      expect(execCommand).not.toHaveBeenCalled();
      expect(document.querySelector('textarea')).toBeNull();
      expect(document.activeElement).toBe(button);
    } finally {
      focus.mockRestore();
      button.remove();
    }
  });

  it('answers false where nothing could copy, also on a page without the API', async () => {
    setUp(blocked);
    expect(await new BrowserClipboard().copy(DETAILS)).toBe(false);

    // Browsers leave navigator.clipboard out of pages that are not served over HTTPS.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    expect(await new BrowserClipboard().copy(DETAILS)).toBe(false);
  });
});
