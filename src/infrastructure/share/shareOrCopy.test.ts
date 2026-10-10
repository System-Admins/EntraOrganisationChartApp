// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareMethod, shareOrCopy } from './shareOrCopy';

const LINK = 'https://chart.contoso.com/?person=anna%40contoso.com';

type Share = (data: ShareData) => Promise<void>;
type WriteText = (text: string) => Promise<void>;

function setUp({ coarse, share, writeText, execCommand = () => false }: {
  coarse: boolean;
  share?: Share;
  writeText: WriteText;
  execCommand?: (command: string) => boolean;
}) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }));
  if (share) Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
}

const blocked = (name: string) => () => Promise.reject(new DOMException('', name));

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

describe('shareOrCopy', () => {
  it('opens the share sheet on touch screens', async () => {
    const share = vi.fn<Share>(() => Promise.resolve());
    const writeText = vi.fn<WriteText>(() => Promise.resolve());
    setUp({ coarse: true, share, writeText });

    expect(shareMethod()).toBe('share');
    expect(await shareOrCopy(LINK, 'Anna')).toEqual({ outcome: 'shared' });
    expect(share).toHaveBeenCalledWith({ title: 'Anna', url: LINK });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('reports a dismissed share sheet as cancelled, without copying', async () => {
    const writeText = vi.fn<WriteText>(() => Promise.resolve());
    setUp({ coarse: true, share: blocked('AbortError'), writeText });

    expect(await shareOrCopy(LINK, 'Anna')).toEqual({ outcome: 'cancelled' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies instead when the frame may not open the share sheet', async () => {
    const writeText = vi.fn<WriteText>(() => Promise.resolve());
    setUp({ coarse: true, share: blocked('NotAllowedError'), writeText });

    expect(await shareOrCopy(LINK, 'Anna')).toEqual({ outcome: 'copied' });
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('copies straight away with a mouse, even where a share sheet exists', async () => {
    const share = vi.fn<Share>(() => Promise.resolve());
    setUp({ coarse: false, share, writeText: () => Promise.resolve() });

    expect(shareMethod()).toBe('copy');
    expect(await shareOrCopy(LINK, 'Anna')).toEqual({ outcome: 'copied' });
    expect(share).not.toHaveBeenCalled();
  });

  it('copies on touch screens whose browser has no share sheet', () => {
    setUp({ coarse: true, writeText: () => Promise.resolve() });

    expect(shareMethod()).toBe('copy');
  });

  it('copies through a selection when the Clipboard API is blocked, and gives the focus back', async () => {
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    let selected = '';
    const execCommand = vi.fn(() => {
      selected = document.activeElement instanceof HTMLTextAreaElement ? document.activeElement.value : '';
      return true;
    });
    setUp({ coarse: false, writeText: blocked('NotAllowedError'), execCommand });

    expect(await shareOrCopy(LINK, 'Anna')).toEqual({ outcome: 'copied' });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(selected).toBe(LINK);
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('textarea')).toBeNull();
    button.remove();
  });

  it('hands the link back when nothing could copy it', async () => {
    setUp({ coarse: false, writeText: blocked('NotAllowedError') });

    expect(await shareOrCopy(LINK, 'Anna')).toEqual({ outcome: 'manual', url: LINK });
  });
});
