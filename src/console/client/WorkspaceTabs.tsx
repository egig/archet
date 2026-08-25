import { useEffect, useState } from 'react';
import { useModels } from './models.js';
import { listRows, createRow, updateRow, removeRow } from './api.js';
import { WorkspaceViewTable, type WorkspaceViewRow } from './WorkspaceViewTable.js';

export interface WorkspaceTabsProps {
  workspaceId: string;
  /** bumped by the parent (`WorkspacePage`) after a chat turn completes, so this refetches — the
   * agent may have opened/edited/closed tabs via its create_workspace_views/... tools during that
   * turn (agent tool calls aren't reflected live, mid-turn; see automation/tool.ts). */
  refreshSignal: number;
}

/** The tab strip + active tab's content for one workspace — add/reorder/close tabs, all backed by
 * plain `workspace_views` rows through the generic (now owner-scoped) `/api/:model` router. */
export function WorkspaceTabs({ workspaceId, refreshSignal }: WorkspaceTabsProps) {
  const { models } = useModels();
  const [views, setViews] = useState<WorkspaceViewRow[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState('');

  async function refresh(preferActiveId?: string) {
    try {
      const page = await listRows('workspace_views', {
        limit: 100,
        offset: 0,
        filters: [['workspaceId', '=', workspaceId]],
        sort: 'order',
      });
      const rows = page.rows as unknown as WorkspaceViewRow[];
      setViews(rows);
      setActiveId((current) => {
        const wanted = preferActiveId ?? current;
        return rows.some((v) => v.id === wanted) ? wanted! : (rows[0]?.id ?? null);
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load tabs');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, refreshSignal]);

  async function addTab() {
    if (!addingModel) return;
    const model = models.find((m) => m.name === addingModel);
    if (!model) return;
    const order = (views?.reduce((max, v) => Math.max(max, v.order), -1) ?? -1) + 1;
    const created = await createRow('workspace_views', {
      workspaceId,
      targetModel: addingModel,
      label: model.label,
      filters: [],
      order,
    });
    setAddingModel('');
    await refresh((created as unknown as WorkspaceViewRow).id);
  }

  async function closeTab(id: string) {
    await removeRow('workspace_views', id);
    await refresh();
  }

  async function move(id: string, direction: -1 | 1) {
    if (!views) return;
    const idx = views.findIndex((v) => v.id === id);
    const swapWith = views[idx + direction];
    if (!swapWith) return;
    const current = views[idx]!;
    await Promise.all([
      updateRow('workspace_views', current.id, { order: swapWith.order }),
      updateRow('workspace_views', swapWith.id, { order: current.order }),
    ]);
    await refresh(id);
  }

  const active = views?.find((v) => v.id === activeId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-200">
        {views?.map((v, i) => (
          <div
            key={v.id}
            className={`flex items-center gap-1 rounded-t border border-b-0 px-3 py-1.5 text-sm ${
              v.id === activeId
                ? 'border-gray-200 bg-white font-medium text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <button type="button" onClick={() => setActiveId(v.id)}>
              {v.label}
            </button>
            <button
              type="button"
              disabled={i === 0}
              onClick={() => void move(v.id, -1)}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={i === views.length - 1}
              onClick={() => void move(v.id, 1)}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              ›
            </button>
            <button type="button" onClick={() => void closeTab(v.id)} className="ml-1 text-gray-400 hover:text-red-600">
              ×
            </button>
          </div>
        ))}

        <div className="ml-2 flex items-center gap-1 pb-1">
          <select
            value={addingModel}
            onChange={(e) => setAddingModel(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">+ Add tab…</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!addingModel}
            onClick={() => void addTab()}
            className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active ? (
          <WorkspaceViewTable
            view={active}
            workspaceId={workspaceId}
            onChange={(next) => setViews((prev) => prev?.map((v) => (v.id === next.id ? next : v)) ?? prev)}
          />
        ) : (
          views && views.length === 0 && <p className="text-sm text-gray-400">No tabs yet — add one above.</p>
        )}
      </div>
    </div>
  );
}
