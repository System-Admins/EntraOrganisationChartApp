import type { Clipboard } from '@/application/abstractions/clipboard';

/** The Clipboard API first, as execCommand is deprecated; a selection where the page may not use the API. */
export class BrowserClipboard implements Clipboard {
  async copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyThroughSelection(text);
    }
  }
}

/** execCommand copy needs no clipboard-write permission, which SharePoint's embed iframe doesn't delegate. */
function copyThroughSelection(text: string): boolean {
  const previousFocus = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  // Read-only keeps the on-screen keyboard closed; fixed at the corner keeps the page from scrolling to it.
  field.readOnly = true;
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.opacity = '0';
  // A modal dialog makes the rest of the page inert, where a field can take neither the focus nor the selection.
  (previousFocus?.closest('dialog[open]') ?? document.querySelector('dialog[open]') ?? document.body).append(field);
  try {
    field.focus({ preventScroll: true });
    // Without the focus the copy would take nothing, or other selected text, and still report success.
    if (document.activeElement !== field) return false;
    // iOS Safari ignores select(); a selection range works everywhere.
    field.setSelectionRange(0, text.length);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- see above
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}
