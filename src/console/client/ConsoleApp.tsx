import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth.js';
import { RequireAuth } from './RequireAuth.js';
import { Layout } from './Layout.js';
import { LoginPage } from './LoginPage.js';
import { SetupPage } from './SetupPage.js';
import { IndexRedirect } from './IndexRedirect.js';
import { ModelListPage } from './ModelListPage.js';
import { SettingsPage } from './SettingsPage.js';
import { ProfilePage } from './ProfilePage.js';
import { WorkspacePage } from './WorkspacePage.js';

// One client for the whole SPA lifetime — `ConsoleApp` is mounted once by `main.tsx`, so this
// never needs to be recreated per-render. Retries off: a failed request here is almost always an
// auth/permission/validation error a retry won't fix, and `ApiRequestError` carries the server's
// own `{ code, fields }` for the caller to act on immediately instead of after a delay.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

/** The console SPA's root — takes no props; every deployment gets the same shell except for
 * branding, which is build-time config (`ratchet.config.ts`'s `brand`, see `BrandMark.tsx`), not a
 * prop. No custom pages or custom field renderers. Mounted by `console/client/main.tsx`. */
export function ConsoleApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={__CONSOLE_PATH__}>
        <AuthProvider>
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="workspace/:workspaceId/*" element={<WorkspacePage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route element={<Layout />}>
                <Route index element={<IndexRedirect />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/:domain" element={<SettingsPage />} />
                <Route path=":model/*" element={<ModelListPage />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
