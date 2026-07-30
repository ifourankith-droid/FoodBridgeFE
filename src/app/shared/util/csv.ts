/**
 * Client-side CSV export. The reports/history pages already hold every number
 * they show, so an export is a local serialise + download — no endpoint needed.
 */

type CsvCell = string | number | null | undefined;

/**
 * Quote a cell only when it needs it, doubling any embedded quotes (RFC 4180).
 * A leading `=`, `+`, `-` or `@` is prefixed with a tab so spreadsheets treat the
 * value as text rather than a formula.
 */
function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  const raw = String(cell);
  const value = /^[=+\-@]/.test(raw) ? `\t${raw}` : raw;
  return /["\n\r,\t]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/**
 * Serialise `rows` (first row = header) and save them as `filename`.
 *
 * The UTF-8 BOM is deliberate: without it Excel on Windows reads the file as the
 * system codepage and mangles any non-ASCII name in the data.
 */
export function downloadCsv(filename: string, rows: readonly CsvCell[][]): void {
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
