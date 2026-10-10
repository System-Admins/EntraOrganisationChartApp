import type { BackNavigation, OpenLayers } from '@/application/abstractions/backNavigation';
import { isRecord } from '../config/browserStorage';

/** The history state's count of the page's own entries up to an entry: one per layer of the side panel. */
const LAYERS_KEY = 'orgappLayers';

/** On a page of its own: an entry in the browser's history for each layer of the side panel, so that Back closes it first. */
export class BrowserBackNavigation implements BackNavigation {
  /** The page's own entries above the one it opened on, as the history stands. */
  private layers = 0;
  /** As many as the side panel has. */
  private wanted = 0;
  private closeTopmost: () => void = () => undefined;
  /** A step of the page's own through the history is under way: its popstate is no press of Back, and pushing waits for it. */
  private stepping = false;

  /** `restoreAddress` writes the page's latest filters and team into the address of an entry the history went back to. */
  constructor(private readonly restoreAddress: () => void) {
    // After a reload the entries pushed before it belong to the document before it, which a step back would load again.
    if (layersOf(window.history.state) !== 0) window.history.replaceState(withLayers(window.history.state, 0), '');
    window.addEventListener('popstate', this.popped);
  }

  track({ panel }: OpenLayers, closeTopmost: () => void): void {
    // No entry for a dialog: Escape closes it, as Chrome's Back gesture on Android does, which an entry would outlast.
    this.wanted = panel;
    this.closeTopmost = closeTopmost;
    this.settle();
  }

  /** Stops listening to the history; the page never needs to, its tests do. */
  dispose(): void {
    window.removeEventListener('popstate', this.popped);
  }

  private settle(): void {
    if (this.stepping) return;
    if (this.wanted < this.layers) {
      this.step(this.wanted - this.layers);
      return;
    }
    while (this.layers < this.wanted) {
      try {
        window.history.pushState(withLayers(window.history.state, this.layers + 1), '');
      } catch {
        // Safari limits how often a page pushes entries: Back then leaves the chart, as it always did.
        return;
      }
      this.layers += 1;
    }
  }

  private step(delta: number): void {
    this.stepping = true;
    window.history.go(delta);
  }

  private readonly popped = (event: PopStateEvent): void => {
    const layers = layersOf(event.state);
    // The entry moved to has the address it was left with; the filters and the team stay the page's latest.
    this.restoreAddress();
    if (this.stepping) {
      this.stepping = false;
      this.layers = layers;
      this.settle();
    } else if (layers < this.layers) {
      this.layers = layers;
      // The page answers with track(), which pushes an entry again for what is still open, as when Back closed Settings.
      this.closeTopmost();
    } else if (layers > this.layers) {
      // Forward, to a layer closed since, which can't open again: back to where the page is.
      this.step(this.layers - layers);
    }
  };
}

function layersOf(state: unknown): number {
  const layers = isRecord(state) ? state[LAYERS_KEY] : undefined;
  return typeof layers === 'number' ? layers : 0;
}

function withLayers(state: unknown, layers: number): Readonly<Record<string, unknown>> {
  return { ...(isRecord(state) ? state : {}), [LAYERS_KEY]: layers };
}
