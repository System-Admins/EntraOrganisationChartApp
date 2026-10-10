import type { ChartPrinter } from '@/application/abstractions/chartPrinter';

export class BrowserChartPrinter implements ChartPrinter {
  print(): Promise<void> {
    window.print();
    return Promise.resolve();
  }
}
