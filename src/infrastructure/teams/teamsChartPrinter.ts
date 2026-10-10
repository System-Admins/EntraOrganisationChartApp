import { app } from '@microsoft/teams-js';
import type { ChartPrinter } from '@/application/abstractions/chartPrinter';

/** A Teams tab can't open the print dialog, so the chart opens in the browser with the same top persons. */
export class TeamsChartPrinter implements ChartPrinter {
  print(): Promise<void> {
    const url = new URL(window.location.href);
    url.searchParams.delete('host');
    return app.openLink(url.href);
  }
}
