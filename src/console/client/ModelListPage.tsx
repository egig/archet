import { useParams } from 'react-router';
import { useModels } from './models.js';
import { RowTable } from './RowTable.js';

/** Plain "browse this model" route — no filters, default sort. The table/pagination/New-Edit-
 * Delete rendering itself lives in `RowTable`, shared with `WorkspaceViewTable` (a saved
 * filter/sort/columns configuration against the same generic `/api/:model` data). */
export function ModelListPage() {
  const { model: modelName } = useParams<{ model: string }>();
  const { getModel, loading: modelsLoading } = useModels();
  const model = modelName ? getModel(modelName) : undefined;

  if (modelsLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!model) return <p className="text-sm text-red-600">Unknown model.</p>;

  return <RowTable model={model} query={{}} />;
}
