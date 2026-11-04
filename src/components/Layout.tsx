import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { LayoutDashboard, GraduationCap, Wallet, Settings, Menu, X, LogOut, School, PenLine, CalendarCheck, FileText, Bell, Mail, Users, Sparkles, HelpCircle, CalendarRange, ScrollText, Megaphone, Briefcase, CreditCard, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { ROLE_LABELS, type Role } from '../lib/types'
import { STATUS, daysUntil, type Subscription } from '../lib/billing'

interface NavItem { to: string; label: string; icon: typeof Menu; roles: Role[]; badge?: 'notifications' | 'messages'; platformOnly?: boolean }
const ALL: Role[] = ['director', 'secretary', 'accountant', 'teacher', 'parent', 'student']

const NAV: NavItem[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, roles: ALL },
  { to: '/assistant', label: 'Schoolia AI', icon: Sparkles, roles: ['director', 'secretary', 'accountant'] },
  { to: '/eleves', label: 'Élèves', icon: GraduationCap, roles: ['director', 'secretary', 'accountant', 'teacher'] },
  { to: '/classes', label: 'Classes et cours', icon: School, roles: ['director', 'secretary', 'teacher'] },
  { to: '/notes', label: 'Notes', icon: PenLine, roles: ['director', 'secretary', 'teacher'] },
  { to: '/presences', label: 'Présences', icon: CalendarCheck, roles: ['director', 'secretary', 'teacher'] },
  { to: '/bulletins', label: 'Bulletins', icon: FileText, roles: ['director', 'secretary', 'teacher', 'parent', 'student'] },
  { to: '/finances', label: 'Finances', icon: Wallet, roles: ['director', 'secretary', 'accountant'] },
  { to: '/annonces', label: 'Annonces', icon: Megaphone, roles: ALL },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ALL, badge: 'notifications' },
  { to: '/messages', label: 'Messages', icon: Mail, roles: ALL, badge: 'messages' },
  { to: '/personnel', label: 'Personnel', icon: Briefcase, roles: ['director', 'secretary'] },
  { to: '/annees', label: 'Années scolaires', icon: CalendarRange, roles: ['director', 'secretary'] },
  { to: '/utilisateurs', label: 'Utilisateurs', icon: Users, roles: ['director', 'secretary'] },
  { to: '/abonnement', label: 'Abonnement', icon: CreditCard, roles: ['director'] },
  { to: '/admin', label: 'Plateforme', icon: ShieldCheck, roles: ALL, platformOnly: true },
  { to: '/audit', label: 'Journal d’audit', icon: ScrollText, roles: ['director'] },
  { to: '/parametres', label: 'Paramètres', icon: Settings, roles: ALL },
  { to: '/aide', label: 'Aide', icon: HelpCircle, roles: ALL },
]

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-9 w-9" aria-hidden>
        <rect width="64" height="64" rx="16" fill={light ? '#fff' : '#12315C'} />
        <path d="M18 40c0 5 4 8 12 8 7 0 12-3 12-8 0-11-24-6-24-17 0-5 5-8 12-8 6 0 11 3 11 8" fill="none" stroke={light ? '#12315C' : '#fff'} strokeWidth="6" strokeLinecap="round" />
        <rect x="44" y="12" width="6" height="14" rx="2" fill="#F5B82E" transform="rotate(20 47 19)" />
      </svg>
      <span className={clsx('font-display text-xl font-extrabold tracking-tight', light ? 'text-white' : 'text-marine')}>SCHOOLIA</span>
    </div>
  )
}

