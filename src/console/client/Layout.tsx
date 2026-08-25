import { NavLink, Outlet } from 'react-router';
import { useAuth } from './auth.js';
import { useModels } from './models.js';
import { useDomains } from './domains.js';
import type { ConsoleModelMeta } from '../serialize-model.js';
import type { ConsoleBrand, ConsolePage } from './ConsoleApp.js';

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-2 text-sm ${isActive ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`;

export interface LayoutProps {
  brand?: ConsoleBrand;
  pages?: ConsolePage[];
}

function humanizeDomain(domain: string): string {
  return domain.length === 0 ? domain : domain.charAt(0).toUpperCase() + domain.slice(1);
}

/** Splits the sidebar's model list into Domain-grouped sections (in the order each Domain's
 * models first appear) plus a flat tail of models with no Domain — mirrors `ConsoleModelMeta`'s
 * `domain` field (see `serialize-model.ts`), which is only set once a model's file lives under a
 * `modelsDir` subdirectory (ADR 0001). */
function groupByDomain(models: ConsoleModelMeta[]): { domain: string; models: ConsoleModelMeta[] }[] {
  const order: string[] = [];
  const byDomain = new Map<string, ConsoleModelMeta[]>();
  for (const model of models) {
    if (!model.domain) continue;
    if (!byDomain.has(model.domain)) {
      order.push(model.domain);
      byDomain.set(model.domain, []);
    }
    byDomain.get(model.domain)!.push(model);
  }
  return order.map((domain) => ({ domain, models: byDomain.get(domain)! }));
}

export function Layout({ brand, pages = [] }: LayoutProps) {
  const { user, logout } = useAuth();
  const { models, loading, error } = useModels();
  const { domains, getDomain } = useDomains();
  const grouped = groupByDomain(models);
  const ungrouped = models.filter((model) => !model.domain);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
          {brand?.logo}
          <div>
            <p className="text-sm font-semibold text-gray-900">{brand?.name ?? 'Ratchet console'}</p>
            {user && <p className="truncate text-xs text-gray-500">{user.email}</p>}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          <NavLink to="/chat" className={navLinkClassName}>
            Chat
          </NavLink>
          {domains.length > 0 && (
            <NavLink to="/settings" className={navLinkClassName}>
              Settings
            </NavLink>
          )}
          <div className="my-2 border-t border-gray-100" />
          {pages.length > 0 && (
            <div className="mb-2 border-b border-gray-200 pb-2">
              {pages.map((page) => (
                <NavLink key={page.path} to={`/${page.path}`} className={navLinkClassName}>
                  {page.label}
                </NavLink>
              ))}
            </div>
          )}
          {loading && <p className="px-4 py-2 text-xs text-gray-400">Loading models…</p>}
          {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
          {grouped.map(({ domain, models: domainModels }) => (
            <div key={domain} className="mb-2 border-b border-gray-200 pb-2">
              <p className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {getDomain(domain)?.label ?? humanizeDomain(domain)}
              </p>
              {domainModels.map((model) => (
                <NavLink key={model.name} to={`/${model.name}`} className={navLinkClassName}>
                  {model.label}
                </NavLink>
              ))}
            </div>
          ))}
          {ungrouped.map((model) => (
            <NavLink key={model.name} to={`/${model.name}`} className={navLinkClassName}>
              {model.label}
            </NavLink>
          ))}
          {!loading && models.length === 0 && !error && (
            <p className="px-4 py-2 text-xs text-gray-400">No models registered.</p>
          )}
        </nav>

        <div className="border-t border-gray-200 p-3">
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
