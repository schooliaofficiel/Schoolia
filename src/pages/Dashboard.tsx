import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, GraduationCap, Percent, Wallet } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { fullName, lastMonths, monthKey, monthLabel, money, sum } from '../lib/format'
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, useLoad } from '../components/ui'

function Kpi({ icon: Icon, label, value, note, tone }: { icon: typeof Wallet; label: string; value: string; note?: string; tone: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="truncate font-display text-2xl font-extrabold text-marine">{value}</p>
          {note && <p className="text-xs text-slate-500">{note}</p>}
        </div>
      </div>
    </Card>
  )
}

function StaffHome() {
  const { school, year, can } = useAuth()
  const currency = school?.currency ?? 'USD'
  const months = lastMonths(6)
  const since = `${months[0]}-01`

  const { data, loading, error } = useLoad(async () => {
    if (!year) return null
    const [enr, cls, bal, pay, exp, inc, abs] = await Promise.all([
      supabase.from('enrollments').select('id,class_id').eq('academic_year_id', year.id),
      supabase.from('classes').select('id,name').eq('academic_year_id', year.id).order('name'),
      supabase.from('v_student_balances').select('student_id,total_due,total_paid,remaining').eq('academic_year_id', year.id),
      supabase.from('payments').select('amount,paid_at').is('voided_at', null).gte('paid_at', since),
      supabase.from('expenses').select('amount,spent_at').is('voided_at', null).gte('spent_at', since),
      supabase.from('other_income').select('amount,received_at').is('voided_at', null).gte('received_at', since),
      supabase.from('v_absence_summary').select('student_id,absences,lates').order('absences', { ascending: false }).limit(5),
    ])
    const absRows = rows<{ student_id: string; absences: number; lates: number }>(abs).filter((a) => a.absences > 0 || a.lates > 0)
    let names: Record<string, string> = {}
    if (absRows.length) {
      const st = rows<any>(await supabase.from('students').select('id,first_name,last_name,middle_name').in('id', absRows.map((a) => a.student_id)))
      names = Object.fromEntries(st.map((s) => [s.id, fullName(s)]))
    }
    return {
      enrollments: rows<{ id: string; class_id: string }>(enr),
      classes: rows<{ id: string; name: string }>(cls),
      balances: rows<{ student_id: string; total_due: number; total_paid: number; remaining: number }>(bal),
      payments: rows<{ amount: number; paid_at: string }>(pay),
      expenses: rows<{ amount: number; spent_at: string }>(exp),
      income: rows<{ amount: number; received_at: string }>(inc),
      absences: absRows.map((a) => ({ ...a, name: names[a.student_id] ?? 'Élève' })),
    }
  }, [year?.id])

  if (!year) return <Alert tone="info">Aucune année scolaire en cours. Créez-en une dans les paramètres.</Alert>
  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!data) return null

  const thisMonth = monthKey(new Date())
  const collected = sum(data.payments.filter((p) => monthKey(p.paid_at) === thisMonth), (p) => p.amount)
  const unpaid = data.balances.filter((b) => b.remaining > 0)
  const totalDue = sum(data.balances, (b) => b.total_due)
  const totalPaid = sum(data.balances, (b) => b.total_paid)
  const rate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0
  const showFinance = can('director', 'secretary', 'accountant')
  const showExpenses = can('director', 'accountant')

  const cashflow = months.map((m) => ({
    mois: monthLabel(m),
    Recettes: sum(data.payments.filter((p) => monthKey(p.paid_at) === m), (p) => p.amount) + sum(data.income.filter((i) => monthKey(i.received_at) === m), (i) => i.amount),
    Dépenses: sum(data.expenses.filter((x) => monthKey(x.spent_at) === m), (x) => x.amount),
  }))
  const perClass = data.classes.map((c) => ({ classe: c.name, Élèves: data.enrollments.filter((e) => e.class_id === c.id).length }))

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle={`${school?.name} · année ${year.name}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={GraduationCap} label="Élèves inscrits" value={String(data.enrollments.length)} note={`${data.classes.length} classe(s)`} tone="bg-ciel-50 text-ciel-700" />
        {showFinance && <>
          <Kpi icon={Banknote} label="Encaissé ce mois" value={money(collected, currency)} tone="bg-feuille-50 text-feuille-700" />
          <Kpi icon={AlertTriangle} label="Frais impayés" value={money(sum(unpaid, (b) => b.remaining), currency)} note={`${unpaid.length} élève(s) concerné(s)`} tone="bg-marge-50 text-marge-700" />
          <Kpi icon={Percent} label="Taux de recouvrement" value={`${rate} %`} note="Frais payés / frais dus" tone="bg-crayon-50 text-crayon-700" />
        </>}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {showExpenses && (
          <Card className="p-4">
            <h2 className="mb-3 text-base font-bold text-marine">Recettes et dépenses sur 6 mois</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashflow}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D9E4F4" />
                  <XAxis dataKey="mois" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                  <Tooltip formatter={(v) => money(Number(v), currency)} />
                  <Legend />
                  <Bar dataKey="Recettes" fill="#1E9BD7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Dépenses" fill="#F5B82E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card className="p-4">
          <h2 className="mb-3 text-base font-bold text-marine">Effectifs par classe</h2>
          {perClass.length === 0 ? <EmptyState title="Aucune classe" text="Les classes apparaîtront ici dès qu’elles seront créées." /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perClass}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D9E4F4" />
                  <XAxis dataKey="classe" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={32} />
                  <Tooltip />
                  <Bar dataKey="Élèves" fill="#12315C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-base font-bold text-marine">Élèves les plus absents</h2>
          <Link to="/eleves" className="text-sm font-semibold text-ciel-700 underline">Voir les élèves</Link>
        </div>
        {data.absences.length === 0 ? <EmptyState title="Aucune absence enregistrée" text="Les absences saisies par les enseignants s’afficheront ici." /> : (
          <ul className="divide-y divide-marine-100 px-4 pb-2 pt-2">
            {data.absences.map((a) => (
              <li key={a.student_id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-semibold">{a.name}</span>
                <span className="flex gap-2"><Badge tone="bad">{a.absences} absence(s)</Badge><Badge tone="warn">{a.lates} retard(s)</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function FamilyHome() {
  const { school, year } = useAuth()
  const currency = school?.currency ?? 'USD'
  const { data, loading, error } = useLoad(async () => {
    const students = rows<any>(await supabase.from('students').select('*'))
    const ids = students.map((s) => s.id)
    if (!ids.length) return { cards: [] as any[] }
    const [enr, bal, abs, cls] = await Promise.all([
      supabase.from('enrollments').select('id,student_id,class_id').in('student_id', ids).eq('academic_year_id', year?.id ?? ''),
      supabase.from('v_student_balances').select('student_id,total_due,total_paid,remaining'),
      supabase.from('v_absence_summary').select('student_id,absences,lates'),
      supabase.from('classes').select('id,name'),
    ])
    const e = rows<any>(enr), b = rows<any>(bal), a = rows<any>(abs), c = rows<any>(cls)
    return {
      cards: students.map((s) => ({
        s,
        className: c.find((x) => x.id === e.find((y) => y.student_id === s.id)?.class_id)?.name ?? 'Non inscrit',
        bal: b.find((x) => x.student_id === s.id),
        abs: a.find((x) => x.student_id === s.id),
      })),
    }
  }, [year?.id])

  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  return (
    <>
      <PageHeader title="Mes enfants" subtitle={school?.name} />
      {!data?.cards.length ? <Card><EmptyState title="Aucun élève rattaché à votre compte" text="Demandez à l’école de lier votre compte à votre enfant." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.cards.map(({ s, className, bal, abs }) => (
            <Card key={s.id} className="p-5">
              <p className="font-display text-xl font-extrabold text-marine">{fullName(s)}</p>
              <p className="text-sm text-slate-500">{className} · matricule {s.matricule}</p>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-slate-500">Frais dus</dt><dd className="font-bold">{money(bal?.total_due ?? 0, currency)}</dd></div>
                <div><dt className="text-slate-500">Payé</dt><dd className="font-bold text-feuille-700">{money(bal?.total_paid ?? 0, currency)}</dd></div>
                <div><dt className="text-slate-500">Reste</dt><dd className="font-bold text-marge-700">{money(bal?.remaining ?? 0, currency)}</dd></div>
              </dl>
              <p className="mt-4 text-sm"><Badge tone={(abs?.absences ?? 0) > 3 ? 'bad' : 'neutral'}>{abs?.absences ?? 0} absence(s)</Badge> <Badge tone="warn">{abs?.lates ?? 0} retard(s)</Badge></p>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

export default function Dashboard() {
  const { can } = useAuth()
  return can('parent', 'student') ? <FamilyHome /> : <StaffHome />
}
