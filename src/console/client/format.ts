export function isoToDatetimeLocal(iso: unknown): string {
  if (typeof iso !== 'string' || iso.length === 0) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(local: string): string {
  return new Date(local).toISOString();
}

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Same stringification as `formatCellValue`, but a blank cell for null/empty instead of the
 * table's "—" placeholder — that dash is a UI-only convention and shouldn't leak into exported
 * data (a CSV importer would read it as the literal string "—"). */
export function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
