export interface ChartPrinter {
  /** Call from a click handler: hosts only open the print dialog, or another window, for a user gesture. */
  print(): Promise<void>;
}
