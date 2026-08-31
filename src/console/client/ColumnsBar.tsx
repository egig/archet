import type { ConsoleFieldMeta } from '../serialize-model.js';

export interface ColumnsBarProps {
  /** the model's toggleable columns — same set `RowTable` renders by default (non-`sensitive`,
   * non-`hideInTable`). `id` isn't included: it's always shown, not part of this checklist. */
  fields: ConsoleFieldMeta[];
  /** keys currently hidden — everything not in this set is visible. */
  hidden: Set<string>;
  onChange: (hidden: Set<string>) => void;
}

/** Column show/hide checklist, revealed by `RowTable`'s "Columns" toggle next to Filter/Sort. Every
 * edit applies immediately — like a `SortKey`, a checkbox toggle is always a complete, harmless
 * change, so there's no draft/Apply step to protect against (unlike `FilterBar`'s clause builder). */
export function ColumnsBar({ fields, hidden, onChange }: ColumnsBarProps) {
  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-border bg-muted p-3">
      {fields.map((f) => (
        <label key={f.key} className="flex items-center gap-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={!hidden.has(f.key)}
            onChange={() => toggle(f.key)}
            className="rounded border-border"
          />
          {f.label}
        </label>
      ))}
    </div>
  );
}
