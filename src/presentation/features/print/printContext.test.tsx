// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Sender } from '@/application/common/mediator';
import { GetEmployeePhotoQuery } from '@/application/features/photos/getEmployeePhoto';
import { PrintChartCommand } from '@/application/features/print/printChart';
import { DisplayOptionsProvider } from '../../shared/displayOptions';
import { MediatorProvider } from '../../shared/mediatorContext';
import { PrintProvider, usePrint } from './printContext';

function Harness() {
  const { print, opensBrowser } = usePrint();
  return (
    <>
      <ul role="tree">
        <li role="treeitem" aria-selected={false} data-employee-id="a" />
        <li role="treeitem" aria-selected={false} data-employee-id="b" />
      </ul>
      <button type="button" onClick={print}>
        {opensBrowser ? 'Print in browser' : 'Print'}
      </button>
    </>
  );
}

function renderWith(showPhotos: boolean, opensBrowser = false) {
  const sent: string[] = [];
  const mediator: Sender = {
    send: <T,>(request: Request<T>) => {
      if (request instanceof GetEmployeePhotoQuery) sent.push(`photo:${request.employeeId}`);
      if (request instanceof PrintChartCommand) sent.push('print');
      return Promise.resolve(null as T);
    },
  };
  render(
    <MediatorProvider mediator={mediator}>
      <DisplayOptionsProvider value={{ showPhotos }}>
        <PrintProvider opensBrowser={opensBrowser}>
          <Harness />
        </PrintProvider>
      </DisplayOptionsProvider>
    </MediatorProvider>,
  );
  return sent;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(callback, 0));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PrintProvider', () => {
  it('loads the photo of every printed card before printing', async () => {
    const sent = renderWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));

    await waitFor(() => {
      expect(sent).toContain('print');
    });
    expect(sent).toEqual(['photo:a', 'photo:b', 'print']);
  });

  it('prints with Ctrl+P and Cmd+P through the same preparation', async () => {
    const sent = renderWith(true);

    const ctrl = fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    await waitFor(() => {
      expect(sent.filter((request) => request === 'print')).toHaveLength(1);
    });
    const cmd = fireEvent.keyDown(window, { key: 'P', metaKey: true });
    await waitFor(() => {
      expect(sent.filter((request) => request === 'print')).toHaveLength(2);
    });

    expect([ctrl, cmd]).toEqual([false, false]);
  });

  it('tells the page when the host prints by opening the browser', () => {
    renderWith(false, true);

    expect(screen.getByRole('button').textContent).toBe('Print in browser');
  });

  it('prints at once when photos are turned off', async () => {
    const sent = renderWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));

    await waitFor(() => {
      expect(sent).toEqual(['print']);
    });
  });
});