export default function Layout() {
  const { profile, school, year, can, signOut, isPlatformAdmin } = useAuth()
  const [sub, setSub] = useState<Subscription | null>(null)
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 })
  const location = useLocation()
  const items = NAV.filter((n) => can(...n.roles) && (!n.platformOnly || isPlatformAdmin))

  useEffect(() => {
    if (!profile) return
    let active = true
    ;(async () => {
      const [n, m] = await Promise.all([
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).is('read_at', null),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', profile.id).is('read_at', null),
      ])
      if (active) setCounts({ notifications: n.count ?? 0, messages: m.count ?? 0 })
    })()
    return () => { active = false }
  }, [profile, location.pathname])

  useEffect(() => {
    if (!profile || profile.role !== 'director') return
    let active = true
    void supabase.from('subscriptions').select('*').maybeSingle().then(({ data }) => { if (active) setSub((data as Subscription) ?? null) })
    return () => { active = false }
  }, [profile, location.pathname])

  const subDays = sub ? daysUntil(sub.status === 'trial' ? sub.trial_ends_on : sub.current_period_end) : null
  const showBanner = !!sub && profile?.role === 'director' && location.pathname !== '/abonnement' && (sub.status === 'past_due' || (subDays !== null && subDays <= 7))

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3" aria-label="Navigation principale">
      {items.map(({ to, label, icon: Icon, badge }) => {
        const n = badge ? counts[badge] : 0
        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors', isActive ? 'bg-white text-marine' : 'text-marine-200 hover:bg-marine-700 hover:text-white')}
          >
            <Icon className="h-5 w-5" aria-hidden /> <span className="flex-1">{label}</span>
            {n > 0 && <span className="rounded-full bg-crayon px-2 py-0.5 text-xs font-bold text-marine" aria-label={`${n} non lu(s)`}>{n}</span>}
          </NavLink>
        )
      })}
    </nav>
  )

  const side = (
    <div className="flex h-full flex-col bg-marine py-5">
      <div className="px-5 pb-6"><Logo light /></div>
      <div className="mx-3 mb-4 rounded-lg bg-marine-700 px-3 py-2.5">
        <p className="truncate text-sm font-bold text-white">{school?.name}</p>
        <p className="text-xs text-marine-200">{year ? `Année ${year.name}` : 'Aucune année en cours'}</p>
      </div>
      {nav}
      <div className="mt-4 border-t border-marine-700 px-4 pt-4">
        <p className="truncate text-sm font-semibold text-white">{profile?.full_name}</p>
        <p className="mb-3 text-xs text-marine-200">{profile ? ROLE_LABELS[profile.role] : ''}</p>
        <button onClick={() => void signOut()} className="flex items-center gap-2 text-sm font-semibold text-marine-200 hover:text-white">
          <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen lg:flex">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block no-print">{side}</aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-marine-100 bg-white px-4 py-3 lg:hidden no-print">
        <Logo />
        <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu" className="relative rounded-lg p-2 text-marine hover:bg-marine-50">
          <Menu className="h-6 w-6" />
          {counts.notifications + counts.messages > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-marge" aria-hidden />}
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden no-print">
          <div className="absolute inset-0 bg-marine-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <button onClick={() => setOpen(false)} aria-label="Fermer le menu" className="absolute right-2 top-2 z-10 rounded-lg p-2 text-white"><X className="h-5 w-5" /></button>
            {side}
          </div>
        </div>
      )}

      <main className="flex-1 lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {showBanner && sub && (
            <Link to="/abonnement" className={clsx('no-print mb-5 block rounded-lg px-4 py-3 text-sm font-semibold', sub.status === 'past_due' || (subDays ?? 0) < 0 ? 'bg-marge-50 text-marge-700' : 'bg-crayon-50 text-crayon-700')}>
              {sub.status === 'past_due' || (subDays ?? 0) < 0 ? 'Votre abonnement a expiré : réglez-le pour éviter la suspension de l’accès.' : sub.status === 'trial' ? `Essai gratuit : il reste ${subDays} jour(s).` : `Votre abonnement expire dans ${subDays} jour(s).`} <span className="underline">Gérer l’abonnement</span>
              <span className="sr-only">{STATUS[sub.status].label}</span>
            </Link>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
