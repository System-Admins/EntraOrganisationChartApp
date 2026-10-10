import { useCallback } from 'react';
import { CopyTextCommand } from '@/application/features/clipboard/copyText';
import { useMediator } from './mediatorContext';

/** Call from a click handler. False where nothing could copy the text, which the person then needs to see to copy by hand. */
export function useCopyText(): (text: string) => Promise<boolean> {
  const mediator = useMediator();
  // The composition root has logged a failure; to the person it is the same as a clipboard that refused.
  return useCallback((text) => mediator.send(new CopyTextCommand(text)).catch(() => false), [mediator]);
}
