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
      <div className="page-shell login-shell">
        <section className="hero-card login-card">
          <div className="login-layout">
            <div className="login-copy">
              <span className="eyebrow">Performance reviews</span>
              <h1>BuyBetter appraisal</h1>
              <p className="lede">Checking your session before opening the appraisal workspace.</p>
            </div>
            <div className="login-form-panel">
              <div className="login-form-intro">
                <span className="eyebrow">Session check</span>
                <p className="subtle">Verifying your appraisal session and routing you to the correct workspace.</p>
              </div>
            </div>
          </div>
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
    <div className="page-shell login-shell">
      <section className="hero-card login-card">
        <div className="login-layout">
          <article className="login-copy">
            <span className="eyebrow">Performance reviews</span>
            <h1>BuyBetter appraisal workspace</h1>
            <p className="lede">
              Sign in once, restore your session on reload, and only see the appraisal lanes that concern your role.
            </p>
            <div className="login-note">
              <strong>What happens next</strong>
              <p>
                Employees complete self-appraisal first, line managers review next, and HR controls final release and reporting.
              </p>
            </div>
          </article>

          <form className="auth-form login-form-panel" onSubmit={handleSubmit}>
            <div className="login-form-intro">
              <span className="eyebrow">Secure sign in</span>
              <h1>Open workspace</h1>
              <p className="subtle">Use the username and password assigned to you for this appraisal cycle.</p>
            </div>

            <label className="auth-field">
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="first.last"
                required
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Assigned password"
                required
              />
            </label>
            <div className="auth-actions">
              <button className="button primary login-submit" disabled={loginPending} type="submit">
                {loginPending ? 'Signing in…' : 'Open workspace'}
              </button>
            </div>
            {errorMessage ? <p className="auth-status is-error">{errorMessage}</p> : null}
          </form>
        </div>
      </section>
    </div>
  )
}
