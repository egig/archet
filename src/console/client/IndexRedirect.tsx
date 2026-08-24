import { Navigate } from 'react-router';
import { useModels } from './models.js';

/** The console root itself has no dashboard — land on the first sidebar model once the list has
 * loaded, or say so if this project has no console-visible models at all. */
export function IndexRedirect() {
  const { models, loading } = useModels();

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (models.length === 0) return <p className="text-sm text-gray-500">No models registered for the console.</p>;

  return <Navigate to={`/${models[0]!.name}`} replace />;
}
