import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { fullName } from '../lib/format'
import { teacherScope } from '../lib/scope'
import { Alert, Badge, Button, Card, EmptyState, Field, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

interface Cls { id: string; name: string }
interface CC { id: string; class_id: string; course_id: string; coefficient: number; max_score: number }

export default function Grades() {
  const { year, profile, can } = useAuth()
  const toast = useToast()
  const [classId, setClassId] = useState('')
  const [ccId, setCcId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const base = useLoad(async () => {
    if (!year) return null
    const [cl, cc, co, pe] = await Promise.all([
      supabase.from('classes').select('id,name').eq('academic_year_id', year.id).order('name'),
      supabase.from('class_courses').select('id,class_id,course_id,coefficient,max_score'),
      supabase.from('courses').select('id,name'),
      supabase.from('periods').select('id,name,sequence').eq('academic_year_id', year.id).order('sequence'),
    ])
    const scope = can('teacher') && profile ? await teacherScope(profile.id) : null
    return { classes: rows<Cls>(cl), cc: rows<CC>(cc), courses: rows<{ id: string; name: string }>(co), periods: rows<{ id: string; name: string }>(pe), scope }
  }, [year?.id])

  const grid = useLoad(async () => {
    if (!classId || !ccId || !periodId) return null
    const en = rows<{ id: string; student_id: string }>(await supabase.from('enrollments').select('id,student_id').eq('class_id', classId))
    const [st, gr] = await Promise.all([
      en.length ? supabase.from('students').select('id,first_name,last_name,middle_name').in('id', en.map((e) => e.student_id)) : Promise.resolve({ data: [], error: null }),
      supabase.from('grades').select('enrollment_id,score').eq('class_course_id', ccId).eq('period_id', periodId),
    ])
    const students = rows<any>(st)
    const list = en.map((e) => ({ enrollmentId: e.id, student: students.find((s) => s.id === e.student_id) })).filter((x) => x.student)
      .sort((a, b) => fullName(a.student).localeCompare(fullName(b.student)))
    return { list, grades: rows<{ enrollment_id: string; score: number }>(gr) }
  }, [classId, ccId, periodId])

  useEffect(() => {
    if (grid.data) setValues(Object.fromEntries(grid.data.grades.map((g) => [g.enrollment_id, String(g.score)])))
    else setValues({})
  }, [grid.data])

  const classes = useMemo(() => (base.data?.classes ?? []).filter((c) => !base.data?.scope || base.data.scope.classIds.has(c.id)), [base.data])
  const courseOptions = useMemo(() => (base.data?.cc ?? []).filter((x) => x.class_id === classId && (!base.data?.scope || base.data.scope.classCourseIds.has(x.id))), [base.data, classId])
  const cc = courseOptions.find((x) => x.id === ccId)
  const courseName = (id: string) => base.data?.courses.find((c) => c.id === id)?.name ?? 'Cours'

  if (!year) return <Alert tone="info">Aucune année scolaire en cours.</Alert>
  if (base.loading) return <Spinner />
  if (base.error) return <Alert>{base.error}</Alert>
  if (!base.data) return null

  const filled = Object.values(values).filter((v) => v.trim() !== '').length
  const nums = Object.values(values).filter((v) => v.trim() !== '' && !Number.isNaN(Number(v))).map(Number)
  const avg = nums.length && cc ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null

  async function save() {
    if (!cc || !grid.data) return
    setErr(null)
    const payload: { enrollment_id: string; class_course_id: string; period_id: string; score: number }[] = []
    const bad: string[] = []
    for (const { enrollmentId, student } of grid.data.list) {
      const raw = (values[enrollmentId] ?? '').trim().replace(',', '.')
      if (raw === '') continue
      const n = Number(raw)
      if (Number.isNaN(n) || n < 0 || n > cc.max_score) bad.push(fullName(student))
      else payload.push({ enrollment_id: enrollmentId, class_course_id: cc.id, period_id: periodId, score: n })
    }
    if (bad.length) return setErr(`Note invalide (entre 0 et ${cc.max_score}) pour : ${bad.join(', ')}.`)
    if (!payload.length) return setErr('Aucune note à enregistrer.')
    setBusy(true)
    const { error: e } = await supabase.from('grades').upsert(payload, { onConflict: 'enrollment_id,class_course_id,period_id' })
    setBusy(false)
    if (e) return setErr(errorMessage(e))
    toast('success', `${payload.length} note(s) enregistrée(s).`)
    grid.reload()
  }

  return (
    <>
      <PageHeader title="Notes" subtitle="Encodage des points par classe, cours et période" />
      <Card className="mb-4 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Classe"><select className="field" value={classId} onChange={(e) => { setClassId(e.target.value); setCcId('') }}><option value="">Choisir…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Cours"><select className="field" value={ccId} onChange={(e) => setCcId(e.target.value)} disabled={!classId}><option value="">Choisir…</option>{courseOptions.map((x) => <option key={x.id} value={x.id}>{courseName(x.course_id)}</option>)}</select></Field>
          <Field label="Période"><select className="field" value={periodId} onChange={(e) => setPeriodId(e.target.value)}><option value="">Choisir…</option>{base.data.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
        {classes.length === 0 && <p className="mt-3 text-sm text-slate-500">{can('teacher') ? 'Aucune classe ne vous est affectée pour le moment.' : 'Créez d’abord des classes et des cours.'}</p>}
      </Card>

      {!classId || !ccId || !periodId ? <Card><EmptyState title="Sélectionnez une classe, un cours et une période" text="La liste des élèves apparaît ensuite avec une case de note par élève." /></Card> : grid.loading ? <Spinner /> : grid.error ? <Alert>{grid.error}</Alert> : !grid.data?.list.length ? <Card><EmptyState title="Aucun élève dans cette classe" /></Card> : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-marine-100 p-4">
            <p className="text-sm text-slate-600">Note sur <strong>{cc?.max_score}</strong> · coefficient <strong>{cc?.coefficient}</strong></p>
            <p className="flex gap-2"><Badge tone={filled === grid.data.list.length ? 'ok' : 'warn'}>{filled}/{grid.data.list.length} encodées</Badge>{avg !== null && cc && <Badge tone="info">Moyenne {avg.toFixed(2)} / {cc.max_score}</Badge>}</p>
          </div>
          <ul className="divide-y divide-marine-100">
            {grid.data.list.map(({ enrollmentId, student }) => (
              <li key={enrollmentId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm font-semibold">{fullName(student)}</span>
                <input className="field w-24 text-right" inputMode="decimal" aria-label={`Note de ${fullName(student)}`} value={values[enrollmentId] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [enrollmentId]: e.target.value }))} placeholder="—" />
              </li>
            ))}
          </ul>
          <div className="space-y-3 border-t border-marine-100 p-4">
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end"><Button loading={busy} onClick={() => void save()}>Enregistrer les notes</Button></div>
          </div>
        </Card>
      )}
    </>
  )
}
