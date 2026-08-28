import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useModels } from './models.js';
import { useAuth } from './auth.js';
import { hasPermission, listRows, removeRow } from './api.js';
import { formatCellValue } from './format.js';
import { OperationButton } from './OperationButton.js';
import { queryKeys } from './query-keys.js';
import type { ConsoleFieldMeta, ConsoleModelMeta } from '../serialize-model.js';
import { countFilters, sanitizeFilters, FilterBar, type FilterClause, type FilterNode } from './FilterBar.js';
import { SortBar, sortableOptions, type SortKey } from './SortBar.js';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  EditIcon,
  FilterIcon,
  PlusIcon,
  SortIcon,
  TrashIcon,
} from './icons.js';

const DEFAULT_LIMIT = 20;

/** The URL query-string key the built-in filter builder reads/writes its clause set into (as JSON)
 * — mirrors `WorkspaceTabs`' `?tab=`, so an ad-hoc filter survives a reload and is shareable. */
const AD_HOC_FILTER_PARAM = 'filter';

/** The URL query-string key the header clicks / built-in `SortBar` read/write their ordered sort
 * spec into, as a comma-separated `field,-field2` list (the exact shape the API's `?sort=` takes)
 * — an ad-hoc overlay on top of `query.sort` (a saved View's sort, or the server default), in the
 * same spirit as `?filter=`: shareable, survives a reload. Used only when `builtinSort` is on
 * (`ModelListPage`); `WorkspaceViewTable` persists to its row instead. */
const AD_HOC_SORT_PARAM = 'sort';

/** Keeps only well-formed `[field, op, value]` clauses (and the non-empty groups of them) whose
 * field is an indexed column on the model currently being shown. This is what lets a `?filter=`
 * param built on one model's page be silently ignored on another's — and keeps a hand-edited URL
 * from reaching the query layer with a field the server would 400 on. */
function keepKnownClauses(value: unknown, indexedFields: ConsoleFieldMeta[]): FilterNode[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(indexedFields.map((f) => f.key));
  const isClause = (c: unknown): c is FilterClause =>
    Array.isArray(c) && c.length === 3 && typeof c[0] === 'string' && known.has(c[0]) && typeof c[1] === 'string';
  const out: FilterNode[] = [];
  for (const node of value) {
    if (Array.isArray(node) && (node[0] === 'and' || node[0] === 'or') && Array.isArray(node[1])) {
      const conds = (node[1] as unknown[]).filter(isClause);
      if (conds.length > 0) out.push([node[0], conds]);
    } else if (isClause(node)) {
      out.push(node);
    }
  }
  return out;
}

export interface RowTableQuery {
  filters?: FilterNode[];
  /** the applied (base) sort — a saved View's, from `WorkspaceViewTable`; empty/absent means the
   * server's default order. In `builtinSort` mode a `?sort=` URL overlay replaces this. */
  sort?: SortKey[];
  include?: string[];
  limit?: number;
}

export interface RowTableProps {
  model: ConsoleModelMeta;
  query: RowTableQuery;
  /** the collapsible filter section, revealed by the header's "Filter" toggle — `WorkspaceViewTable`
   * passes its own persist-on-Apply `FilterBar` here. When left unset (e.g. `ModelListPage`), the
   * table renders its own built-in `FilterBar` instead (see `builtinFilters`), whose clauses live
   * in the URL as an ad-hoc, non-persisted overlay on top of `query.filters`. */
  toolbar?: ReactNode;
  /** set `false` to suppress the built-in ad-hoc filter builder even when no `toolbar` is passed —
   * `WorkspaceViewTable` does this so a locked view shows no filter UI at all. Defaults to `true`. */
  builtinFilters?: boolean;
  /** the collapsible sort section, revealed by the header's "Sort" toggle — `WorkspaceViewTable`
   * passes its own persist-to-row `SortBar` here. When left unset the table renders its own
   * built-in `SortBar` (see `builtinSort`). */
  sortToolbar?: ReactNode;
  /** `true` (default): the table owns sorting through a `?sort=` URL overlay + a built-in `SortBar`
   * and header clicks. `false` (`WorkspaceViewTable`): `query.sort` is the source of truth and
   * `onSortChange` persists edits — no URL param. */
  builtinSort?: boolean;
  /** controlled-mode sort setter (`builtinSort={false}`) — header clicks / `sortToolbar` edits call
   * this. Omitted for a locked View, which makes the headers non-interactive. */
  onSortChange?: (sort: SortKey[]) => void;
  /** where the New/Edit links point, as a prefix for `/new` and `/:id` — defaults to
   * `/${model.name}` (`ModelListPage`'s own route). `WorkspaceViewTable` overrides this to
   * `/workspace/:workspaceId/${model.name}` so the form dialog opens (and stays) nested under the
   * active workspace's route instead of navigating out of it. */
  basePath?: string;
}

