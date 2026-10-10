/** jsdom's dialog has no methods. These cover what the app uses: `open`, focus in and back, the close event. */
export function installDialogMethods(): void {
  const openers = new WeakMap<HTMLDialogElement, Element | null>();
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    openers.set(this, document.activeElement);
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('button, input')?.focus();
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    const opener = openers.get(this);
    if (opener instanceof HTMLElement) opener.focus();
    this.dispatchEvent(new Event('close'));
  };
}
