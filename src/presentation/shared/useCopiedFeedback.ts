import { useCallback, useState } from 'react';
import type { Language } from '@/application/settings/language';
import { useLanguage, useLanguageRef } from './languageContext';

/** How long a copy button says "Copied". */
export const COPIED_MS = 3000;

export interface CopiedFeedback {
  /** The button says "Copied": for COPIED_MS after the latest copy, and not after one that failed. */
  readonly copied: boolean;
  /** The button's own live region says what was copied. */
  readonly announced: boolean;
  /** Call with each copy's outcome: true where the text reached the clipboard. */
  readonly afterCopy: (copied: boolean) => void;
}

/** What every copy button says after a copy; each keeps its own field for copying by hand. */
export function useCopiedFeedback(): CopiedFeedback {
  const language = useLanguage();
  const languageRef = useLanguageRef();
  // One object per copy, so that an earlier copy's timer leaves a later copy's "Copied" alone.
  const [latest, setLatest] = useState<object | null>(null);
  // The language it was said in: a change of language empties the region instead of having it read out in other words.
  const [saidIn, setSaidIn] = useState<Language | null>(null);

  const afterCopy = useCallback(
    (copied: boolean) => {
      if (!copied) {
        setLatest(null);
        return;
      }
      const copy = {};
      setLatest(copy);
      // A live region whose text stays the same is not read again, so every copy empties it for a frame.
      setSaidIn(null);
      requestAnimationFrame(() => {
        setSaidIn(languageRef.current);
      });
      setTimeout(() => {
        setLatest((current) => (current === copy ? null : current));
      }, COPIED_MS);
    },
    [languageRef],
  );

  return { copied: latest !== null, announced: latest !== null && saidIn === language, afterCopy };
}
