import { Navigate } from 'react-router-dom'
import AppraisalWorkspace from '../../App'
import { useAuth } from '../../domains/auth/hooks'

export function ReleaseControlPage() {
  const { authState } = useAuth()

  if (authState?.capabilities?.includes('admin')) {
    return <AppraisalWorkspace mode="admin" page="release" />
  }

  if (authState?.capabilities?.includes('manager')) {
    return <Navigate to="/overview" replace />
  }

  return <Navigate to="/appraisal" replace />
}
