import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useModels } from './models.js';
import { updateRow } from './api.js';
import { RowTable } from './RowTable.js';
import { FilterBar, type FilterNode } from './FilterBar.js';

export interface WorkspaceViewRow {
  id: string;
  workspaceId: string;
  targetModel: string;
  label: string;
  filters: FilterNode[] | null;
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
  /** the parent workspace's `locked` flag — while true, the `FilterBar` (editing this View's own
   * query) is hidden; the underlying `RowTable` (the target model's actual rows) stays fully
   * interactive, since row data isn't part of what locking freezes. */
  locked: boolean;
}

function sameFilters(a: FilterNode[], b: FilterNode[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** One workspace tab's content: the saved query rendered through the shared `RowTable`, plus a
 * `FilterBar` (revealed by RowTable's "Filter" toggle) for editing its filters by hand. Edits are
 * held as a local draft and only run/persisted when the user hits "Apply" — so a half-built clause
 * (e.g. a reference `=` with nothing picked) never reaches the query layer. A committed set
 * persists back to the same `workspace_views` row an agent's `update_workspace_views` tool edits. */
export function WorkspaceViewTable({ view, workspaceId, onChange, locked }: WorkspaceViewTableProps) {
  const { getModel } = useModels();
  const model = getModel(view.targetModel);

  const applied = view.filters ?? [];
  const [draftFilters, setDraftFilters] = useState<FilterNode[]>(applied);
  // re-sync the draft whenever the persisted set changes out from under us — an agent's
  // `update_workspace_views` call, or this component instance being reused for another tab.
  useEffect(() => {
    setDraftFilters(view.filters ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, JSON.stringify(view.filters)]);

  const persistFiltersMutation = useMutation({
    mutationFn: (filters: FilterNode[]) => updateRow('workspace_views', view.id, { filters }),
    onSuccess: (updated) => onChange(updated as unknown as WorkspaceViewRow),
  });

  function applyFilters(filters: FilterNode[]) {
    setDraftFilters(filters);
    persistFiltersMutation.mutate(filters);
  }

  if (!model) return <p className="text-sm text-red-600">Unknown model '{view.targetModel}'.</p>;

  const hasFilterableFields = model.fields.some((f) => f.indexed);

  return (
    <RowTable
      model={model}
      query={{
        filters: applied,
        sortField: view.sortField ?? undefined,
        sortDirection: view.sortDirection,
        include: view.include ?? undefined,
        limit: view.limit,
      }}
      basePath={`/workspace/${workspaceId}/${model.name}`}
      toolbar={
        !locked && hasFilterableFields ? (
          <FilterBar
            fields={model.fields}
            value={draftFilters}
            onChange={setDraftFilters}
            onApply={applyFilters}
            dirty={!sameFilters(draftFilters, applied)}
            applying={persistFiltersMutation.isPending}
          />
        ) : undefined
      }
    />
  );
}
