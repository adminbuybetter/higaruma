import { createContext } from 'react'
import type { AuthState, LoginPayload } from './contracts'

export type AuthContextValue = {
  authState: AuthState | null
  sessionPending: boolean
  loginPending: boolean
  logoutPending: boolean
  login: (payload: LoginPayload) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
