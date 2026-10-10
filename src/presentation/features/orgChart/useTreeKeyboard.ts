import { useRef, type KeyboardEvent } from 'react';
import { fold } from '@/domain/text/fold';
import { findTreeItem } from './treeItems';
import type { FocusOptions } from './useZoom';

/** Letters, and the spaces between them, typed within this time of each other spell one name to find, as in a file list. */
const TYPE_AHEAD_MS = 500;

/** What the keys do on a tree item: a person's card, a heading, a list's Show more, or a department. */
export interface ItemKeys {
  /** Null where the item has nothing to fold. */
  readonly expanded: boolean | null;
  readonly toggle: () => void;
  /** Enter, and Space: what a click on the item does. */
  readonly press: () => void;
  /** The item that ArrowLeft moves to: the one it is under. */
  readonly parentKey: string | null;
  /** The items beside it, whose teams or groups '*' unfolds. */
  readonly siblings: readonly string[];
}

interface TreeKeyboard {
  readonly viewport: HTMLElement | null;
  readonly keysOf: (key: string) => ItemKeys | null;
  /** The name type-ahead compares an item by; null for its text, as a heading's or Show more's. */
  readonly nameOf: (key: string) => string | null;
  readonly onFocus: (element: HTMLElement, options: FocusOptions) => void;
  /** The '/' key: go to the search field. */
  readonly onSearchShortcut: () => void;
  /** The '*' key on the item `key`, beside `siblings`, with the number of items on screen, which the card budget counts. */
  readonly onExpandSiblings: (key: string, siblings: readonly string[], shownItems: number) => void;
}

/** The ARIA tree's keys over every item in `viewport`, which carry their key as data-employee-id or data-tree-key; no item has a key handler of its own. */
export function useTreeKeyboard({ viewport, keysOf, nameOf, onFocus, onSearchShortcut, onExpandSiblings }: TreeKeyboard) {
  const typed = useRef<{ readonly letters: readonly string[]; readonly at: number }>({ letters: [], at: -Infinity });

  // The next item from `start` on, round to the top, whose name starts with `letters` as fold() spells them.
  const nextNamed = (items: readonly HTMLElement[], start: number, letters: string) => {
    for (let step = 0; step < items.length; step++) {
      const item = items[(start + step) % items.length];
      const key = item === undefined ? undefined : keyOf(item);
      const name = (key === undefined ? null : nameOf(key)) ?? item?.textContent ?? '';
      if (fold(name).startsWith(letters)) return item;
    }
    return undefined;
  };

  const stillTyping = (at: number) => at - typed.current.at <= TYPE_AHEAD_MS;

  // Type-ahead over the items on screen. A further letter starts at the item itself, which may still match.
  const findTyped = (items: readonly HTMLElement[], index: number, character: string, at: number) => {
    const letters = [...(stillTyping(at) ? typed.current.letters : []), fold(character)];
    typed.current = { letters, at };
    const [first = ''] = letters;
    const found = nextNamed(items, letters.length === 1 ? index + 1 : index, letters.join(''));
    // The same letter again moves on to the next name with it, unless a name starts with the repeats, such as "Aase".
    const repeated = letters.length > 1 && letters.every((letter) => letter === first);
    return found ?? (repeated ? nextNamed(items, index + 1, first) : undefined);
  };

  // Folding and unfolding frame the result as a click does.
  return (event: KeyboardEvent<HTMLUListElement>) => {
    const item = event.target instanceof HTMLElement && event.target.getAttribute('role') === 'treeitem' ? event.target : null;
    const key = item === null ? undefined : keyOf(item);
    const keys = key === undefined ? null : keysOf(key);
    if (!item || key === undefined || !keys || !viewport) return;
    const items = [...viewport.querySelectorAll<HTMLElement>('[role=treeitem]')];
    const index = items.indexOf(item);
    let target: HTMLElement | null | undefined;
    switch (event.key) {
      case 'ArrowDown':
        target = items[index + 1];
        break;
      case 'ArrowUp':
        target = items[index - 1];
        break;
      case 'Home':
        target = items[0];
        break;
      case 'End':
        target = items.at(-1);
        break;
      case 'ArrowRight':
        if (keys.expanded === false) keys.toggle();
        else if (keys.expanded) target = items[index + 1];
        break;
      case 'ArrowLeft':
        if (keys.expanded) keys.toggle();
        else if (keys.parentKey !== null) target = findTreeItem(viewport, keys.parentKey);
        break;
      case 'Enter':
        keys.press();
        break;
      case ' ':
        // While a name is being typed a space goes on with it, as in a select; otherwise it presses the item, as Enter does.
        if (typedCharacter(event) === ' ' && stillTyping(event.timeStamp)) target = findTyped(items, index, ' ', event.timeStamp);
        else keys.press();
        break;
      default: {
        const character = typedCharacter(event);
        if (character === null) return;
        // Marked handled below, which also keeps '/' from Firefox's quick find and letters from its find as you type.
        if (character === '/') onSearchShortcut();
        else if (character === '*') onExpandSiblings(key, keys.siblings, items.length);
        else target = findTyped(items, index, character, event.timeStamp);
      }
    }
    event.preventDefault();
    if (!target) return;
    target.focus({ preventScroll: true });
    onFocus(target, { fit: false, align: 'nearest' });
  };
}

function keyOf(item: HTMLElement): string | undefined {
  return item.dataset.employeeId ?? item.dataset.treeKey;
}

/** A character typed on its own, a space included; the tree has focus, which lets single keys be shortcuts (WCAG 2.1.4). */
function typedCharacter(event: KeyboardEvent): string | null {
  // Combinations belong to the browser and the system, and an input method composes its own characters.
  if (event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return null;
  return /^(?:\S| )$/u.test(event.key) ? event.key : null;
}
