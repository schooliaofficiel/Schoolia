import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import Finance from './pages/Finance'
import SettingsPage from './pages/Settings'
import Classes from './pages/Classes'
import Grades from './pages/Grades'
import Attendance from './pages/Attendance'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Notifications from './pages/Notifications'
import Messages from './pages/Messages'
import Assistant from './pages/Assistant'
import Help from './pages/Help'
import Years from './pages/Years'
import Audit from './pages/Audit'
import Announcements from './pages/Announcements'
import Staff from './pages/Staff'
import type { Role } from './lib/types'

function Guard({ roles, children }: { roles: Role[]; children: JSX.Element }) {
  const { can } = useAuth()
  return can(...roles) ? children : <Navigate to="/" replace />
}

export default function App() {
  const { session, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (!session) return <Login />
  if (!profile) return <Onboarding />
  if (!profile.is_active) {
    return <div className="p-10 text-center text-marine">Ce compte a été désactivé. Contactez la direction de l’école.</div>
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="eleves" element={<Guard roles={['director', 'secretary', 'accountant', 'teacher']}><Students /></Guard>} />
        <Route path="classes" element={<Guard roles={['director', 'secretary', 'teacher']}><Classes /></Guard>} />
        <Route path="notes" element={<Guard roles={['director', 'secretary', 'teacher']}><Grades /></Guard>} />
        <Route path="presences" element={<Guard roles={['director', 'secretary', 'teacher']}><Attendance /></Guard>} />
        <Route path="bulletins" element={<Reports />} />
        <Route path="assistant" element={<Guard roles={['director', 'secretary', 'accountant']}><Assistant /></Guard>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="messages" element={<Messages />} />
        <Route path="utilisateurs" element={<Guard roles={['director', 'secretary']}><Users /></Guard>} />
        <Route path="finances" element={<Guard roles={['director', 'secretary', 'accountant']}><Finance /></Guard>} />
        <Route path="parametres" element={<SettingsPage />} />
        <Route path="aide" element={<Help />} />
        <Route path="annonces" element={<Announcements />} />
        <Route path="personnel" element={<Guard roles={['director', 'secretary']}><Staff /></Guard>} />
        <Route path="annees" element={<Guard roles={['director', 'secretary']}><Years /></Guard>} />
        <Route path="audit" element={<Guard roles={['director']}><Audit /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
