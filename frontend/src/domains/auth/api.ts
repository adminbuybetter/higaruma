import { API_PATHS } from '../../contracts/paths'
import { apiClient } from '../../shared/api/client'
import type { LoginPayload, LoginResponse, SessionResponse } from './contracts'

export async function fetchSession() {
  try {
    return await apiClient<SessionResponse>(API_PATHS.auth.me)
  } catch (error) {
    if (error instanceof Error && /401|authentication|token/i.test(error.message)) {
      return null
    }
    throw error
  }
}

export async function loginRequest(payload: LoginPayload) {
  return apiClient<LoginResponse>(API_PATHS.auth.login, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function logoutRequest() {
  return apiClient<{ status: string }>(API_PATHS.auth.logout, {
    method: 'POST',
  })
}
