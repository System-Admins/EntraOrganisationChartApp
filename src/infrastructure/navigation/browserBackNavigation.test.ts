// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserBackNavigation } from './browserBackNavigation';

const created: BrowserBackNavigation[] = [];
function navigationWith(restoreAddress: () => void = () => undefined) {
  const back = new BrowserBackNavigation(restoreAddress);
  created.push(back);
  return back;
}

/** How many of the page's own entries the history stands on, as the state of its entry says. */
const layers = () => (window.history.state as { orgappLayers?: number } | null)?.orgappLayers ?? 0;

afterEach(() => {
  for (const back of created.splice(0)) back.dispose();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('BrowserBackNavigation', () => {
  it('adds an entry to the history for each layer of the side panel, and none for a dialog', () => {
    const back = navigationWith();

    back.track({ panel: 1, dialog: false }, vi.fn());
    expect(layers()).toBe(1);
    back.track({ panel: 2, dialog: true }, vi.fn());
    expect(layers()).toBe(2);
    back.track({ panel: 2, dialog: false }, vi.fn());
    expect(layers()).toBe(2);
  });

  it('lets Back close the topmost layer, and adds the entry again for what is still open', async () => {
    const back = navigationWith();
    const closeTopmost = vi.fn();
    back.track({ panel: 1, dialog: true }, closeTopmost);

    window.history.back();
    await vi.waitFor(() => {
      expect(closeTopmost).toHaveBeenCalledOnce();
    });
    expect(layers()).toBe(0);

    // The page closed Settings, which lay over the panel, and says what is open now.
    back.track({ panel: 1, dialog: false }, closeTopmost);
    expect(layers()).toBe(1);
  });

  it('steps back over its own entries when the page closes a layer itself, without asking it to close one', async () => {
    const back = navigationWith();
    const closeTopmost = vi.fn();
    back.track({ panel: 2, dialog: false }, closeTopmost);

    back.track({ panel: 0, dialog: false }, closeTopmost);

    await vi.waitFor(() => {
      expect(layers()).toBe(0);
    });
    expect(closeTopmost).not.toHaveBeenCalled();
    back.track({ panel: 1, dialog: false }, closeTopmost);
    expect(layers()).toBe(1);
  });

  it('keeps an entry for each of as many layers as a trail of departments stacks, and steps back over several at once', async () => {
    const back = navigationWith();
    const closeTopmost = vi.fn();
    back.track({ panel: 4, dialog: false }, closeTopmost);
    expect(layers()).toBe(4);

    window.history.back();
    await vi.waitFor(() => {
      expect(closeTopmost).toHaveBeenCalledOnce();
    });
    back.track({ panel: 3, dialog: false }, closeTopmost);
    expect(layers()).toBe(3);

    // Close drops the whole trail with the panel.
    back.track({ panel: 0, dialog: false }, closeTopmost);
    await vi.waitFor(() => {
      expect(layers()).toBe(0);
    });
    expect(closeTopmost).toHaveBeenCalledOnce();
  });

  it('waits for its own step back before it adds an entry for a layer opened meanwhile', async () => {
    const back = navigationWith();
    const closeTopmost = vi.fn();
    back.track({ panel: 1, dialog: false }, closeTopmost);
    // Heard after the navigation's own listener, which was added first.
    const landed = new Promise((resolve) => {
      window.addEventListener('popstate', resolve, { once: true });
    });

    back.track({ panel: 0, dialog: false }, closeTopmost);
    back.track({ panel: 1, dialog: false }, closeTopmost);
    expect(layers()).toBe(1);

    // The step back lands below the entry, which is then added again.
    await landed;
    expect(layers()).toBe(1);
    expect(closeTopmost).not.toHaveBeenCalled();
  });

  it('keeps the filters and the team of the page in the address of the entry that Back goes to', async () => {
    const restoreAddress = vi.fn(() => {
      window.history.replaceState(window.history.state, '', '/?team=lead@contoso.com');
    });
    const back = navigationWith(restoreAddress);
    back.track({ panel: 1, dialog: false }, vi.fn());
    // The person picks a team while the details are open; the entry below keeps the address it had.
    window.history.replaceState(window.history.state, '', '/?team=lead@contoso.com');

    window.history.back();

    await vi.waitFor(() => {
      expect(restoreAddress).toHaveBeenCalledOnce();
    });
    expect(window.location.search).toBe('?team=lead@contoso.com');
  });

  it('goes back again from a layer that Forward would bring back, which is closed', async () => {
    const back = navigationWith();
    const closeTopmost = vi.fn();
    back.track({ panel: 1, dialog: false }, closeTopmost);
    window.history.back();
    await vi.waitFor(() => {
      expect(closeTopmost).toHaveBeenCalledOnce();
    });
    back.track({ panel: 0, dialog: false }, closeTopmost);
    const visited: number[] = [];
    const record = () => visited.push(layers());
    window.addEventListener('popstate', record);

    window.history.forward();

    try {
      await vi.waitFor(() => {
        expect(visited).toEqual([1, 0]);
      });
    } finally {
      window.removeEventListener('popstate', record);
    }
    expect(closeTopmost).toHaveBeenCalledOnce();
  });

  it('counts the entries left from before a reload as the page\'s first, as a step back to them would load the page before it', () => {
    window.history.replaceState({ orgappLayers: 2, other: 'kept' }, '');

    const back = navigationWith();
    expect(window.history.state).toEqual({ orgappLayers: 0, other: 'kept' });
    back.track({ panel: 1, dialog: false }, vi.fn());

    expect(window.history.state).toEqual({ orgappLayers: 1, other: 'kept' });
  });

  it('carries on without an entry where the browser refuses one, as Safari does after too many', () => {
    const back = navigationWith();
    vi.spyOn(History.prototype, 'pushState').mockImplementation(() => {
      throw new DOMException('Attempt to use history.pushState() more than 100 times per 30 seconds', 'SecurityError');
    });

    expect(() => {
      back.track({ panel: 1, dialog: false }, vi.fn());
    }).not.toThrow();
    expect(layers()).toBe(0);
  });
});
