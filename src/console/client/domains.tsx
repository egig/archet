import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDomains } from './api.js';
import { queryKeys } from './query-keys.js';
import type { ConsoleDomainMeta } from '../serialize-domain.js';

interface DomainsState {
  domains: ConsoleDomainMeta[];
  loading: boolean;
  getDomain: (name: string) => ConsoleDomainMeta | undefined;
}

const DomainsContext = createContext<DomainsState | null>(null);

/** One fetch of `/meta/domains` — every Domain that has a declared `defineDomain()` — covers the
 * sidebar's per-Domain "Settings" link, its declared `consoleMenu`, and the settings form itself.
 * Mirrors `ModelsProvider` (models.tsx). */
export function DomainsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.domains,
    queryFn: () => listDomains().catch(() => []),
  });
  const domains = data ?? [];

  const getDomain = useMemo(() => (name: string) => domains.find((d) => d.name === name), [domains]);

  return <DomainsContext.Provider value={{ domains, loading: isLoading, getDomain }}>{children}</DomainsContext.Provider>;
}

export function useDomains(): DomainsState {
  const ctx = useContext(DomainsContext);
  if (!ctx) throw new Error('useDomains() must be used inside <DomainsProvider>');
  return ctx;
}
