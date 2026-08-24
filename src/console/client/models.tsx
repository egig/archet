import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listModels } from './api.js';
import type { ConsoleModelMeta } from '../serialize-model.js';

interface ModelsState {
  models: ConsoleModelMeta[];
  loading: boolean;
  error: string | null;
  getModel: (name: string) => ConsoleModelMeta | undefined;
}

const ModelsContext = createContext<ModelsState | null>(null);

/** One fetch of the console's `/meta/models` endpoint covers the sidebar, the current model's
 * list/form, and every reference field's target-model lookup (for its `displayField`) — avoids a
 * per-view or per-reference-field round trip. */
export function ModelsProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ConsoleModelMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listModels()
      .then((data) => !cancelled && setModels(data))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : 'failed to load models'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const getModel = useMemo(() => (name: string) => models.find((m) => m.name === name), [models]);

  return <ModelsContext.Provider value={{ models, loading, error, getModel }}>{children}</ModelsContext.Provider>;
}

export function useModels(): ModelsState {
  const ctx = useContext(ModelsContext);
  if (!ctx) throw new Error('useModels() must be used inside <ModelsProvider>');
  return ctx;
}
