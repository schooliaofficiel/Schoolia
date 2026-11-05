import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AcademicYear, Profile, Role, School } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  school: School | null
  year: AcademicYear | null
  isPlatformAdmin: boolean
  mfaRequired: boolean
  refreshMfa: () => Promise<void>
  loading: boolean
  can: (...roles: Role[]) => boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [school, setSchool] = useState<School | null>(null)
  const [year, setYear] = useState<AcademicYear | null>(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [mfaRequired, setMfaRequired] = useState(false)
  const lastActivity = useRef(Date.now())
  const [loading, setLoading] = useState(true)

  const checkMfa = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    setMfaRequired(!!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2')
  }, [])

  const loadContext = useCallback(async (uid: string | null) => {
    if (!uid) {
      setProfile(null); setSchool(null); setYear(null); setIsPlatformAdmin(false)
      return
    }
    const { data: adm } = await supabase.rpc('am_i_platform_admin')
    setIsPlatformAdmin(adm === true)
    const { data: p } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile((p as Profile) ?? null)
    if (p) {
      const [{ data: s }, { data: y }] = await Promise.all([
        supabase.from('schools').select('*').maybeSingle(),
        supabase.from('academic_years').select('*').eq('is_current', true).maybeSingle(),
      ])
      setSchool((s as School) ?? null)
      setYear((y as AcademicYear) ?? null)
    } else {
      setSchool(null); setYear(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await checkMfa()
      await loadContext(data.session?.user.id ?? null)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // différé pour éviter un blocage interne du client Supabase
      setTimeout(() => { void checkMfa(); void loadContext(s?.user.id ?? null) }, 0)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadContext, checkMfa])

  // Fermeture automatique de la session après 30 minutes d'inactivité (ordinateurs partagés des écoles)
  useEffect(() => {
    if (!session) return
    const IDLE_MS = 30 * 60 * 1000
    const touch = () => { lastActivity.current = Date.now() }
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    lastActivity.current = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_MS) {
        try { sessionStorage.setItem('schoolia_idle', '1') } catch { /* ignore */ }
        void supabase.auth.signOut()
      }
    }, 30 * 1000)
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); clearInterval(timer) }
  }, [session])

  const value = useMemo<AuthState>(() => ({
    session, profile, school, year, isPlatformAdmin, mfaRequired, refreshMfa: async () => { await checkMfa(); await loadContext(session?.user.id ?? null) }, loading,
    can: (...roles) => (profile ? roles.includes(profile.role) : false),
    refresh: async () => { await loadContext(session?.user.id ?? null) },
    signOut: async () => { await supabase.auth.signOut() },
  }), [session, profile, school, year, isPlatformAdmin, mfaRequired, checkMfa, loading, loadContext])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return v
}
