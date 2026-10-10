import type { ShareMethod, ShareResult } from '@/application/abstractions/employeeSharing';
import { BrowserClipboard } from '../clipboard/browserClipboard';

const clipboard = new BrowserClipboard();

/** Phones and tablets get the share sheet; on desktops the link goes straight to the clipboard. */
export function shareMethod(): ShareMethod {
  return 'share' in navigator && matchMedia('(pointer: coarse)').matches ? 'share' : 'copy';
}

export async function shareOrCopy(url: string, title: string): Promise<ShareResult> {
  if (shareMethod() === 'share') {
    try {
      await navigator.share({ title, url });
      return { outcome: 'shared' };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { outcome: 'cancelled' };
      // NotAllowedError: an iframe without the web-share permission. The clipboard may still work.
    }
  }
  return (await clipboard.copy(url)) ? { outcome: 'copied' } : { outcome: 'manual', url };
}