/** One column heading. A `sortable` + `interactive` column is a button — a plain click cycles it as
 * the sole sort (asc → desc → cleared), shift-click appends/toggles it as a secondary key; it shows
 * an up/down chevron while active, plus a small ordinal when more than one key is in effect. A
 * non-sortable (or non-interactive) column is plain text, still showing the arrow if it's sorted. */
function HeaderCell({
  label,
  sortable,
  interactive = true,
  direction,
  ordinal,
  onSort,
}: {
  label: string;
  sortable: boolean;
  interactive?: boolean;
  /** this column's sort direction when it's one of the active keys, otherwise `undefined`. */
  direction?: 'asc' | 'desc';
  /** 1-based position among the active keys — passed only when more than one key is in effect. */
  ordinal?: number;
  onSort: (shiftKey: boolean) => void;
}) {
  if (!sortable || (!interactive && !direction)) return <th className="px-3 py-2">{label}</th>;

  const indicator =
    direction === 'desc' ? (
      <ChevronDownIcon className="h-3.5 w-3.5" />
    ) : direction === 'asc' ? (
      <ChevronUpIcon className="h-3.5 w-3.5" />
    ) : (
      <ChevronUpDownIcon className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-400" />
    );
  const inner = (
    <>
      {label}
      {indicator}
      {ordinal != null && <span className="text-[10px] font-semibold text-gray-400">{ordinal}</span>}
    </>
  );

  return (
    <th className="px-3 py-2" aria-sort={direction === 'desc' ? 'descending' : direction === 'asc' ? 'ascending' : 'none'}>
      {interactive ? (
        <button
          type="button"
          onClick={(e) => onSort(e.shiftKey)}
          title="Click to sort · Shift-click to add a secondary sort"
          className="group -mx-1 flex items-center gap-1 rounded px-1 uppercase hover:text-gray-700"
        >
          {inner}
        </button>
      ) : (
        <span className="group flex items-center gap-1">{inner}</span>
      )}
    </th>
  );
}

/** The table/pagination/New-Edit-Delete rendering shared by `ModelListPage` (plain "browse this
 * model", default sort, with a built-in ad-hoc `?filter=` builder) and `WorkspaceViewTable` (a
 * saved filter/sort/columns configuration) — same rendering logic, different `query`. */
