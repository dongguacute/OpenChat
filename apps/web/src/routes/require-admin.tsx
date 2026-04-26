import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/context/auth-context'

export function RequireAdmin() {
  const { authReady, isAuthenticated, role } = useAuth()
  const location = useLocation()

  if (!authReady) {
    return (
      <p className="text-sm text-zinc-400" aria-live="polite">
        验证会话中…
      </p>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (role !== 'admin') {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
