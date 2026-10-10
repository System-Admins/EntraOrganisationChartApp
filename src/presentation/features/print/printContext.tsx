import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Sender } from '@/application/common/mediator';
import { GetEmployeePhotoQuery } from '@/application/features/photos/getEmployeePhoto';
import { PrintChartCommand } from '@/application/features/print/printChart';
import { useDisplayOptions } from '../../shared/displayOptions';
import { useMediator } from '../../shared/mediatorContext';

/** How long printing waits for photos; people whose photo is still missing then print with initials. */
const PHOTO_WAIT_MS = 6000;
/** Teams opens the chart in the browser instead of printing, so afterprint may never come. */
const PRINT_MODE_MAX_MS = 60_000;

interface PrintState {
  /** Call from a click handler; see ChartPrinter. */
  readonly print: () => void;
  readonly preparing: boolean;
  /** The host can't print its page, so printing opens the chart in the browser instead, to be printed there. */
  readonly opensBrowser: boolean;
  /** Every avatar on the page loads its photo, not only those in view, because the whole chart is printed. */
  readonly photosForPrint: boolean;
}

const PrintContext = createContext<PrintState>({
  print: () => undefined,
  preparing: false,
  opensBrowser: false,
  photosForPrint: false,
});

/** Photos load only in view, so Print and Ctrl+P load the missing ones first. The browser's menu can't wait. */
export function PrintProvider({ opensBrowser, children }: { opensBrowser: boolean; children: ReactNode }) {
  const mediator = useMediator();
  const { showPhotos } = useDisplayOptions();
  const [photosForPrint, setPhotosForPrint] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const busy = useRef(false);

  const print = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setPreparing(true);
    setPhotosForPrint(showPhotos);
    const leavePrintMode = () => {
      setPhotosForPrint(false);
    };
    // Registered before printing: browsers that block in window.print() fire afterprint before it returns.
    window.addEventListener('afterprint', leavePrintMode, { once: true });
    setTimeout(leavePrintMode, PRINT_MODE_MAX_MS);
    void (async () => {
      try {
        if (showPhotos) await loadPrintedPhotos(mediator);
        await mediator.send(new PrintChartCommand());
      } catch (error) {
        console.error('Could not print the chart.', error);
      } finally {
        busy.current = false;
        setPreparing(false);
      }
    })();
  }, [mediator, showPhotos]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        print();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [print]);

  return <PrintContext value={{ print, preparing, opensBrowser, photosForPrint }}>{children}</PrintContext>;
}

export function usePrint(): Omit<PrintState, 'photosForPrint'> {
  const { print, preparing, opensBrowser } = useContext(PrintContext);
  return { print, preparing, opensBrowser };
}

export function usePhotosForPrint(): boolean {
  return useContext(PrintContext).photosForPrint;
}

/** The printed cards are the ones mounted in the tree; their avatars pick the photos up from the same cache. */
async function loadPrintedPhotos(mediator: Sender): Promise<void> {
  const ids = [...document.querySelectorAll<HTMLElement>('[role="treeitem"][data-employee-id]')].flatMap(
    (card) => card.dataset.employeeId ?? [],
  );
  await settleWithin(
    ids.map((id) => mediator.send(new GetEmployeePhotoQuery(id))),
    PHOTO_WAIT_MS,
  );
  // The avatars render the photos a moment after the queries settle, and the print must include them.
  await nextFrame();
  await nextFrame();
  const images = [...document.querySelectorAll<HTMLImageElement>('[role="tree"] img')];
  await settleWithin(
    images.map(async (image) => image.decode()),
    1000,
  );
}

function settleWithin(promises: readonly Promise<unknown>[], milliseconds: number): Promise<unknown> {
  return Promise.race([Promise.allSettled(promises), new Promise((resolve) => setTimeout(resolve, milliseconds))]);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}
