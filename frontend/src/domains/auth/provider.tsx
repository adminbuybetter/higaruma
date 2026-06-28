import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { fetchSession, loginRequest, logoutRequest } from './api'
import { AuthContext, type AuthContextValue } from './context'
import type { AuthState, LoginPayload, SessionResponse } from './contracts'
import { clearStoredAccessToken, storeAccessToken } from '../../shared/api/client'

function toAuthState(payload: SessionResponse): AuthState {
  return {
    id: payload.id,
    username: payload.username,
    displayName: payload.display_name,
    designation: payload.designation ?? undefined,
    capabilities: payload.capabilities ?? [],
    employeeId: payload.employee_code ?? undefined,
    managerScopes: payload.manager_scopes ?? [],
  }
}

export function BrowserAuthProvider({ children }: PropsWithChildren) {
  const [authState, setAuthState] = useState<AuthState | null>(null)
  const [sessionPending, setSessionPending] = useState(true)
  const [loginPending, setLoginPending] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const response = await fetchSession()
        if (!active) return
        setAuthState(response ? toAuthState(response) : null)
      } catch {
        if (!active) return
        setAuthState(null)
      } finally {
        if (active) setSessionPending(false)
      }
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (payload: LoginPayload) => {
    setLoginPending(true)
    try {
      const response = await loginRequest(payload)
      storeAccessToken(response.access_token)
      setAuthState(toAuthState(response.user))
    } finally {
      setLoginPending(false)
    }
  }, [])

  const logout = useCallback(async () => {
    setLogoutPending(true)
    try {
      await logoutRequest()
    } finally {
      clearStoredAccessToken()
      setAuthState(null)
      setLogoutPending(false)
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      sessionPending,
      loginPending,
      logoutPending,
      login,
      logout,
    }),
    [authState, sessionPending, loginPending, logoutPending, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
