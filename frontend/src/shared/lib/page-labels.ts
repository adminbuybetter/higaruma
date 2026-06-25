const PAGE_LABELS: Record<string, string> = {
  '/appraisal': 'My appraisal',
  '/team': 'Team reviews',
  '/release': 'Release control',
  '/login': 'Login',
}

export function pageLabelForPath(pathname: string) {
  return PAGE_LABELS[pathname] ?? 'Appraisal'
}
