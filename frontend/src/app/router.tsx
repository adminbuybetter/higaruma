import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { LoginPage } from '../routes/auth/LoginPage'
import { OverviewPage } from '../routes/overview/OverviewPage'
import { MyAppraisalPage } from '../routes/employee/MyAppraisalPage'
import { TeamReviewsPage } from '../routes/manager/TeamReviewsPage'
import { HrConsolePage } from '../routes/hr/HrConsolePage'
import { RequireAuth } from '../domains/auth/components/RequireAuth'
import { useAuth } from '../domains/auth/hooks'
import { homePathForAuth } from '../shared/lib/navigation'

function HomeRedirect() {
  const { authState } = useAuth()
  return <Navigate to={homePathForAuth(authState)} replace />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: 'overview', element: <OverviewPage /> },
          { path: 'appraisal', element: <MyAppraisalPage /> },
          { path: 'team', element: <TeamReviewsPage /> },
          { path: 'hr', element: <HrConsolePage /> },
        ],
      },
    ],
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
])
