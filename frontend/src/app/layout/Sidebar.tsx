import type { AuthState } from '../../domains/auth/contracts'
import { useAuth } from '../../domains/auth/hooks'
import { buildNavItems } from '../../shared/lib/navigation'

type SidebarProps = {
  currentPath: string
  onNavigate: (path: string) => void
  authState: AuthState | null
}

export function Sidebar({ currentPath, onNavigate, authState }: SidebarProps) {
  const { logout, logoutPending } = useAuth()
  const sections = buildNavItems(authState)

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">B</div>
        <div className="brand-text">
          <h1>BuyBetter</h1>
          <span>Performance cycles</span>
        </div>
      </div>

      <div className="cycle-chip">
        <strong>H1 2026 Cycle</strong>
        Live appraisal window
      </div>

      <nav className="nav" aria-label="Primary">
        {sections.map((section) => (
          <div key={section.label}>
            {section.label ? <div className="nav-section">{section.label}</div> : null}
            {section.items.map((item) => (
              <button
                key={item.path}
                className={`nav-item${currentPath === item.path ? ' active' : ''}`}
                type="button"
                onClick={() => onNavigate(item.path)}
              >
                <NavIcon icon={item.icon} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">{(authState?.displayName ?? 'A').slice(0, 1).toUpperCase()}</div>
        <div className="sidebar-user-copy">
          <div className="profile-name">{authState?.displayName ?? 'Appraisal user'}</div>
          <div className="profile-role">
            {authState?.designation ?? 'Sign in to unlock the appraisal workspace.'}
          </div>
        </div>
        <button className="sidebar-footer-logout" type="button" onClick={() => void logout()} disabled={logoutPending} aria-label={logoutPending ? 'Signing out' : 'Logout'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M10 17l5-5-5-5" />
            <path d="M15 12H3" />
            <path d="M13 3h5a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-5" />
          </svg>
        </button>
      </div>
    </aside>
  )
}

function NavIcon({ icon }: { icon: 'overview' | 'appraisal' | 'team' | 'release' }) {
  if (icon === 'overview') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    )
  }

  if (icon === 'appraisal') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M15 3v4h4" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    )
  }

  if (icon === 'release') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3l7 4v5c0 4.2-2.4 7.7-7 9-4.6-1.3-7-4.8-7-9V7l7-4z" />
        <path d="M9.5 12.2l1.7 1.7 3.3-3.5" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
      <circle cx="17" cy="8" r="2.6" />
      <path d="M16 14.2c2.8.5 5 2.6 5 5.3" />
    </svg>
  )
}
