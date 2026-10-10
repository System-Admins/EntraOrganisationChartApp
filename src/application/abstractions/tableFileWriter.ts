export interface Table {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface TableFileWriter {
  /** Call from a click handler: browsers may block a download that no user gesture started. */
  save(baseName: string, table: Table): Promise<void>;
}
