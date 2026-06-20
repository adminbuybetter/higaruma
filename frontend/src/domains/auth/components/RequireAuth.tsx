import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks'

export function RequireAuth() {
  const location = useLocation()
  const { authState, sessionPending } = useAuth()

  if (sessionPending) {
    return (
      <div className="login-route-shell">
        <section className="surface-card login-form-panel">
          <h1>Restoring session</h1>
          <p className="subtle">Checking your appraisal session before opening the workspace.</p>
        </section>
      </div>
    )
  }

  if (!authState) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
