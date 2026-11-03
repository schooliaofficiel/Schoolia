import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr, fullName } from '../lib/format'
import { teacherScope } from '../lib/scope'
import { Alert, Badge, Button, Card, EmptyState, Field, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

type Status = 'present' | 'absent' | 'late' | 'excused'
const LABELS: Record<Status, string> = { present: 'Présent', absent: 'Absent', late: 'Retard', excused: 'Excusé' }
const TONES: Record<Status, string> = { present: 'bg-feuille text-white', absent: 'bg-marge text-white', late: 'bg-crayon text-marine', excused: 'bg-ciel text-white' }
interface Entry { status: Status; minutes: string }

export default function Attendance() {
  const { year, profile, can } = useAuth()
  const toast = useToast()
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const base = useLoad(async () => {
    if (!year) return null
    const cl = rows<{ id: string; name: string }>(await supabase.from('classes').select('id,name').eq('academic_year_id', year.id).order('name'))
    const scope = can('teacher') && profile ? await teacherScope(profile.id) : null
    return { classes: cl.filter((c) => !scope || scope.classIds.has(c.id)) }
  }, [year?.id])

  const grid = useLoad(async () => {
    if (!classId || !date) return null
    const en = rows<{ id: string; student_id: string }>(await supabase.from('enrollments').select('id,student_id').eq('class_id', classId))
    const ids = en.map((e) => e.student_id)
    const [st, at] = await Promise.all([
      ids.length ? supabase.from('students').select('id,first_name,last_name,middle_name').in('id', ids) : Promise.resolve({ data: [], error: null }),
      supabase.from('attendance').select('student_id,status,minutes_late').eq('class_id', classId).eq('date', date),
    ])
    const students = rows<any>(st).sort((a, b) => fullName(a).localeCompare(fullName(b)))
    return { students, existing: rows<{ student_id: string; status: Status; minutes_late: number }>(at) }
  }, [classId, date])

  useEffect(() => {
    if (!grid.data) return setEntries({})
    const m: Record<string, Entry> = {}
    for (const s of grid.data.students) {
      const ex = grid.data.existing.find((x) => x.student_id === s.id)
      m[s.id] = { status: ex?.status ?? 'present', minutes: ex?.minutes_late ? String(ex.minutes_late) : '' }
    }
    setEntries(m)
  }, [grid.data])

  const counts = useMemo(() => {
    const c: Record<Status, number> = { present: 0, absent: 0, late: 0, excused: 0 }
    Object.values(entries).forEach((e) => { c[e.status] += 1 })
    return c
  }, [entries])

  if (!year) return <Alert tone="info">Aucune année scolaire en cours.</Alert>
  if (base.loading) return <Spinner />
  if (base.error) return <Alert>{base.error}</Alert>

  async function save() {
    if (!grid.data) return
    setErr(null)
    for (const s of grid.data.students) {
      const m = entries[s.id]
      if (m?.status === 'late' && m.minutes !== '' && !(Number(m.minutes) >= 0)) return setErr(`Minutes de retard invalides pour ${fullName(s)}.`)
    }
    const payload = grid.data.students.map((s: any) => ({
      student_id: s.id, class_id: classId, date, status: entries[s.id].status,
      minutes_late: entries[s.id].status === 'late' ? Math.round(Number(entries[s.id].minutes || 0)) : 0,
    }))
    setBusy(true)
    const { error: e } = await supabase.from('attendance').upsert(payload, { onConflict: 'student_id,class_id,date' })
    if (e) { setBusy(false); return setErr(errorMessage(e)) }

    // Notification aux parents ayant un compte, pour les nouvelles absences
    try {
      const newAbsent = grid.data.students.filter((s: any) => entries[s.id].status === 'absent' && grid.data!.existing.find((x) => x.student_id === s.id)?.status !== 'absent')
      if (newAbsent.length) {
        const links = rows<{ student_id: string; guardian_id: string }>(await supabase.from('student_guardians').select('student_id,guardian_id').in('student_id', newAbsent.map((s: any) => s.id)))
        const guardians = links.length ? rows<{ id: string; profile_id: string | null }>(await supabase.from('guardians').select('id,profile_id').in('id', links.map((l) => l.guardian_id)).not('profile_id', 'is', null)) : []
        const notes = links.flatMap((l) => {
          const g = guardians.find((x) => x.id === l.guardian_id)
          const s = newAbsent.find((x: any) => x.id === l.student_id)
          return g?.profile_id && s ? [{ user_id: g.profile_id, title: `Absence de ${s.first_name}`, body: `${fullName(s)} était absent(e) le ${dateFr(date)}.`, kind: 'absence' }] : []
        })
        if (notes.length) await supabase.from('notifications').insert(notes)
      }
    } catch { /* la notification ne doit jamais bloquer l'enregistrement */ }

    setBusy(false)
    toast('success', 'Présences enregistrées.')
    grid.reload()
  }

  return (
    <>
      <PageHeader title="Présences" subtitle="Appel quotidien par classe" />
      <Card className="mb-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Classe"><select className="field" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choisir…</option>{base.data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Date"><input className="field" type="date" max={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      </Card>

      {!classId ? <Card><EmptyState title="Choisissez une classe" text="Tous les élèves sont marqués présents par défaut : modifiez seulement les exceptions." /></Card> : grid.loading ? <Spinner /> : grid.error ? <Alert>{grid.error}</Alert> : !grid.data?.students.length ? <Card><EmptyState title="Aucun élève dans cette classe" /></Card> : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-marine-100 p-4">
            <p className="flex flex-wrap gap-2"><Badge tone="ok">{counts.present} présent(s)</Badge><Badge tone="bad">{counts.absent} absent(s)</Badge><Badge tone="warn">{counts.late} retard(s)</Badge><Badge tone="info">{counts.excused} excusé(s)</Badge></p>
            <Button variant="secondary" onClick={() => setEntries((m) => Object.fromEntries(Object.entries(m).map(([k]) => [k, { status: 'present' as Status, minutes: '' }])))}>Tous présents</Button>
          </div>
          <ul className="divide-y divide-marine-100">
            {grid.data.students.map((s: any) => {
              const e = entries[s.id] ?? { status: 'present' as Status, minutes: '' }
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="text-sm font-semibold">{fullName(s)}</span>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Statut de ${fullName(s)}`}>
                    {(Object.keys(LABELS) as Status[]).map((k) => (
                      <button key={k} aria-pressed={e.status === k} onClick={() => setEntries((m) => ({ ...m, [s.id]: { ...e, status: k } }))}
                        className={clsx('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', e.status === k ? TONES[k] : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{LABELS[k]}</button>
                    ))}
                    {e.status === 'late' && <input className="field w-20" inputMode="numeric" placeholder="min" aria-label="Minutes de retard" value={e.minutes} onChange={(ev) => setEntries((m) => ({ ...m, [s.id]: { ...e, minutes: ev.target.value } }))} />}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="space-y-3 border-t border-marine-100 p-4">
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end"><Button loading={busy} onClick={() => void save()}>Enregistrer l’appel</Button></div>
          </div>
        </Card>
      )}
    </>
  )
}
