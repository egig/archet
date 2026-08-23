import { Navigate, Outlet } from 'react-router';
import { useAuth } from './auth.js';
import { ModelsProvider } from './models.js';

export function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <ModelsProvider>
      <Outlet />
    </ModelsProvider>
  );
}
