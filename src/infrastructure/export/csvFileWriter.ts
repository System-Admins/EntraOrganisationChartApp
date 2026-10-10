import type { Table, TableFileWriter } from '@/application/abstractions/tableFileWriter';
import type { CsvSeparator } from '../config/appConfig';

export class CsvFileWriter implements TableFileWriter {
  constructor(private readonly separator: CsvSeparator) {}

  save(baseName: string, table: Table): Promise<void> {
    download(`${baseName}.csv`, new Blob([toCsv(table, this.separator)], { type: 'text/csv;charset=utf-8' }));
    return Promise.resolve();
  }
}

/** RFC 4180 behind a byte order mark: without one, Excel reads UTF-8 as the local code page. */
export function toCsv(table: Table, separator: CsvSeparator): string {
  const line = (cells: readonly string[]) => cells.map((cell) => quote(defuse(cell))).join(separator);
  return `\uFEFF${[table.columns, ...table.rows].map(line).join('\r\n')}\r\n`;
}

/** Spreadsheets evaluate a cell that starts with one of these, which a crafted directory value could abuse. */
const FORMULA_START = /^[=+\-@\t\r]/;
/** Digits and punctuation cannot spell a function or a cell reference, so "+47 22 33 44 55" stays as it is. */
const PHONE_NUMBER = /^\+?[\d ()./-]+$/;

function defuse(cell: string): string {
  return FORMULA_START.test(cell) && !PHONE_NUMBER.test(cell) ? `'${cell}` : cell;
}

/** Either common separator, not only the file's: a spreadsheet set to the other one would split the cell, and could run its second part. */
const NEEDS_QUOTES = /[,;"\r\n]/;

function quote(cell: string): string {
  return NEEDS_QUOTES.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

function download(fileName: string, file: Blob): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download before the browser has read the file.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
