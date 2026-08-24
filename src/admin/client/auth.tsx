import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ApiRequestError,
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  setup as apiSetup,
  setupStatus as apiSetupStatus,
  type AuthUser,
} from './api.js';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  /** true until any user holds a `*:*` permission — see `hasRootAdmin` (src/auth/lookup.ts). */
  setupRequired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeSetup: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Hydrates from the `ratchet_session` cookie (set by `/api/auth/login`) via `GET /api/auth/me`
 * on mount, so a page reload stays logged in without any client-side token storage. Also checks
 * `GET /api/auth/setup` alongside it, so the app knows on first paint whether to route to the
 * root-admin onboarding screen instead of the normal login page. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiMe().catch(() => null), apiSetupStatus().catch(() => ({ required: false }))]).then(
      ([u, status]) => {
        if (cancelled) return;
        setUser(u);
        setSetupRequired(status.required);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // `/api/auth/login`'s response doesn't include resolved `permissions` (only `/me` does) —
    // re-hydrate through the same path the initial page-load mount uses, so a fresh login and a
    // reload always agree on what the user can see.
    await apiLogin(email, password);
    setUser(await apiMe());
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (err) {
      if (!(err instanceof ApiRequestError) || err.status !== 401) throw err;
    }
    setUser(null);
  }, []);

  const completeSetup = useCallback(async (email: string, password: string) => {
    await apiSetup(email, password);
    setSetupRequired(false);
    setUser(await apiMe());
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, setupRequired, login, logout, completeSetup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}
