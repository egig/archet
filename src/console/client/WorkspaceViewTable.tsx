import { useModels } from './models.js';
import { updateRow } from './api.js';
import { RowTable } from './RowTable.js';
import { FilterBar, type FilterClause } from './FilterBar.js';

export interface WorkspaceViewRow {
  id: string;
  workspaceId: string;
  targetModel: string;
  label: string;
  filters: FilterClause[] | null;
  sortField: string | null;
  sortDirection: 'asc' | 'desc';
  include: string[] | null;
  limit: number;
  order: number;
}

export interface WorkspaceViewTableProps {
  view: WorkspaceViewRow;
  workspaceId: string;
  /** called with the server's own copy of the row after a persisted edit (filters, for now) —
   * lets the owning `WorkspaceTabs` keep its tab list in sync without a full refetch. */
  onChange: (next: WorkspaceViewRow) => void;
}

/** One workspace tab's content: the saved query rendered through the shared `RowTable`, plus a
 * `FilterBar` (RowTable's `toolbar` slot) for editing its filters by hand — edits persist back to
 * the `workspace_views` row immediately, the same row an agent's `update_workspace_views` tool
 * call would edit. */
export function WorkspaceViewTable({ view, workspaceId, onChange }: WorkspaceViewTableProps) {
  const { getModel } = useModels();
  const model = getModel(view.targetModel);

  if (!model) return <p className="text-sm text-red-600">Unknown model '{view.targetModel}'.</p>;

  async function persistFilters(filters: FilterClause[]) {
    const updated = await updateRow('workspace_views', view.id, { filters });
    onChange(updated as unknown as WorkspaceViewRow);
  }

  return (
    <RowTable
      model={model}
      query={{
        filters: view.filters ?? [],
        sortField: view.sortField ?? undefined,
        sortDirection: view.sortDirection,
        include: view.include ?? undefined,
        limit: view.limit,
      }}
      basePath={`/workspace/${workspaceId}/${model.name}`}
      toolbar={<FilterBar fields={model.fields} value={view.filters ?? []} onChange={(filters) => void persistFilters(filters)} />}
    />
  );
}
