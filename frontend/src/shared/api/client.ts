const ACCESS_TOKEN_STORAGE_KEY = 'buybetter_appraisal_access_token'

function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8000'
    }
  }

  return 'https://appraisal-backend-staging.up.railway.app'
}

const API_BASE = resolveApiBaseUrl()

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readStoredAccessToken() {
  if (!canUseStorage()) return ''
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)?.trim() ?? ''
}

export function storeAccessToken(token: string) {
  if (!canUseStorage()) return
  if (!token.trim()) {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token.trim())
}

export function clearStoredAccessToken() {
  if (!canUseStorage()) return
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const accessToken = readStoredAccessToken()
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: options?.credentials ?? 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options?.headers ?? {}),
    },
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail)
        : `API error: ${response.status}`
    throw new ApiError(response.status, detail)
  }

  return payload as T
}
