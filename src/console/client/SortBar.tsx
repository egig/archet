import { useMemo } from 'react';
import type { ConsoleModelMeta } from '../serialize-model.js';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XMarkIcon } from './icons.js';

/** One sort level — mirrors `router/query.ts`'s `SortKey`. `?sort=a,-b` is `[{a,asc},{b,desc}]`. */
export type SortKey = { field: string; direction: 'asc' | 'desc' };

/** The columns a table can be sorted on, in the order they're offered: the model's own indexed,
 * non-`json` fields (json can't take a btree index), then the always-index-backed system columns
 * `id`/`createdAt`/`updatedAt` (`router/fields.ts`'s `IMPLICIT_INDEXED_COLUMNS`). Mirrors the
 * server's `isFilterableOrSortable` gate so the console never offers a column the API would 400 on. */
export function sortableOptions(model: ConsoleModelMeta): { key: string; label: string }[] {
  const fields = model.fields
    .filter((f) => f.indexed && f.kind !== 'json' && !f.sensitive)
    .map((f) => ({ key: f.key, label: f.label }));
  return [
    ...fields,
    { key: 'id', label: 'ID' },
    { key: 'createdAt', label: 'Created At' },
    { key: 'updatedAt', label: 'Updated At' },
  ];
}

const controlClass = 'rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground';

function SortKeyRow({
  options,
  used,
  sortKey,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  options: { key: string; label: string }[];
  /** field keys taken by *other* rows — excluded from this row's picker so a column can't be
   * sorted on twice. */
  used: Set<string>;
  sortKey: SortKey;
  index: number;
  count: number;
  onChange: (next: SortKey) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const available = options.filter((o) => o.key === sortKey.field || !used.has(o.key));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-xs text-muted-foreground">{index === 0 ? 'Sort by' : 'then by'}</span>

      <select
        value={sortKey.field}
        onChange={(e) => onChange({ field: e.target.value, direction: sortKey.direction })}
        className={controlClass}
      >
        {available.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>

      <select
        value={sortKey.direction}
        onChange={(e) => onChange({ field: sortKey.field, direction: e.target.value as 'asc' | 'desc' })}
        className={controlClass}
      >
        <option value="asc">ascending</option>
        <option value="desc">descending</option>
      </select>

      <div className="flex items-center">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Move up"
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ArrowUpIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label="Move down"
          className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ArrowDownIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove sort level"
        className="inline-flex items-center gap-0.5 text-xs text-destructive hover:underline"
      >
        <XMarkIcon className="h-3.5 w-3.5" />
        Remove
      </button>
    </div>
  );
}

export interface SortBarProps {
  model: ConsoleModelMeta;
  /** the in-progress draft — every row/level edit here updates the draft via `onChange` only; it
   * doesn't touch the table or get persisted until `onApply` runs. Header-click sorting bypasses
   * this draft entirely and applies instantly (see `RowTable`'s `headerClickSort`) — it's only the
   * panel's multi-level builder (add level, reorder, flip direction) that benefits from staging
   * edits, the same reasoning `FilterBar`'s clause builder already uses. */
  value: SortKey[];
  onChange: (next: SortKey[]) => void;
  /** when set, the bar shows an "Apply" button that hands back the current draft — the caller
   * decides what "apply" means: write the URL `?sort=` param (`ModelListPage`) or persist to the
   * `workspace_views` row (`WorkspaceViewTable`). */
  onApply?: (value: SortKey[]) => void;
  /** whether `value` differs from the last-applied set — drives the Apply button's enabled state. */
  dirty?: boolean;
  /** an apply is in flight (persisting) — shows "Applying…" and keeps the button disabled. */
  applying?: boolean;
}

/** Multi-column sort editor — an ordered list of `[field, direction]` levels, the exact shape
 * `router/query.ts` consumes as `?sort=`. Revealed by `RowTable`'s "Sort" toggle, next to the
 * `FilterBar` it's modelled on. */
export function SortBar({ model, value, onChange, onApply, dirty, applying }: SortBarProps) {
  const options = useMemo(() => sortableOptions(model), [model]);
  const usedKeys = useMemo(() => new Set(value.map((k) => k.field)), [value]);
  const firstUnused = options.find((o) => !usedKeys.has(o.key));

  function replaceAt(i: number, next: SortKey) {
    onChange(value.map((k, idx) => (idx === i ? next : k)));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  }

  return (
    <div className="mb-4 space-y-2 rounded-md border border-border bg-muted p-3">
      {value.length === 0 && <p className="text-sm text-muted-foreground">No sort — rows use the default order (newest first).</p>}

      {value.map((sortKey, i) => (
        <SortKeyRow
          key={i}
          options={options}
          used={new Set(value.filter((_, idx) => idx !== i).map((k) => k.field))}
          sortKey={sortKey}
          index={i}
          count={value.length}
          onChange={(next) => replaceAt(i, next)}
          onMove={(dir) => move(i, dir)}
          onRemove={() => onChange(value.filter((_, idx) => idx !== i))}
        />
      ))}

      <div className="flex items-center gap-3">
        {firstUnused && (
          <button
            type="button"
            onClick={() => onChange([...value, { field: firstUnused.key, direction: 'asc' }])}
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:underline"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add sort
          </button>
        )}
        {onApply && (
          <button
            type="button"
            disabled={!dirty || applying}
            onClick={() => onApply(value)}
            className="ml-auto rounded-md bg-accent px-3 py-1 text-sm text-accent-foreground hover:opacity-90 disabled:opacity-40"
          >
            {applying ? 'Applying…' : 'Apply'}
          </button>
        )}
      </div>
    </div>
  );
}
