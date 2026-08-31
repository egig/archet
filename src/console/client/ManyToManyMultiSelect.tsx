import { useEffect, useMemo, useRef, useState } from 'react';
import { getRow, listRows } from './api.js';
import { useModels } from './models.js';
import type { ReferenceOption } from './fields.js';
import { XMarkIcon } from './icons.js';

export interface ManyToManyMultiSelectProps {
  /** the currently selected target-row ids — the *whole* desired set, not a diff (see
   * `core/pipeline.ts`'s `syncManyToMany`: the parent's create/update body always replaces the
   * full relation, it's never a per-tag patch). */
  value: string[];
  onChange: (value: string[]) => void;
  targetModel: string;
  disabled?: boolean;
}

/** A chip-and-search multi-select for a manyToMany field — the sibling of `ReferenceCombobox` for
 * a relation that can hold more than one row. Picks only from existing rows of `targetModel`
 * (round 3 of the design discussion: no inline "create a new tag" from this widget — that's a
 * separate trip to `targetModel`'s own console page). Shares `ReferenceCombobox`'s two lookup
 * strategies: server-side `ilike` search when the target's `displayField` is an indexed string/text
 * column, otherwise a first-100-rows fetch filtered client-side. */
export function ManyToManyMultiSelect({ value, onChange, targetModel, disabled }: ManyToManyMultiSelectProps) {
  const { getModel } = useModels();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [baseOptions, setBaseOptions] = useState<ReferenceOption[] | null>(null);
  const [serverResults, setServerResults] = useState<ReferenceOption[] | null>(null);
  const [searching, setSearching] = useState(false);

  const targetMeta = getModel(targetModel);
  const displayField = targetMeta?.displayField ?? 'id';
  const displayMeta = targetMeta?.fields.find((f) => f.key === displayField);
  const canServerSearch = !!displayMeta && (displayMeta.kind === 'string' || displayMeta.kind === 'text') && displayMeta.indexed;

  const toOption = useMemo(
    () => (row: Record<string, unknown>): ReferenceOption => ({ id: String(row.id), label: String(row[displayField] ?? row.id) }),
    [displayField],
  );

  // resolve a label for any selected id this widget hasn't seen in a search result yet (e.g.
  // seeded from the form's initial values) — same per-id fallback ReferenceCombobox uses for its
  // one selected value.
  const idsKey = value.join(',');
  useEffect(() => {
    const missing = value.filter((id) => !(id in labels));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        getRow(targetModel, id)
          .then((row) => [id, toOption(row).label] as const)
          .catch(() => [id, id] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setLabels((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, targetModel, toOption]);

  useEffect(() => {
    if (!open || baseOptions !== null) return;
    let cancelled = false;
    listRows(targetModel, { limit: 100, offset: 0 })
      .then((page) => !cancelled && setBaseOptions(page.rows.map(toOption)))
      .catch(() => !cancelled && setBaseOptions([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetModel, toOption]);

  useEffect(() => {
    const q = query.trim();
    if (!open || !canServerSearch || !q) {
      setServerResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      listRows(targetModel, { limit: 20, offset: 0, filters: [[displayField, 'ilike', `%${q}%`]], sort: displayField })
        .then((page) => !cancelled && setServerResults(page.rows.map(toOption)))
        .catch(() => !cancelled && setServerResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, canServerSearch, targetModel, displayField, toOption]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const rawResults: ReferenceOption[] =
    canServerSearch && q ? (serverResults ?? []) : (baseOptions ?? []).filter((o) => o.label.toLowerCase().includes(q));
  const results = rawResults.filter((o) => !value.includes(o.id));

  function add(opt: ReferenceOption) {
    setLabels((prev) => ({ ...prev, [opt.id]: opt.label }));
    onChange([...value, opt.id]);
    setQuery('');
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex min-h-[38px] w-full flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
        {value.map((id) => (
          <span key={id} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-foreground">
            {labels[id] ?? id}
            {!disabled && (
              <button type="button" onClick={() => remove(id)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${labels[id] ?? id}`}>
                <XMarkIcon className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder={value.length === 0 ? 'Add…' : ''}
            className="min-w-[80px] flex-1 border-none bg-transparent py-0.5 text-sm text-foreground focus:outline-none"
          />
        )}
      </div>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-border bg-surface shadow-lg">
          <div className="max-h-60 overflow-y-auto py-1">
            {results.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => add(opt)}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
              >
                {opt.label}
              </button>
            ))}
            {results.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">{searching || baseOptions === null ? 'Loading…' : 'No matches'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
