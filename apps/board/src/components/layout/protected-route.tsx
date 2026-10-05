import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '@/hooks/use-auth-context';

export function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <Outlet />;
}
