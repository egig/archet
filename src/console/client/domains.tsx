import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listDomains } from './api.js';
import type { ConsoleDomainMeta } from '../serialize-domain.js';

interface DomainsState {
  domains: ConsoleDomainMeta[];
  loading: boolean;
  getDomain: (name: string) => ConsoleDomainMeta | undefined;
}

const DomainsContext = createContext<DomainsState | null>(null);

/** One fetch of `/meta/domains` — every Domain that has a declared `defineDomainSettings()` —
 * covers both the sidebar's per-Domain "Settings" link and the settings form itself. Mirrors
 * `ModelsProvider` (models.tsx). */
export function DomainsProvider({ children }: { children: ReactNode }) {
  const [domains, setDomains] = useState<ConsoleDomainMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listDomains()
      .then((data) => !cancelled && setDomains(data))
      .catch(() => !cancelled && setDomains([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const getDomain = useMemo(() => (name: string) => domains.find((d) => d.name === name), [domains]);

  return <DomainsContext.Provider value={{ domains, loading, getDomain }}>{children}</DomainsContext.Provider>;
}

export function useDomains(): DomainsState {
  const ctx = useContext(DomainsContext);
  if (!ctx) throw new Error('useDomains() must be used inside <DomainsProvider>');
  return ctx;
}
