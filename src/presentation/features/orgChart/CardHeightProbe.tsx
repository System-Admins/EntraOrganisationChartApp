import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import type { OrgChart } from '@/domain/orgChart/orgChart';
import { fullestCardContent } from './cardContent';
import { MeasuringCard } from './EmployeeCard';
import styles from './OrgChart.module.css';

/** Headroom in px: zoomed text rounds each line's height, which would leave the fullest cards a fraction taller. */
const HEADROOM = 1;

interface CardHeightProbeProps {
  readonly chart: OrgChart;
  /** Gets the measured heights as --card-body-height-tree and --card-body-height-outline. */
  readonly canvasRef: RefObject<HTMLElement | null>;
}

/** Makes every card as tall as the fullest one by measuring two hidden cards: the tree's form and the one on screen. */
export function CardHeightProbe({ chart, canvasRef }: CardHeightProbeProps) {
  const content = useMemo(() => fullestCardContent(chart), [chart]);
  const treeBody = useRef<HTMLDivElement>(null);
  const screenBody = useRef<HTMLDivElement>(null);

  // Measured before the first paint; the observer follows later changes such as fonts, the text size, text spacing and resizes.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const tree = treeBody.current;
    const onScreen = screenBody.current;
    if (!canvas || !tree || !onScreen) return;
    const measure = () => {
      setHeight(canvas, '--card-body-height-tree', tree);
      setHeight(canvas, '--card-body-height-outline', onScreen);
    };
    measure();
    // Paper takes the standard text size, which syncTheme sets just before; the browser copies the page before an observer answers.
    window.addEventListener('beforeprint', measure);
    window.addEventListener('afterprint', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(tree);
    observer?.observe(onScreen);
    return () => {
      window.removeEventListener('beforeprint', measure);
      window.removeEventListener('afterprint', measure);
      observer?.disconnect();
    };
  }, [canvasRef]);

  return (
    <div className={styles.probes} aria-hidden="true" inert>
      <MeasuringCard bodyRef={treeBody} content={content} asTree />
      <MeasuringCard bodyRef={screenBody} content={content} />
    </div>
  );
}

function setHeight(canvas: HTMLElement, property: string, body: HTMLElement): void {
  const { height } = body.getBoundingClientRect();
  // Zero means the card isn't laid out (a hidden frame): the last measured height stays.
  if (height > 0) canvas.style.setProperty(property, `${String(height + HEADROOM)}px`);
}
