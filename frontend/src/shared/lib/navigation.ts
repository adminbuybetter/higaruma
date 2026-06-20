import type { AuthState } from '../../domains/auth/contracts'

export type NavSection = {
  label: string
  items: Array<{ path: string; label: string }>
}

export function buildNavItems(authState: AuthState | null): NavSection[] {
  const items: Array<{ path: string; label: string }> = []

  if (authState?.capabilities.includes('employee')) {
    items.push({ path: '/appraisal', label: 'My appraisal' })
  }
  if (authState?.capabilities.includes('manager')) {
    items.push({ path: '/team', label: 'Team reviews' })
  }
  if (authState?.capabilities.includes('admin')) {
    items.push({ path: '/hr', label: 'HR console' })
  }

  return [{ label: 'Workspace', items }]
}

export function homePathForAuth(authState: AuthState | null) {
  if (authState?.capabilities.includes('employee')) return '/appraisal'
  if (authState?.capabilities.includes('manager')) return '/team'
  if (authState?.capabilities.includes('admin')) return '/hr'
  return '/login'
}
