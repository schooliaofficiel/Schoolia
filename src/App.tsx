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
        <Route path="finances" element={<Guard roles={['director', 'secretary', 'accountant']}><Finance /></Guard>} />
        <Route path="parametres" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