export function RowTable({
  model,
  query,
  toolbar,
  builtinFilters = true,
  sortToolbar,
  builtinSort = true,
  onSortChange,
  basePath,
}: RowTableProps) {
  const { getModel } = useModels();
  const { user } = useAuth();
  const { search } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const base = basePath ?? `/${model.name}`;

  const [offset, setOffset] = useState(0);

  // the built-in ad-hoc filter builder — shown only when the caller isn't supplying its own
  // `toolbar` and the model has at least one indexed (filterable) column.
  const indexedFields = useMemo(() => model.fields.filter((f) => f.indexed), [model]);
  const builtinFilterShown = builtinFilters && !toolbar && indexedFields.length > 0;

  // ad-hoc clauses parsed from `?filter=<json>` — validated against this model's indexed fields so
  // a stale param from another model's page (or a hand-edited URL) is simply ignored.
  const adHocFilters = useMemo<FilterNode[]>(() => {
    if (!builtinFilterShown) return [];
    const raw = searchParams.get(AD_HOC_FILTER_PARAM);
    if (!raw) return [];
    try {
      return keepKnownClauses(JSON.parse(raw), indexedFields);
    } catch {
      return [];
    }
  }, [builtinFilterShown, searchParams, indexedFields]);

  // the in-progress builder draft, re-synced whenever the applied (URL) set changes out from under
  // it — a back/forward nav, or this instance being reused for another model.
  const [draftFilters, setDraftFilters] = useState<FilterNode[]>(adHocFilters);
  const adHocKey = JSON.stringify(adHocFilters);
  useEffect(() => {
    setDraftFilters(adHocFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adHocKey]);

  // `query.filters` (a saved base, from `WorkspaceViewTable`) AND the ad-hoc overlay — top-level
  // clauses are implicitly AND'd by the query layer, so concatenation is the right merge.
  const effectiveFilters = useMemo(
    () => [...(query.filters ?? []), ...adHocFilters],
    [query.filters, adHocFilters],
  );

  const activeFilterCount = useMemo(() => countFilters(effectiveFilters), [effectiveFilters]);
  // always collapsed on mount — the header toggle reveals it; the "Filter (n)" / "Sort (n)" badges
  // signal when filters/sort are active while closed.
  const [showFilters, setShowFilters] = useState(false);
  const [showSort, setShowSort] = useState(false);

  // Sort — an ordered list of `[field, direction]` keys. `builtinSort` (ModelListPage): the applied
  // set lives in a `?sort=a,-b` URL overlay on top of `query.sort`, edited by header clicks and the
  // built-in `SortBar`. Controlled (`builtinSort={false}`, WorkspaceViewTable): `query.sort` is the
  // source of truth and `onSortChange` persists edits. Sortable columns mirror the server's
  // `isFilterableOrSortable` gate (see `sortableOptions`), so a stale/hand-edited key is ignored.
  const sortControlled = !builtinSort;
  const sortInteractive = !sortControlled || !!onSortChange;
  const sortableKeys = useMemo(() => new Set(sortableOptions(model).map((o) => o.key)), [model]);

  const adHocSort = useMemo<SortKey[]>(() => {
    if (sortControlled) return [];
    const raw = searchParams.get(AD_HOC_SORT_PARAM);
    if (!raw) return [];
    const seen = new Set<string>();
    const out: SortKey[] = [];
    for (const segment of raw.split(',')) {
      const s = segment.trim();
      if (!s) continue;
      const direction: 'asc' | 'desc' = s.startsWith('-') ? 'desc' : 'asc';
      const field = s.replace(/^-/, '');
      if (!sortableKeys.has(field) || seen.has(field)) continue;
      seen.add(field);
      out.push({ field, direction });
    }
    return out;
  }, [sortControlled, searchParams, sortableKeys]);

  // the ad-hoc overlay wins wholesale when present, otherwise `query.sort` (a saved View's, or none).
  const effectiveSort: SortKey[] = adHocSort.length > 0 ? adHocSort : (query.sort ?? []);
  const effectiveSortKey = effectiveSort.map((s) => (s.direction === 'desc' ? '-' : '') + s.field).join(',');

  function applySort(next: SortKey[]) {
    if (sortControlled) {
      onSortChange?.(next);
      return;
    }
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.length === 0) p.delete(AD_HOC_SORT_PARAM);
        else p.set(AD_HOC_SORT_PARAM, next.map((s) => (s.direction === 'desc' ? '-' : '') + s.field).join(','));
        return p;
      },
      { replace: true },
    );
  }

  function headerClickSort(key: string, shiftKey: boolean) {
    const idx = effectiveSort.findIndex((s) => s.field === key);
    if (shiftKey) {
      // add as a secondary key, or flip its direction if it's already in the list
      if (idx === -1) applySort([...effectiveSort, { field: key, direction: 'asc' }]);
      else applySort(effectiveSort.map((s, i) => (i === idx ? { ...s, direction: s.direction === 'asc' ? 'desc' : 'asc' } : s)));
      return;
    }
    // plain click: collapse to this one key, cycling asc → desc → cleared when it's already sole
    if (idx === -1 || effectiveSort.length !== 1) applySort([{ field: key, direction: 'asc' }]);
    else if (effectiveSort[0]!.direction === 'asc') applySort([{ field: key, direction: 'desc' }]);
    else applySort([]);
  }

  const sortDirOf = (key: string) => effectiveSort.find((s) => s.field === key)?.direction;
  const sortOrdinalOf = (key: string) => {
    if (effectiveSort.length < 2) return undefined;
    const i = effectiveSort.findIndex((s) => s.field === key);
    return i === -1 ? undefined : i + 1;
  };

  const limit = query.limit ?? DEFAULT_LIMIT;
  const queryKeyString = useMemo(
    () => JSON.stringify([model.name, query, adHocKey, effectiveSortKey]),
    [model.name, query, adHocKey, effectiveSortKey],
  );

  function applyAdHocFilters(next: FilterNode[]) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next.length === 0) p.delete(AD_HOC_FILTER_PARAM);
        else p.set(AD_HOC_FILTER_PARAM, JSON.stringify(next));
        return p;
      },
      { replace: true },
    );
  }

  const builtinFilterBar = builtinFilterShown ? (
    <FilterBar
      fields={model.fields}
      value={draftFilters}
      onChange={setDraftFilters}
      onApply={applyAdHocFilters}
      dirty={JSON.stringify(draftFilters) !== adHocKey}
    />
  ) : null;
  const filterPanel = toolbar ?? builtinFilterBar;

  // Sort panel: the caller's own `sortToolbar` (WorkspaceViewTable) or a built-in `SortBar` writing
  // the `?sort=` overlay. A locked View passes neither → no panel, and `sortInteractive` is false.
  const sortPanel = sortControlled ? (sortToolbar ?? null) : <SortBar model={model} value={effectiveSort} onChange={applySort} />;

  const columns = useMemo(
    () => model.fields.filter((f) => !f.sensitive && !f.hideInTable),
    [model],
  );
  const includes = useMemo(
    () =>
      query.include ??
      columns.filter((f) => f.kind === 'reference' || f.kind === 'tree').map((f) => f.key.replace(/Id$/, '')),
    [columns, query.include],
  );

  useEffect(() => setOffset(0), [queryKeyString]);

  const sort = effectiveSortKey || undefined;
  // incomplete clauses (a reference `=` with nothing picked, an empty number box) are stripped
  // here too — not just on Apply — so a stale/hand-built saved filter can't 500 the listing.
  const filtersForQuery = useMemo(() => sanitizeFilters(effectiveFilters), [effectiveFilters]);
  const listParams = { limit, offset, include: includes, filters: filtersForQuery, sort };

  const {
    data: page,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: queryKeys.rows(model.name, listParams),
    queryFn: () => listRows(model.name, listParams),
    placeholderData: keepPreviousData,
  });

  const canCreate = hasPermission(user?.permissions ?? [], model.name, 'create');
  const canUpdate = hasPermission(user?.permissions ?? [], model.name, 'update');
  const canRemove = hasPermission(user?.permissions ?? [], model.name, 'remove');
  // Custom operations (core/model.ts's `CustomOperationDefinition`) placed in the row actions —
  // permission-gated the same way Edit/Delete are (`resource:operationName`); `visibleWhen`
  // (Q13, per-row data) is checked per row by `OperationButton` itself, not here.
  const rowOperations = model.operations.filter(
    (op) => op.placement.includes('row') && hasPermission(user?.permissions ?? [], model.name, op.name),
  );

  function refetchRows() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.rows(model.name), exact: false });
  }

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeRow(model.name, id),
    onSuccess: refetchRows,
  });

  async function handleDelete(id: string) {
    if (!window.confirm(`Delete this ${model.label.replace(/s$/, '')}?`)) return;
    await removeMutation.mutateAsync(id);
  }

  const errorMessage = error ? (error instanceof Error ? error.message : 'failed to load') : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{model.label}</h1>
        <div className="flex items-center gap-2">
          {filterPanel && (
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm ${
                showFilters
                  ? 'border-gray-400 bg-gray-100 text-gray-800'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FilterIcon className="h-4 w-4" />
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
          )}
          {sortPanel && (
            <button
              type="button"
              onClick={() => setShowSort((v) => !v)}
              aria-expanded={showSort}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm ${
                showSort
                  ? 'border-gray-400 bg-gray-100 text-gray-800'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <SortIcon className="h-4 w-4" />
              Sort{effectiveSort.length > 0 ? ` (${effectiveSort.length})` : ''}
            </button>
          )}
          {canCreate && (
            <Link
              to={{ pathname: `${base}/new`, search }}
              className="flex items-center gap-1.5 rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              <PlusIcon className="h-4 w-4" />
              New
            </Link>
          )}
        </div>
      </div>

      {filterPanel && showFilters && filterPanel}
      {sortPanel && showSort && sortPanel}

      {errorMessage && <p className="mb-3 text-sm text-red-600">{errorMessage}</p>}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <HeaderCell
                label="id"
                sortable={sortableKeys.has('id')}
                interactive={sortInteractive}
                direction={sortDirOf('id')}
                ordinal={sortOrdinalOf('id')}
                onSort={(shiftKey) => headerClickSort('id', shiftKey)}
              />
              {columns.map((f) => (
                <HeaderCell
                  key={f.key}
                  label={f.label}
                  sortable={sortableKeys.has(f.key)}
                  interactive={sortInteractive}
                  direction={sortDirOf(f.key)}
                  ordinal={sortOrdinalOf(f.key)}
                  onSort={(shiftKey) => headerClickSort(f.key, shiftKey)}
                />
              ))}
              {(canUpdate || canRemove || rowOperations.length > 0) && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {page?.rows.map((row) => {
              const id = String(row.id);
              return (
                <tr key={id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{id.slice(0, 8)}</td>
                  {columns.map((f) => {
                    if (f.kind === 'reference' || f.kind === 'tree') {
                      const relation = f.key.replace(/Id$/, '');
                      const related = row[relation] as Record<string, unknown> | null | undefined;
                      const targetDisplayField = getModel(f.targetModel ?? '')?.displayField ?? 'id';
                      return (
                        <td key={f.key} className="px-3 py-2">
                          {related ? formatCellValue(related[targetDisplayField]) : formatCellValue(row[f.key])}
                        </td>
                      );
                    }
                    if (f.kind === 'file') {
                      const stored = row[f.key] as { url?: string; filename?: string } | null | undefined;
                      return (
                        <td key={f.key} className="px-3 py-2">
                          {!stored ? (
                            formatCellValue(null)
                          ) : f.preview === 'image' && stored.url ? (
                            <img src={stored.url} alt={stored.filename ?? ''} className="h-8 w-8 rounded object-cover" />
                          ) : (
                            <span className="text-xs text-gray-600">{stored.filename ?? '—'}</span>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={f.key} className="px-3 py-2">
                        {formatCellValue(row[f.key])}
                      </td>
                    );
                  })}
                  {(canUpdate || canRemove || rowOperations.length > 0) && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canUpdate && (
                        <Link
                          to={{ pathname: `${base}/${id}`, search }}
                          className="mr-3 inline-flex items-center gap-1 align-middle text-gray-600 hover:underline"
                        >
                          <EditIcon className="h-4 w-4" />
                          Edit
                        </Link>
                      )}
                      {rowOperations.map((op) => (
                        <OperationButton key={op.name} modelName={model.name} id={id} row={row} operation={op} onDone={refetchRows} />
                      ))}
                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(id)}
                          className="inline-flex items-center gap-1 align-middle text-red-600 hover:underline"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!loading && page?.rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-gray-400">
                  No records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {page && (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <span>
            {page.total === 0
              ? '0 records'
              : `${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)} of ${page.total}`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="flex items-center gap-1 rounded border border-gray-300 py-1 pl-2 pr-3 disabled:opacity-40"
            >
              <ChevronLeftIcon className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              disabled={offset + limit >= page.total}
              onClick={() => setOffset(offset + limit)}
              className="flex items-center gap-1 rounded border border-gray-300 py-1 pl-3 pr-2 disabled:opacity-40"
            >
              Next
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
