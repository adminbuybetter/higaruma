import { ApiError, apiClient } from '../../shared/api/client'
import { API_PATHS } from '../../contracts/paths'
import type { LoginPayload, LoginResponse, SessionResponse } from './contracts'

export async function fetchSession() {
  try {
    return await apiClient<SessionResponse>(API_PATHS.auth.me)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
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
