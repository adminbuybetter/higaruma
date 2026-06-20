import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../domains/auth/hooks'
import { homePathForAuth } from '../../shared/lib/navigation'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { authState, login, loginPending, sessionPending } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  if (sessionPending) {
    return (
      <div className="login-route-shell">
        <section className="surface-card login-form-panel">
          <h1>Checking session</h1>
          <p className="subtle">Verifying your appraisal session before routing you into the workspace.</p>
        </section>
      </div>
    )
  }

  if (authState) {
    return <Navigate to={homePathForAuth(authState)} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setErrorMessage('')
    try {
      await login({ username: username.trim().toLowerCase(), password })
      const destination = typeof location.state === 'object' && location.state && 'from' in location.state
        ? String(location.state.from)
        : '/'
      navigate(destination === '/login' ? '/' : destination, { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign-in failed.')
    }
  }

  return (
    <div className="login-route-shell">
      <section className="login-page-grid">
        <article className="surface-card login-about-panel">
          <span className="eyebrow">Performance reviews</span>
          <h1>BuyBetter appraisal workspace</h1>
          <p className="wide-note">
            Sign in once, restore your session on reload, and only see the appraisal lanes that concern your role.
          </p>
        </article>

        <article className="surface-card login-form-panel">
          <span className="eyebrow">Secure sign in</span>
          <h1>Open workspace</h1>
          <p className="wide-note">Use the username and password assigned to you for this appraisal cycle.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} required />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <div className="auth-actions">
              <button className="button primary" disabled={loginPending} type="submit">
                {loginPending ? 'Signing in…' : 'Open workspace'}
              </button>
            </div>
            {errorMessage ? <p className="auth-status is-error">{errorMessage}</p> : null}
          </form>
        </article>
      </section>
    </div>
  )
}
