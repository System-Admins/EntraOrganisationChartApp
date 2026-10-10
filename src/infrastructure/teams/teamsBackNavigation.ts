import { pages } from '@microsoft/teams-js';
import type { BackNavigation, OpenLayers } from '@/application/abstractions/backNavigation';

/** Teams' Back button, which Teams has on phones: it closes Settings, then the side panel's layers, before it leaves the tab. */
export class TeamsBackNavigation implements BackNavigation {
  private open = 0;
  private closeTopmost: () => void = () => undefined;

  constructor() {
    if (!supportsBackButton()) return;
    pages.backStack.registerBackButtonHandler(() => {
      // True keeps Teams from going back itself.
      if (this.open === 0) return false;
      // Counted down at once, as a second press may come before the page has answered with track().
      this.open -= 1;
      this.closeTopmost();
      return true;
    });
  }

  track({ panel, dialog }: OpenLayers, closeTopmost: () => void): void {
    this.open = panel + (dialog ? 1 : 0);
    this.closeTopmost = closeTopmost;
  }
}

/** False where the host has no Back button for the tab to hand over, or the TeamsJS in use has no pages.backStack. */
function supportsBackButton(): boolean {
  try {
    return pages.backStack.isSupported();
  } catch {
    return false;
  }
}
