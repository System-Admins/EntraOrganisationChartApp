import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Moves focus to `heading` for a person opened from the chart or the sheet. Call the result when the panel asks. */
export function useSheetFocus(
  panel: RefObject<HTMLElement | null>,
  heading: RefObject<HTMLElement | null>,
  employeeId: string,
  openedFromList = false,
): () => void {
  // Read only as the panel mounts: a list that took its place in the sheet asked for the person, and is gone by then.
  const askedInPanel = useRef(openedFromList);
  const decision = useRef<{ readonly employeeId: string; readonly takesFocus: boolean } | null>(null);

  // Read before OrgChartCanvas moves the focus to the card. Decided once per person: StrictMode repeats effects.
  useLayoutEffect(() => {
    if (decision.current?.employeeId === employeeId) return;
    // --layout is set on the chart's viewport and inherited by the tree.
    const tree = panel.current?.parentElement?.querySelector('[role="tree"]');
    const outline = tree != null && getComputedStyle(tree).getPropertyValue('--layout').trim() === 'outline';
    const byUser = askedInPanel.current || (tree?.contains(document.activeElement) ?? false);
    askedInPanel.current = false;
    decision.current = { employeeId, takesFocus: outline && byUser };
  }, [panel, employeeId]);

  // Runs after that effect, which would otherwise take the focus back to the card.
  useEffect(() => {
    if (decision.current?.takesFocus) heading.current?.focus({ preventScroll: true });
  }, [heading, employeeId]);

  return useCallback(() => {
    askedInPanel.current = true;
  }, []);
}
