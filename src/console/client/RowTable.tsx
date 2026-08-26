import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { useModels } from './models.js';
import { useAuth } from './auth.js';
import { hasPermission, listRows, removeRow } from './api.js';
import { formatCellValue } from './format.js';
import { OperationButton } from './OperationButton.js';
import { queryKeys } from './query-keys.js';
import type { ConsoleModelMeta } from '../serialize-model.js';
import { countFilters, sanitizeFilters, type FilterNode } from './FilterBar.js';
import { ChevronLeftIcon, ChevronRightIcon, EditIcon, FilterIcon, PlusIcon, TrashIcon } from './icons.js';

const DEFAULT_LIMIT = 20;

export interface RowTableQuery {
  filters?: FilterNode[];
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  include?: string[];
  limit?: number;
}

export interface RowTableProps {
  model: ConsoleModelMeta;
  query: RowTableQuery;
  /** the collapsible filter section, revealed by the header's "Filter" toggle — `WorkspaceViewTable`
   * passes its `FilterBar` here; `ModelListPage` leaves it unset (no toggle button then). */
  toolbar?: ReactNode;
  /** where the New/Edit links point, as a prefix for `/new` and `/:id` — defaults to
   * `/${model.name}` (`ModelListPage`'s own route). `WorkspaceViewTable` overrides this to
   * `/workspace/:workspaceId/${model.name}` so the form dialog opens (and stays) nested under the
   * active workspace's route instead of navigating out of it. */
  basePath?: string;
}

/** The table/pagination/New-Edit-Delete rendering shared by `ModelListPage` (plain "browse this
 * model", no filters, default sort) and `WorkspaceViewTable` (a saved filter/sort/columns
 * configuration) — same rendering logic, different `query`. */
export function RowTable({ model, query, toolbar, basePath }: RowTableProps) {
  const { getModel } = useModels();
  const { user } = useAuth();
  const { search } = useLocation();
  const queryClient = useQueryClient();
  const base = basePath ?? `/${model.name}`;

  const [offset, setOffset] = useState(0);

  const activeFilterCount = useMemo(() => countFilters(query.filters), [query.filters]);
  // always collapsed on mount — the header toggle reveals it; the "Filter (n)" badge signals when
  // filters are active while it's closed.
  const [showFilters, setShowFilters] = useState(false);

  const limit = query.limit ?? DEFAULT_LIMIT;
  const queryKeyString = useMemo(() => JSON.stringify([model.name, query]), [model.name, query]);

  const columns = useMemo(() => model.fields.filter((f) => !f.sensitive), [model]);
  const includes = useMemo(
    () => query.include ?? columns.filter((f) => f.kind === 'reference').map((f) => f.key.replace(/Id$/, '')),
    [columns, query.include],
  );

  useEffect(() => setOffset(0), [queryKeyString]);

  const sort = query.sortField ? `${query.sortDirection === 'desc' ? '-' : ''}${query.sortField}` : undefined;
  // incomplete clauses (a reference `=` with nothing picked, an empty number box) are stripped
  // here too — not just on Apply — so a stale/hand-built saved filter can't 500 the listing.
  const filtersForQuery = useMemo(() => sanitizeFilters(query.filters ?? []), [query.filters]);
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
          {toolbar && (
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

      {toolbar && showFilters && toolbar}

      {errorMessage && <p className="mb-3 text-sm text-red-600">{errorMessage}</p>}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">id</th>
              {columns.map((f) => (
                <th key={f.key} className="px-3 py-2">
                  {f.label}
                </th>
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
                    if (f.kind === 'reference') {
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
