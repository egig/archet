import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth.js';
import { RequireAuth } from './RequireAuth.js';
import { Layout } from './Layout.js';
import { LoginPage } from './LoginPage.js';
import { SetupPage } from './SetupPage.js';
import { IndexRedirect } from './IndexRedirect.js';
import { ModelListPage } from './ModelListPage.js';
import { ModelFormPage } from './ModelFormPage.js';

/** A consumer-supplied page mounted inside the authenticated console shell, alongside the
 * generated model routes. `path` is relative to `consolePath` (e.g. `'reports/sales'`), and
 * doubles as the sidebar link target; `label` is what's shown for that link. */
export interface ConsolePage {
  path: string;
  label: string;
  element: ReactNode;
}

/** Overrides the sidebar's hardcoded "Ratchet console" heading — set either or both. */
export interface ConsoleBrand {
  name?: string;
  logo?: ReactNode;
}

export interface ConsoleAppProps {
  brand?: ConsoleBrand;
  pages?: ConsolePage[];
}

export function ConsoleApp({ brand, pages = [] }: ConsoleAppProps = {}) {
  return (
    <BrowserRouter basename={__CONSOLE_PATH__}>
      <AuthProvider>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout brand={brand} pages={pages} />}>
              <Route index element={<IndexRedirect />} />
              {pages.map((page) => (
                <Route key={page.path} path={page.path} element={page.element} />
              ))}
              <Route path=":model" element={<ModelListPage />} />
              <Route path=":model/new" element={<ModelFormPage />} />
              <Route path=":model/:id" element={<ModelFormPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
