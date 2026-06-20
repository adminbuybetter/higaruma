import type { AuthState } from '../../domains/auth/contracts'
import { buildNavItems } from '../../shared/lib/navigation'

type SidebarProps = {
  currentPath: string
  onNavigate: (path: string) => void
  authState: AuthState | null
}

export function Sidebar({ currentPath, onNavigate, authState }: SidebarProps) {
  const sections = buildNavItems(authState)

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-logo">
          <span className="brand-mark"></span>
        </div>
        <div className="sidebar-head-copy">
          <span className="sidebar-logo-text">Appraisals</span>
          <span className="sidebar-logo-sub">buybetter · internal</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="nav-section">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.path}
                className={`sidebar-link${currentPath === item.path ? ' is-active' : ''}`}
                type="button"
                onClick={() => onNavigate(item.path)}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="avatar">{(authState?.displayName ?? 'A').slice(0, 1).toUpperCase()}</div>
        <div className="sidebar-user-copy">
          <strong>{authState?.displayName ?? 'Appraisal user'}</strong>
          <small>
            {authState
              ? `${authState.capabilities.join(' · ')} · cookie session active`
              : 'Sign in to unlock the appraisal workspace.'}
          </small>
        </div>
      </div>
    </aside>
  )
}
