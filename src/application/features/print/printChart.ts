import type { ChartPrinter } from '../../abstractions/chartPrinter';
import { Command, type RequestHandler } from '../../common/mediator';

/** Prints the chart as it is currently unfolded. */
export class PrintChartCommand extends Command {}

export class PrintChartHandler implements RequestHandler<PrintChartCommand> {
  constructor(private readonly printer: ChartPrinter) {}

  handle(): Promise<void> {
    return this.printer.print();
  }
}
