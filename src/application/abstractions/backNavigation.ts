/** What the chart has open over it, which the host's Back button closes, the topmost first, before it leaves the chart. */
export interface OpenLayers {
  /** The side panel's, one per layer: 1 for a person's details or a list in their place, and one more for a list opened from the details or each department opened from another. */
  readonly panel: number;
  /** Whether a modal dialog (Settings) is open. */
  readonly dialog: boolean;
}

/** The host's Back button: the browser's, or that of Teams on phones. Other pages' iframes leave Back to their page. */
export interface BackNavigation {
  /** Each call replaces the last: while anything is open, Back calls `closeTopmost` instead of leaving the chart. */
  track(open: OpenLayers, closeTopmost: () => void): void;
}
