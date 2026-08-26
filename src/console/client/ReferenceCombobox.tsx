import { useEffect, useMemo, useRef, useState } from 'react';
import { getRow, listRows } from './api.js';
import { useModels } from './models.js';
import type { ReferenceOption } from './fields.js';

const controlClass =
  'w-full rounded border border-gray-300 px-3 py-2 text-left text-sm focus:border-gray-500 focus:outline-none disabled:opacity-50';

export interface ReferenceComboboxProps {
  /** the currently selected row id, or '' for none. */
  value: string;
  onChange: (value: string) => void;
  targetModel: string;
  required: boolean;
  disabled?: boolean;
}

/** A searchable replacement for the plain `<select>` a `reference` field used to render. When the
 * target model's `displayField` is an indexed string/text column, typing filters server-side via
 * `?filter=[displayField, ilike, %q%]` — so it scales past the ~100-row ceiling `useReferenceOptions`
 * has. Otherwise it falls back to fetching the first 100 rows and filtering them in the browser.
 *
 * The selected row's label is resolved with its own `GET /api/:model/:id` so a value that isn't in
 * the current result set still shows its name, not a bare id. */
export function ReferenceCombobox({ value, onChange, targetModel, required, disabled }: ReferenceComboboxProps) {
  const { getModel } = useModels();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReferenceOption | null>(null);
  // the first-100-rows fetch, loaded once the dropdown is first opened; reused for every keystroke
  // on the client-filter path.
  const [baseOptions, setBaseOptions] = useState<ReferenceOption[] | null>(null);
  const [serverResults, setServerResults] = useState<ReferenceOption[] | null>(null);
  const [searching, setSearching] = useState(false);

  const targetMeta = getModel(targetModel);
  const displayField = targetMeta?.displayField ?? 'id';
  const displayMeta = targetMeta?.fields.find((f) => f.key === displayField);
  const canServerSearch = !!displayMeta && (displayMeta.kind === 'string' || displayMeta.kind === 'text') && displayMeta.indexed;

  const toOption = useMemo(
    () => (row: Record<string, unknown>): ReferenceOption => ({
      id: String(row.id),
      label: String(row[displayField] ?? row.id),
    }),
    [displayField],
  );

  // resolve the selected id -> label (independent of the search results, which may not contain it).
  // re-runs if `displayField` arrives late (models still loading on first render) so a label first
  // shown as the raw id gets upgraded once the real display column is known.
  const resolvedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!value) {
      setSelected(null);
      resolvedKey.current = null;
      return;
    }
    const key = `${targetModel}::${displayField}::${value}`;
    if (resolvedKey.current === key) return;
    resolvedKey.current = key;
    let cancelled = false;
    getRow(targetModel, value)
      .then((row) => !cancelled && setSelected(toOption(row)))
      .catch(() => !cancelled && setSelected({ id: value, label: value }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, targetModel, displayField, toOption]);

  // load the fallback list the first time the menu opens.
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

  // server-side search, debounced — only on the indexed-string path.
  useEffect(() => {
    const q = query.trim();
    if (!open || !canServerSearch || !q) {
      setServerResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(() => {
      listRows(targetModel, {
        limit: 20,
        offset: 0,
        filters: [[displayField, 'ilike', `%${q}%`]],
        sort: displayField,
      })
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
  const results: ReferenceOption[] =
    canServerSearch && q
      ? (serverResults ?? [])
      : (baseOptions ?? []).filter((o) => o.label.toLowerCase().includes(q));

  function choose(opt: ReferenceOption | null) {
    // set the label optimistically so the closed control updates without waiting on `getRow`.
    setSelected(opt && opt.id ? opt : null);
    resolvedKey.current = opt && opt.id ? `${targetModel}::${displayField}::${opt.id}` : null;
    onChange(opt?.id ?? '');
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={controlClass}
      >
        {selected ? (
          <span className="text-gray-900">{selected.label}</span>
        ) : (
          <span className="text-gray-400">{required ? 'Select…' : '—'}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-gray-200 bg-white shadow-lg">
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'Enter' && results[0]) {
                e.preventDefault();
                choose(results[0]);
              }
            }}
            className="w-full rounded-t-md border-b border-gray-200 px-3 py-2 text-sm focus:outline-none"
          />
          <div className="max-h-60 overflow-y-auto py-1">
            {!required && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-50"
              >
                — (clear)
              </button>
            )}
            {results.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => choose(opt)}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                  opt.id === value ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {results.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">
                {searching || baseOptions === null ? 'Loading…' : 'No matches'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
