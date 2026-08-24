import { NavLink, Outlet } from 'react-router';
import { useAuth } from './auth.js';
import { useModels } from './models.js';
import type { ConsoleBrand, ConsolePage } from './ConsoleApp.js';

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-2 text-sm ${isActive ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`;

export interface LayoutProps {
  brand?: ConsoleBrand;
  pages?: ConsolePage[];
}

export function Layout({ brand, pages = [] }: LayoutProps) {
  const { user, logout } = useAuth();
  const { models, loading, error } = useModels();

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
          {models.map((model) => (
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
