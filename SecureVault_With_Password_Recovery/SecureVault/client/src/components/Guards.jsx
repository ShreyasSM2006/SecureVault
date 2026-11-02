import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullPageLoader } from './ui';

// Dashboard etc.: only reachable after password AND OTP succeeded.
export function ProtectedRoute() {
  const { loading, authenticated, pending2FA } = useAuth();
  if (loading) return <FullPageLoader label="Checking session…" />;
  if (!authenticated) return <Navigate to={pending2FA ? '/verify-otp' : '/login'} replace />;
  return <Outlet />;
}

// Login / Register: bounce already-authenticated users to the dashboard.
export function PublicRoute() {
  const { loading, authenticated } = useAuth();
  if (loading) return <FullPageLoader />;
  if (authenticated) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
