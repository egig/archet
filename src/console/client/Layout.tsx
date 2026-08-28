import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useAuth } from './auth.js';
import { useModels } from './models.js';
import { useDomains } from './domains.js';
import { BrandMark } from './BrandMark.js';
import { ChevronDownIcon, LogOutIcon, ProfileIcon, SettingsIcon, SparklesIcon, WorkspaceIcon } from './icons.js';
import { ConsoleChatPanel } from './ConsoleChatPanel.js';
import type { ConsoleModelMeta } from '../serialize-model.js';
import type { ConsoleDomainMeta } from '../serialize-domain.js';

// the chat panel's open/closed state is a per-browser UI preference, shared with the workspace
// screen's own toggle (same key) so it stays consistent across both surfaces.
const CHAT_OPEN_STORAGE_KEY = 'ratchet:workspace-chat-open';

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `block truncate rounded-md px-3 py-1.5 text-sm ${
    isActive ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
  }`;

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

/** One group of nav links, with consistent spacing/borders instead of each call site hand-rolling
 * them. `title` is only meaningful for a real Domain's section (`DomainsMenu` below) — domain-less
 * ("ungrouped") models have no Domain to label a section with, so they're rendered through this
 * with no title, as a flat untitled block. */
function NavSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="px-2 py-2">
      {title && <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/** Renders one `NavSection` per Domain, in first-appearance order — each Domain's declared
 * `consoleMenu` links (`defineDomain()`) above its visible models. A Domain with a `consoleMenu`
 * but no visible models (e.g. the built-in Automation Domain's "Chats" link — its `chats`/
 * `messages` models are `console: hidden`) still gets a section from its menu alone. */
function DomainsMenu({
  groups,
  domains,
  getDomain,
}: {
  groups: { domain: string; models: ConsoleModelMeta[] }[];
  domains: ConsoleDomainMeta[];
  getDomain: (name: string) => ConsoleDomainMeta | undefined;
}) {
  const modelsByDomain = new Map(groups.map((g) => [g.domain, g.models]));
  const order: string[] = groups.map((g) => g.domain);
  for (const d of domains) {
    if (d.consoleMenu.length > 0 && !modelsByDomain.has(d.name)) order.push(d.name);
  }

  return (
    <>
      {order.map((domain) => (
        <NavSection key={domain} title={getDomain(domain)?.label ?? humanizeDomain(domain)}>
          {getDomain(domain)?.consoleMenu.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClassName}>
              {item.label}
            </NavLink>
          ))}
          {(modelsByDomain.get(domain) ?? []).map((model) => (
            <NavLink key={model.name} to={`/${model.name}`} className={navLinkClassName}>
              {model.label}
            </NavLink>
          ))}
        </NavSection>
      ))}
    </>
  );
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/** Bottom-of-sidebar account control: collapses the signed-in user, their Workspace, Edit
 * profile, and Log out into one popup menu, so the sidebar's main nav only ever lists content,
 * never account actions. Settings sits just above this as its own footer link (see `Layout`) —
 * it's app configuration, not an account action. */
function AccountMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (!user) return null;

  return (
    <div ref={ref} className="relative p-2">
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {/* `/` is `IndexRedirect`, which navigates to the signed-in user's own Workspace
              (or the create form if they have none) — no id to look up here. */}
          <NavLink
            to="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <WorkspaceIcon className="h-4 w-4 text-gray-400" />
            Workspace
          </NavLink>
          <NavLink
            to="/profile"
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-700'} hover:bg-gray-50`
            }
          >
            <ProfileIcon className="h-4 w-4 text-gray-400" />
            Edit profile
          </NavLink>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <LogOutIcon className="h-4 w-4 text-gray-400" />
            Log out
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-medium text-white">
          {initials(user.email)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{user.email}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}

export function Layout() {
  const { models, loading, error } = useModels();
  const { domains, getDomain } = useDomains();
  const grouped = groupByDomain(models);
  const ungrouped = models.filter((model) => !model.domain);
  const hasModelSections = grouped.length > 0 || ungrouped.length > 0;

  const [chatOpen, setChatOpen] = useState(() => {
    try {
      return localStorage.getItem(CHAT_OPEN_STORAGE_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_STORAGE_KEY, String(chatOpen));
    } catch {
      // ignore — e.g. private browsing with storage disabled
    }
  }, [chatOpen]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        {/* 1. Header — brand */}
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
          <BrandMark />
        </div>

        {/* Sidebar nav sections */}
        <nav className="flex-1 overflow-y-auto">
          {ungrouped.length > 0 && (
            <NavSection>
              {ungrouped.map((model) => (
                <NavLink key={model.name} to={`/${model.name}`} className={navLinkClassName}>
                  {model.label}
                </NavLink>
              ))}
            </NavSection>
          )}

          {loading && <p className="px-4 py-2 text-xs text-gray-400">Loading models…</p>}
          {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}

          <DomainsMenu groups={grouped} domains={domains} getDomain={getDomain} />

          {!loading && !hasModelSections && !error && (
            <p className="px-4 py-2 text-xs text-gray-400">No models registered.</p>
          )}
        </nav>

        {/* 4. Bottom bar — Settings (app config, only once a Domain declares settings) sits above
            the account menu; the two share one top border. */}
        <div className="border-t border-gray-200">
          {domains.some((d) => d.fields.length > 0) && (
            <div className="px-2 pt-2">
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                    isActive
                      ? 'bg-gray-100 font-medium text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                <SettingsIcon className="h-4 w-4 text-gray-400" />
                Settings
              </NavLink>
            </div>
          )}
          <AccountMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header for the console content area — brand on the left, the chat toggle on the
            right. The chat panel mounts to the right of <main> (below this header) when open. */}
        <header className="flex items-center border-b border-gray-200 bg-white px-4 py-2">
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              aria-label="Toggle chat"
              aria-pressed={chatOpen}
              title="Toggle chat"
              className={`flex h-7 w-7 items-center justify-center rounded ${
                chatOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <SparklesIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-x-auto p-6">
            <Outlet />
          </main>

          {chatOpen && <ConsoleChatPanel />}
        </div>
      </div>
    </div>
  );
}
