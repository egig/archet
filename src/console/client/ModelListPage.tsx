import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useModels } from './models.js';
import { useAuth } from './auth.js';
import { hasPermission, listRows, removeRow, type OffsetPage } from './api.js';
import { formatCellValue } from './format.js';

const PAGE_SIZE = 20;

export function ModelListPage() {
  const { model: modelName } = useParams<{ model: string }>();
  const { getModel, loading: modelsLoading } = useModels();
  const { user } = useAuth();
  const model = modelName ? getModel(modelName) : undefined;

  const [page, setPage] = useState<OffsetPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => (model ? model.fields.filter((f) => !f.sensitive) : []), [model]);
  const includes = useMemo(
    () => columns.filter((f) => f.kind === 'reference').map((f) => f.key.replace(/Id$/, '')),
    [columns],
  );

  useEffect(() => setOffset(0), [modelName]);

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    setLoading(true);
    listRows(model.name, { limit: PAGE_SIZE, offset, include: includes })
      .then((p) => !cancelled && setPage(p))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.name, offset]);

  if (modelsLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!model) return <p className="text-sm text-red-600">Unknown model.</p>;

  const canCreate = hasPermission(user?.permissions ?? [], model.name, 'create');
  const canUpdate = hasPermission(user?.permissions ?? [], model.name, 'update');
  const canRemove = hasPermission(user?.permissions ?? [], model.name, 'remove');

  async function handleDelete(id: string) {
    if (!model) return;
    if (!window.confirm(`Delete this ${model.label.replace(/s$/, '')}?`)) return;
    await removeRow(model.name, id);
    setPage(await listRows(model.name, { limit: PAGE_SIZE, offset, include: includes }));
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
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
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
