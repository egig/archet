import type { ConsoleFieldMeta, ConsoleModelMeta } from '../serialize-model.js';
import { formatCsvValue } from './format.js';

/** Leading characters Excel/Sheets treat as the start of a formula — a cell beginning with one of
 * these is prefixed with a straight quote so exported data (which may contain arbitrary
 * user-entered text, e.g. `=cmd|'/c calc'!A1`) can't turn into a spreadsheet formula-injection
 * vector when the CSV is opened. */
const FORMULA_PREFIX_CHARS = new Set(['=', '+', '-', '@']);

function csvCell(raw: string): string {
  const guarded = FORMULA_PREFIX_CHARS.has(raw[0] ?? '') ? `'${raw}` : raw;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export interface CsvColumn {
  label: string;
  value: (row: Record<string, unknown>) => string;
}

/** Serializes rows into a CSV string (CRLF line endings, RFC4180 quoting) — one column per
 * `CsvColumn`, in order, with a header row of labels. */
export function rowsToCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  }
  return lines.join('\r\n');
}

/** Builds the export column list for a model's currently-visible fields — mirrors exactly how
 * `RowTable` renders each field kind in the table body, so the CSV looks like what's on screen: a
 * reference/tree field exports its related row's `displayField` (not the raw id), a file field
 * exports its filename, everything else goes through `formatCsvValue`. */
export function buildCsvColumns(
  fields: ConsoleFieldMeta[],
  getModel: (name: string) => ConsoleModelMeta | undefined,
): CsvColumn[] {
  const idColumn: CsvColumn = { label: 'ID', value: (row) => formatCsvValue(row.id) };

  const fieldColumns = fields.map((f): CsvColumn => {
    if (f.kind === 'reference' || f.kind === 'tree') {
      const relation = f.key.replace(/Id$/, '');
      const targetDisplayField = getModel(f.targetModel ?? '')?.displayField ?? 'id';
      return {
        label: f.label,
        value: (row) => {
          const related = row[relation] as Record<string, unknown> | null | undefined;
          return formatCsvValue(related ? related[targetDisplayField] : row[f.key]);
        },
      };
    }
    if (f.kind === 'file') {
      return {
        label: f.label,
        value: (row) => (row[f.key] as { filename?: string } | null | undefined)?.filename ?? '',
      };
    }
    return { label: f.label, value: (row) => formatCsvValue(row[f.key]) };
  });

  return [idColumn, ...fieldColumns];
}

/** Triggers a browser download of `content` as a named file — a UTF-8 BOM is prepended so Excel
 * opens the file as UTF-8 instead of guessing at the system codepage. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
