import { useEffect, useMemo, useRef, useState } from 'react';
import { getRow, listRows } from './api.js';
import { useModels } from './models.js';
import type { ReferenceOption } from './fields.js';
import { ChevronUpDownIcon, MagnifyingGlassIcon, XMarkIcon } from './icons.js';

const controlClass =
  'flex w-full items-center gap-2 rounded border border-gray-300 px-3 py-2 text-left text-sm focus:border-gray-500 focus:outline-none disabled:opacity-50';

/** A large-enough ceiling that a real chart-of-accounts/category tree fits in one fetch — this
 * component builds the whole hierarchy client-side (there's no server-side "give me this node's
 * breadcrumb" endpoint), so unlike `ReferenceCombobox` there's no server-search fallback for a
 * tree that outgrows it. */
const MAX_ROWS = 1000;

export interface TreeComboboxProps {
  /** the currently selected row id, or '' for none (root). */
  value: string;
  onChange: (value: string) => void;
  /** always the field's own model (a `field.tree()` is inherently self-referential). */
  targetModel: string;
  required: boolean;
  disabled?: boolean;
  /** the record currently being edited, so it — and everything beneath it — can be excluded from
   * the option list: picking either as this record's parent would create a cycle. `undefined` on
   * create (a not-yet-existing row can't be anyone's ancestor). */
  excludeId?: string;
}

interface TreeOption extends ReferenceOption {
  /** ids from the root down to this row's immediate parent, for computing the breadcrumb label
   * and for finding every excludeId descendant in one pass. */
  ancestorIds: string[];
}

/** Builds each row's breadcrumb label ("Assets / Current Assets / Cash") and ancestor-id chain by
 * walking `parentIdKey` links across the full row set. A `parentId` pointing at a row missing from
 * `rows` (already excluded, or genuinely dangling) just stops that walk early rather than
 * throwing — same "don't let bad data break the picker" spirit as `ReferenceCombobox`'s catch
 * fallbacks. A defensive `visited` set stops a walk that finds a cycle in already-stored data
 * (shouldn't happen — `core/tree.ts` prevents writing one — but this only *reads* rows, so it
 * can't assume every row it sees came through that guard). */
function buildTreeOptions(
  rows: Record<string, unknown>[],
  displayField: string,
  parentIdKey: string,
): TreeOption[] {
  const byId = new Map(rows.map((row) => [String(row.id), row]));

  function ancestorIdsOf(id: string): string[] {
    const chain: string[] = [];
    const visited = new Set<string>();
    let cursor: string | null = id;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const row = byId.get(cursor);
      const parentId = row ? (row[parentIdKey] as string | null | undefined) : null;
      if (!parentId || !byId.has(parentId)) break;
      chain.unshift(parentId);
      cursor = parentId;
    }
    return chain;
  }

  return rows.map((row) => {
    const id = String(row.id);
    const ancestorIds = ancestorIdsOf(id);
    const labelOf = (rowId: string) => String(byId.get(rowId)?.[displayField] ?? rowId);
    const label = [...ancestorIds.map(labelOf), labelOf(id)].join(' / ');
    return { id, label, ancestorIds };
  });
}

/** The `field.tree()` counterpart to `ReferenceCombobox` — a searchable picker over the *same*
 * model's own rows, labeled with each option's full breadcrumb path instead of a bare
 * `displayField` value, and defensively excluding the record being edited plus every one of its
 * descendants (the server rejects a cycle regardless — `core/tree.ts`'s `wouldCreateTreeCycle`,
 * run by `persistWrite` — this just keeps an invalid choice from being offered in the first
 * place). Fetches up to `MAX_ROWS` rows once, up front: there's no per-keystroke server search
 * here the way `ReferenceCombobox` has, since building a breadcrumb needs the whole tree in memory
 * anyway.
 */
export function TreeCombobox({ value, onChange, targetModel, required, disabled, excludeId }: TreeComboboxProps) {
  const { getModel } = useModels();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReferenceOption | null>(null);
  const [allOptions, setAllOptions] = useState<TreeOption[] | null>(null);

  const targetMeta = getModel(targetModel);
  const displayField = targetMeta?.displayField ?? 'id';
  const parentIdKey = useMemo(
    () => targetMeta?.fields.find((f) => f.kind === 'tree')?.key ?? 'parentId',
    [targetMeta],
  );

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    getRow(targetModel, value)
      .then((row) => !cancelled && setSelected({ id: value, label: String(row[displayField] ?? value) }))
      .catch(() => !cancelled && setSelected({ id: value, label: value }));
    return () => {
      cancelled = true;
    };
  }, [value, targetModel, displayField]);

  useEffect(() => {
    if (!open || allOptions !== null) return;
    let cancelled = false;
    listRows(targetModel, { limit: MAX_ROWS, offset: 0 })
      .then((page) => !cancelled && setAllOptions(buildTreeOptions(page.rows, displayField, parentIdKey)))
      .catch(() => !cancelled && setAllOptions([]));
    return () => {
      cancelled = true;
    };
  }, [open, targetModel, displayField, parentIdKey, allOptions]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = (allOptions ?? [])
    .filter((opt) => !excludeId || (opt.id !== excludeId && !opt.ancestorIds.includes(excludeId)))
    .filter((opt) => !q || opt.label.toLowerCase().includes(q));

  function choose(opt: ReferenceOption | null) {
    setSelected(opt && opt.id ? opt : null);
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
          <span className="min-w-0 flex-1 truncate text-gray-900">{selected.label}</span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-gray-400">{required ? 'Select…' : '— (root) —'}</span>
        )}
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3">
            <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-gray-400" />
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
              className="w-full py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {!required && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-50"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
                Clear (make root)
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
              <p className="px-3 py-2 text-xs text-gray-400">{allOptions === null ? 'Loading…' : 'No matches'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
