import type { AuthState } from '../../domains/auth/contracts'

export type NavSection = {
  label: string
  items: Array<{ path: string; label: string; icon: 'overview' | 'appraisal' | 'team' }>
}

export function buildNavItems(authState: AuthState | null): NavSection[] {
  const items: Array<{ path: string; label: string; icon: 'overview' | 'appraisal' | 'team' }> = []

  const isManagerLike = Boolean(
    authState?.capabilities.includes('manager') || authState?.capabilities.includes('admin'),
  )

  if (isManagerLike) {
    items.push({ path: '/overview', label: 'Overview', icon: 'overview' })
  }
  if (authState?.capabilities.includes('employee')) {
    items.push({ path: '/appraisal', label: 'My appraisal', icon: 'appraisal' })
  }
  if (isManagerLike) {
    items.push({ path: '/team', label: 'My team', icon: 'team' })
  }

  return [{ label: '', items }]
}

export function homePathForAuth(authState: AuthState | null) {
  if (authState?.capabilities.includes('manager') || authState?.capabilities.includes('admin')) return '/overview'
  if (authState?.capabilities.includes('employee')) return '/appraisal'
  return '/login'
}
