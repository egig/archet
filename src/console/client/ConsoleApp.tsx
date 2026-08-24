import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthProvider } from './auth.js';
import { RequireAuth } from './RequireAuth.js';
import { Layout } from './Layout.js';
import { LoginPage } from './LoginPage.js';
import { SetupPage } from './SetupPage.js';
import { IndexRedirect } from './IndexRedirect.js';
import { ModelListPage } from './ModelListPage.js';
import { ModelFormPage } from './ModelFormPage.js';
import { ChatPage } from './ChatPage.js';
import { ChatEmptyState } from './ChatEmptyState.js';
import { ChatThread } from './ChatThread.js';

export function ConsoleApp() {
  return (
    <BrowserRouter basename={__CONSOLE_PATH__}>
      <AuthProvider>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route index element={<IndexRedirect />} />
              <Route path="chat" element={<ChatPage />}>
                <Route index element={<ChatEmptyState />} />
                <Route path=":chatId" element={<ChatThread />} />
              </Route>
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
