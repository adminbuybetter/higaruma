const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()?.replace(/\/$/, '')
  || 'http://127.0.0.1:8000'

export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: options?.credentials ?? 'include',
    headers: {
      'Content-Type': 'application/json',
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
    throw new Error(detail)
  }

  return payload as T
}
