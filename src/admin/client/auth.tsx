import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiRequestError, login as apiLogin, logout as apiLogout, me as apiMe, type AuthUser } from './api.js';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Hydrates from the `arche_session` cookie (set by `/api/auth/login`) via `GET /api/auth/me`
 * on mount, so a page reload stays logged in without any client-side token storage. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiMe()
      .then((u) => !cancelled && setUser(u))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));
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

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>');
  return ctx;
}
