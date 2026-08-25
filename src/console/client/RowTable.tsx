import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useModels } from './models.js';
import { useAuth } from './auth.js';
import { hasPermission, listRows, removeRow, type OffsetPage } from './api.js';
import { formatCellValue } from './format.js';
import type { ConsoleModelMeta } from '../serialize-model.js';

const DEFAULT_LIMIT = 20;

export interface RowTableQuery {
  filters?: [string, string, unknown][];
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  include?: string[];
  limit?: number;
}

export interface RowTableProps {
  model: ConsoleModelMeta;
  query: RowTableQuery;
  /** rendered between the New-button header and the table itself — `WorkspaceViewTable` uses
   * this slot for its `FilterBar`; `ModelListPage` leaves it unset. */
  toolbar?: ReactNode;
}

/** The table/pagination/New-Edit-Delete rendering shared by `ModelListPage` (plain "browse this
 * model", no filters, default sort) and `WorkspaceViewTable` (a saved filter/sort/columns
 * configuration) — same rendering logic, different `query`. */
export function RowTable({ model, query, toolbar }: RowTableProps) {
  const { getModel } = useModels();
  const { user } = useAuth();

  const [page, setPage] = useState<OffsetPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = query.limit ?? DEFAULT_LIMIT;
  const queryKey = useMemo(() => JSON.stringify([model.name, query]), [model.name, query]);

  const columns = useMemo(() => model.fields.filter((f) => !f.sensitive), [model]);
  const includes = useMemo(
    () => query.include ?? columns.filter((f) => f.kind === 'reference').map((f) => f.key.replace(/Id$/, '')),
    [columns, query.include],
  );

  useEffect(() => setOffset(0), [queryKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const sort = query.sortField ? `${query.sortDirection === 'desc' ? '-' : ''}${query.sortField}` : undefined;
    listRows(model.name, { limit, offset, include: includes, filters: query.filters, sort })
      .then((p) => !cancelled && setPage(p))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, offset]);

  const canCreate = hasPermission(user?.permissions ?? [], model.name, 'create');
  const canUpdate = hasPermission(user?.permissions ?? [], model.name, 'update');
  const canRemove = hasPermission(user?.permissions ?? [], model.name, 'remove');

  async function handleDelete(id: string) {
    if (!window.confirm(`Delete this ${model.label.replace(/s$/, '')}?`)) return;
    await removeRow(model.name, id);
    const sort = query.sortField ? `${query.sortDirection === 'desc' ? '-' : ''}${query.sortField}` : undefined;
    setPage(await listRows(model.name, { limit, offset, include: includes, filters: query.filters, sort }));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">{model.label}</h1>
        {canCreate && (
          <Link to={`/${model.name}/new`} className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800">
            New
          </Link>
        )}
      </div>

      {toolbar}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

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
              {(canUpdate || canRemove) && <th className="px-3 py-2" />}
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
                  {(canUpdate || canRemove) && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canUpdate && (
                        <Link to={`/${model.name}/${id}`} className="mr-3 text-gray-600 hover:underline">
                          Edit
                        </Link>
                      )}
                      {canRemove && (
                        <button type="button" onClick={() => void handleDelete(id)} className="text-red-600 hover:underline">
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
              className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={offset + limit >= page.total}
              onClick={() => setOffset(offset + limit)}
              className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
