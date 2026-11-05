import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { downloadCsv, printArea } from '../lib/export'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { fullName, mention } from '../lib/format'
import { teacherScope } from '../lib/scope'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad } from '../components/ui'

interface Rank { enrollment_id: string; student_id: string; average: number; class_rank: number; class_size: number }

export default function Reports() {
  const { school, year, profile, can } = useAuth()
  const [classId, setClassId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [bulletin, setBulletin] = useState<Rank | null>(null)

  const base = useLoad(async () => {
    if (!year) return null
    const [cl, pe, en, co, cc] = await Promise.all([
      supabase.from('classes').select('id,name').eq('academic_year_id', year.id).order('name'),
      supabase.from('periods').select('id,name').eq('academic_year_id', year.id).order('sequence'),
      supabase.from('enrollments').select('id,class_id,student_id').eq('academic_year_id', year.id),
      supabase.from('courses').select('id,name'),
      supabase.from('class_courses').select('id,class_id,course_id,coefficient,max_score'),
    ])
    const enrollments = rows<{ id: string; class_id: string; student_id: string }>(en)
    const scope = can('teacher') && profile ? await teacherScope(profile.id) : null
    const visibleClassIds = new Set(enrollments.map((e) => e.class_id))
    return {
      classes: rows<{ id: string; name: string }>(cl).filter((c) => visibleClassIds.has(c.id) && (!scope || scope.classIds.has(c.id) || can('director', 'secretary'))),
      periods: rows<{ id: string; name: string }>(pe),
      courses: rows<{ id: string; name: string }>(co),
      cc: rows<{ id: string; class_id: string; course_id: string; coefficient: number; max_score: number }>(cc),
    }
  }, [year?.id])

  const ranking = useLoad(async () => {
    if (!classId || !periodId) return null
    const r = rows<Rank>(await supabase.rpc('class_ranking', { p_class_id: classId, p_period_id: periodId }))
    const ids = r.map((x) => x.student_id)
    const st = ids.length ? rows<any>(await supabase.from('students').select('id,first_name,last_name,middle_name,matricule').in('id', ids)) : []
    return r.map((x) => ({ ...x, average: Number(x.average), student: st.find((s) => s.id === x.student_id) })).sort((a, b) => a.class_rank - b.class_rank)
  }, [classId, periodId])

  const detail = useLoad(async () => {
    if (!bulletin) return null
    return rows<{ class_course_id: string; score: number }>(await supabase.from('grades').select('class_course_id,score').eq('enrollment_id', bulletin.enrollment_id).eq('period_id', periodId))
  }, [bulletin?.enrollment_id, periodId])

  const courseRows = useMemo(() => {
    if (!base.data || !detail.data) return []
    return base.data.cc.filter((x) => x.class_id === classId).map((x) => {
      const g = detail.data!.find((d) => d.class_course_id === x.id)
      return { name: base.data!.courses.find((c) => c.id === x.course_id)?.name ?? 'Cours', coef: x.coefficient, max: x.max_score, score: g ? Number(g.score) : null }
    })
  }, [base.data, detail.data, classId])

  if (!year) return <Alert tone="info">Aucune année scolaire en cours.</Alert>
  if (base.loading) return <Spinner />
  if (base.error) return <Alert>{base.error}</Alert>

  const periodName = base.data?.periods.find((p) => p.id === periodId)?.name ?? ''
  const className = base.data?.classes.find((c) => c.id === classId)?.name ?? ''

  return (
    <>
      <PageHeader title="Bulletins et classements" subtitle="Moyennes pondérées sur 20 et rang dans la classe" />
      <Card className="mb-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Classe"><select className="field" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choisir…</option>{base.data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Période"><select className="field" value={periodId} onChange={(e) => setPeriodId(e.target.value)}><option value="">Choisir…</option>{base.data?.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        </div>
      </Card>

      {!classId || !periodId ? <Card><EmptyState title="Choisissez une classe et une période" /></Card> : ranking.loading ? <Spinner /> : ranking.error ? <Alert>{ranking.error}</Alert> : !ranking.data?.length ? <Card><EmptyState title="Aucun résultat pour cette période" text="Les moyennes apparaissent dès que des notes ont été encodées." /></Card> : (
        <Card>
          <div className="no-print flex justify-end gap-2 border-b border-marine-100 p-3">
            <Button variant="secondary" className="px-3 py-1.5" onClick={() => downloadCsv(`classement-${className}-${periodName}`, ['Rang', 'Élève', 'Matricule', 'Moyenne /20', 'Mention'], ranking.data!.map((r) => [r.class_rank, r.student ? fullName(r.student) : '', r.student?.matricule ?? '', r.average, mention(r.average).label]))}><Download className="h-4 w-4" aria-hidden /> Exporter</Button>
          </div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Rang</th><th className="th">Élève</th><th className="th text-right">Moyenne /20</th><th className="th">Mention</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-marine-100">
              {ranking.data.map((r) => {
                const m = mention(r.average)
                return (
                  <tr key={r.enrollment_id}>
                    <td className="td font-display text-lg font-extrabold text-marine">{r.class_rank}<span className="text-xs font-normal text-slate-400">/{r.class_size}</span></td>
                    <td className="td font-semibold">{r.student ? fullName(r.student) : 'Élève'}</td>
                    <td className="td text-right font-bold">{r.average.toFixed(2)}</td>
                    <td className="td"><Badge tone={m.tone}>{m.label}</Badge></td>
                    <td className="td text-right"><Button variant="secondary" className="px-3 py-1.5" onClick={() => setBulletin(r)}>Bulletin</Button></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        </Card>
      )}

      <Modal open={bulletin !== null} onClose={() => setBulletin(null)} title="Bulletin scolaire" wide>
        {bulletin && (() => {
          const st = ranking.data?.find((r) => r.enrollment_id === bulletin.enrollment_id)?.student
          const m = mention(Number(bulletin.average))
          return (
            <>
              <div className="print-area rounded-lg border border-marine-100 p-5">
                <div className="border-b border-marine-100 pb-3 text-center">
                  <p className="font-display text-xl font-extrabold text-marine">{school?.name}</p>
                  <p className="text-xs text-slate-500">{[school?.address, school?.city].filter(Boolean).join(' · ')}</p>
                  <p className="mt-2 font-display text-base font-bold">BULLETIN — {periodName} — Année {year.name}</p>
                </div>
                <div className="my-3 grid gap-1 text-sm sm:grid-cols-2">
                  <p><span className="text-slate-500">Élève : </span><strong>{st ? fullName(st) : ''}</strong></p>
                  <p><span className="text-slate-500">Matricule : </span>{st?.matricule}</p>
                  <p><span className="text-slate-500">Classe : </span>{className}</p>
                </div>
                {detail.loading ? <Spinner /> : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-marine-100"><tr><th className="th px-2">Cours</th><th className="th px-2 text-right">Coef.</th><th className="th px-2 text-right">Note</th><th className="th px-2 text-right">Sur 20</th></tr></thead>
                    <tbody className="divide-y divide-marine-100">
                      {courseRows.map((c) => (
                        <tr key={c.name}><td className="px-2 py-2">{c.name}</td><td className="px-2 py-2 text-right">{c.coef}</td>
                          <td className="px-2 py-2 text-right">{c.score === null ? '—' : `${c.score} / ${c.max}`}</td>
                          <td className="px-2 py-2 text-right font-semibold">{c.score === null ? '—' : ((c.score / c.max) * 20).toFixed(1)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-papier p-3 text-center">
                  <div><p className="text-xs text-slate-500">Moyenne</p><p className="font-display text-xl font-extrabold text-marine">{Number(bulletin.average).toFixed(2)}/20</p></div>
                  <div><p className="text-xs text-slate-500">Rang</p><p className="font-display text-xl font-extrabold text-marine">{bulletin.class_rank}/{bulletin.class_size}</p></div>
                  <div><p className="text-xs text-slate-500">Mention</p><p className="font-display text-xl font-extrabold text-marine">{m.label}</p></div>
                </div>
                <p className="mt-4 text-center text-xs text-slate-400">Bulletin généré par SCHOOLIA</p>
              </div>
              <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setBulletin(null)}>Fermer</Button><Button onClick={() => printArea()}><Printer className="h-4 w-4" aria-hidden /> Imprimer</Button></div>
            </>
          )
        })()}
      </Modal>
    </>
  )
}
