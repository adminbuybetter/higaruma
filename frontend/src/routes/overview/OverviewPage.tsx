import { Navigate } from 'react-router-dom'
import AppraisalWorkspace from '../../App'
import { useAuth } from '../../domains/auth/hooks'

export function OverviewPage() {
  const { authState } = useAuth()

  if (authState?.capabilities?.includes('admin')) {
    return <AppraisalWorkspace mode="admin" page="overview" />
  }

  if (authState?.capabilities?.includes('manager')) {
    return <AppraisalWorkspace mode="manager" page="overview" />
  }

  return <Navigate to="/appraisal" replace />
}
