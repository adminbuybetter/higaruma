const PAGE_LABELS: Record<string, string> = {
  '/appraisal': 'My appraisal',
  '/team': 'Team reviews',
  '/hr': 'HR console',
  '/login': 'Login',
}

export function pageLabelForPath(pathname: string) {
  return PAGE_LABELS[pathname] ?? 'Appraisal'
}
