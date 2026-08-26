import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useModels } from './models.js';
import { listRows, createRow, updateRow, removeRow } from './api.js';
import { WorkspaceViewTable, type WorkspaceViewRow } from './WorkspaceViewTable.js';
import { Dialog } from './Dialog.js';
import { FilterBar, type FilterNode } from './FilterBar.js';

export interface WorkspaceTabsProps {
  workspaceId: string;
  /** bumped by the parent (`WorkspacePage`) after a chat turn completes, so this refetches — the
   * agent may have opened/edited/closed tabs via its create_workspace_views/... tools during that
   * turn (agent tool calls aren't reflected live, mid-turn; see automation/tool.ts). */
  refreshSignal: number;
  /** whether `WorkspacePage` currently renders the agent chat panel — the toggle button lives
   * here, in the tab strip's row, rather than inside the chat panel itself, since a fully-hidden
   * panel wouldn't have anywhere to put a re-open control. */
  chatOpen: boolean;
  /** the workspace's persistent `chatEnabled` setting — when false, chat isn't available at all,
   * so the show/hide toggle button is dropped entirely (not just the panel). */
  chatAvailable: boolean;
  onToggleChat: () => void;
  /** the active workspace's `locked` flag — while true, tabs are frozen (no add/reorder/close) and
   * the active tab's `FilterBar` is hidden; the rows a tab shows stay fully interactive, only the
   * set of tabs and their queries are frozen. */
  locked: boolean;
}

/** The tab strip + active tab's content for one workspace — add/reorder/close tabs, all backed by
 * plain `workspace_views` rows through the generic (now owner-scoped) `/api/:model` router. */
export function WorkspaceTabs({
  workspaceId,
  refreshSignal,
  chatOpen,
  chatAvailable,
  onToggleChat,
  locked,
}: WorkspaceTabsProps) {
  const [views, setViews] = useState<WorkspaceViewRow[] | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  // the tab whose label is currently being edited inline (double-click), and the in-progress text.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  // set by Escape so the input's own onBlur (fired as it unmounts) skips the save.
  const cancelRenameRef = useRef(false);
  // the active tab's view id is mirrored into `?tab=` so a page refresh (or a link straight to a
  // workspace URL) restores the same tab instead of always falling back to the first one.
  const [searchParams, setSearchParams] = useSearchParams();

  function setActiveId(id: string | null) {
    setActiveIdState(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set('tab', id);
        else next.delete('tab');
        return next;
      },
      { replace: true },
    );
  }

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
      const wanted = preferActiveId ?? activeId ?? searchParams.get('tab');
      const resolved = rows.some((v) => v.id === wanted) ? wanted! : (rows[0]?.id ?? null);
      setActiveId(resolved);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load tabs');
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, refreshSignal]);

  async function addTab(input: { targetModel: string; label: string; filters: FilterNode[] }) {
    const order = (views?.reduce((max, v) => Math.max(max, v.order), -1) ?? -1) + 1;
    const created = await createRow('workspace_views', {
      workspaceId,
      targetModel: input.targetModel,
      label: input.label,
      filters: input.filters,
      order,
    });
    setShowAddDialog(false);
    await refresh((created as unknown as WorkspaceViewRow).id);
  }

  async function closeTab(id: string) {
    await removeRow('workspace_views', id);
    await refresh();
  }

  function startRename(view: WorkspaceViewRow) {
    if (locked) return;
    setEditingId(view.id);
    setDraftLabel(view.label);
  }

  async function commitRename(id: string) {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      return;
    }
    const next = draftLabel.trim();
    setEditingId(null);
    const current = views?.find((v) => v.id === id);
    if (!current || !next || next === current.label) return;
    const updated = await updateRow('workspace_views', id, { label: next });
    setViews((prev) => prev?.map((v) => (v.id === id ? (updated as unknown as WorkspaceViewRow) : v)) ?? prev);
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
            {editingId === v.id ? (
              <input
                autoFocus
                type="text"
                maxLength={255}
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onBlur={() => void commitRename(v.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename(v.id);
                  else if (e.key === 'Escape') {
                    cancelRenameRef.current = true;
                    setEditingId(null);
                  }
                }}
                className="w-28 rounded border border-gray-300 px-1 py-0.5 text-sm"
              />
            ) : (
              <button
                type="button"
                onClick={() => setActiveId(v.id)}
                onDoubleClick={() => startRename(v)}
                title={locked ? undefined : 'Double-click to rename'}
              >
                {v.label}
              </button>
            )}
            {!locked && (
              <>
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
              </>
            )}
          </div>
        ))}

        {!locked && (
          <div className="ml-2 pb-1">
            <button
              type="button"
              onClick={() => setShowAddDialog(true)}
              className="rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
            >
              + Add tab
            </button>
          </div>
        )}

        {chatAvailable && (
          <div className="ml-auto pb-1">
            <button
              type="button"
              onClick={onToggleChat}
              title={chatOpen ? 'Hide chat' : 'Show chat'}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
            >
              {chatOpen ? 'Hide chat ›' : '‹ Show chat'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {active ? (
          <WorkspaceViewTable
            view={active}
            workspaceId={workspaceId}
            locked={locked}
            onChange={(next) => setViews((prev) => prev?.map((v) => (v.id === next.id ? next : v)) ?? prev)}
          />
        ) : (
          views && views.length === 0 && <p className="text-sm text-gray-400">No tabs yet — add one above.</p>
        )}
      </div>

      {showAddDialog && <AddTabDialog onClose={() => setShowAddDialog(false)} onCreate={(input) => void addTab(input)} />}
    </div>
  );
}

/** Add-tab dialog: pick a target model, then optionally scope it with a filter clause built
 * through the same `FilterBar` used to edit an existing tab's filters — so a tab can start out
 * already narrowed instead of always opening onto the model's full, unfiltered row set. */
function AddTabDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: { targetModel: string; label: string; filters: FilterNode[] }) => void;
}) {
  const { models, getModel } = useModels();
  const [targetModel, setTargetModel] = useState('');
  // tracks whether the user has typed their own label yet — until they do, it follows the
  // selected model's label so picking a model alone is still enough to add a tab.
  const [label, setLabel] = useState('');
  const [labelEdited, setLabelEdited] = useState(false);
  const [filters, setFilters] = useState<FilterNode[]>([]);
  const model = targetModel ? getModel(targetModel) : undefined;

  return (
    <Dialog onClose={onClose}>
      <h2 className="mb-4 text-base font-semibold text-gray-900">Add tab</h2>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
          <select
            value={targetModel}
            onChange={(e) => {
              const next = e.target.value;
              setTargetModel(next);
              setFilters([]);
              if (!labelEdited) setLabel(getModel(next)?.label ?? '');
            }}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select a model…</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tab name</label>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelEdited(true);
            }}
            placeholder="e.g. Open orders"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>

        {model && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Initial filters</label>
            <FilterBar fields={model.fields} value={filters} onChange={setFilters} />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="button"
          disabled={!model || !label.trim()}
          onClick={() => model && onCreate({ targetModel: model.name, label: label.trim(), filters })}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          Add tab
        </button>
      </div>
    </Dialog>
  );
}
