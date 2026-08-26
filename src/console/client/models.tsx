import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listModels } from './api.js';
import { queryKeys } from './query-keys.js';
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
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.models, queryFn: listModels });
  const models = data ?? [];

  const getModel = useMemo(() => (name: string) => models.find((m) => m.name === name), [models]);

  return (
    <ModelsContext.Provider
      value={{
        models,
        loading: isLoading,
        error: error ? (error instanceof Error ? error.message : 'failed to load models') : null,
        getModel,
      }}
    >
      {children}
    </ModelsContext.Provider>
  );
}

export function useModels(): ModelsState {
  const ctx = useContext(ModelsContext);
  if (!ctx) throw new Error('useModels() must be used inside <ModelsProvider>');
  return ctx;
}
