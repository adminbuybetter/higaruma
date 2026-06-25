import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuth } from '../../domains/auth/hooks'

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authState } = useAuth()

  return (
    <div className="app">
      <Sidebar currentPath={location.pathname} onNavigate={(path) => navigate(path)} authState={authState} />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
