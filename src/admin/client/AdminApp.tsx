import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth.js';
import { RequireAuth } from './RequireAuth.js';
import { Layout } from './Layout.js';
import { LoginPage } from './LoginPage.js';
import { IndexRedirect } from './IndexRedirect.js';
import { ModelListPage } from './ModelListPage.js';
import { ModelFormPage } from './ModelFormPage.js';

export function AdminApp() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<IndexRedirect />} />
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
