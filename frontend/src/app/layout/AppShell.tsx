import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Topbar } from './Topbar'
import { Sidebar } from './Sidebar'
import { useAuth } from '../../domains/auth/hooks'
import { pageLabelForPath } from '../../shared/lib/page-labels'

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authState } = useAuth()
  const currentLabel = pageLabelForPath(location.pathname)

  return (
    <div className="app-shell">
      <Topbar currentLabel={currentLabel} authState={authState} />

      <main className="app-main">
        <section className="dashboard-shell">
          <Sidebar
            currentPath={location.pathname}
            onNavigate={(path) => navigate(path)}
            authState={authState}
          />

          <div className="dashboard-main">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  )
}
