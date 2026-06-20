import type { AuthState } from '../../domains/auth/contracts'
import { useAuth } from '../../domains/auth/hooks'

type TopbarProps = {
  currentLabel: string
  authState: AuthState | null
}

export function Topbar({ currentLabel, authState }: TopbarProps) {
  const { logout, logoutPending } = useAuth()

  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        <a className="brand" href="/appraisal" aria-label="BuyBetter appraisals">
          <span className="brand-mark"></span>
        </a>
        <div className="breadcrumb">
          <span className="crumb-root">Appraisals</span>
          <span className="crumb-separator">/</span>
          <span className="crumb-current">{currentLabel}</span>
        </div>
      </div>

      <div className="app-topbar-right">
        <button className="pill-button" type="button" onClick={() => void logout()} disabled={logoutPending}>
          {logoutPending ? 'Signing out…' : 'Logout'}
        </button>
        <button className="icon-button user-button" type="button" aria-label="Current user">
          {(authState?.displayName ?? 'A').slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>
  )
}
