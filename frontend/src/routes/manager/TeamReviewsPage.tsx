import { Navigate } from 'react-router-dom'
import AppraisalWorkspace from '../../App'
import { useAuth } from '../../domains/auth/hooks'

export function TeamReviewsPage() {
  const { authState } = useAuth()

  if (authState?.capabilities?.includes('admin')) {
    return <AppraisalWorkspace mode="admin" page="team" />
  }

  if (authState?.capabilities?.includes('manager')) {
    return <AppraisalWorkspace mode="manager" page="team" />
  }

  return <Navigate to="/appraisal" replace />
}
