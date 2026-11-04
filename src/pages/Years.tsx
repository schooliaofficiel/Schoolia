import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr, fullName } from '../lib/format'
import type { AcademicYear, ClassRow, Enrollment, Student } from '../lib/types'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

type Decision = 'promote' | 'repeat' | 'exit'
const DECISION_LABEL: Record<Decision, string> = { promote: 'Passe', repeat: 'Redouble', exit: 'Sort de l’école' }

function suggestNext(current?: AcademicYear) {
  const m = current?.name.match(/(\d{4})/)
  const y = m ? Number(m[1]) + 1 : new Date().getFullYear()
  return { name: `${y}-${y + 1}`, start: `${y}-09-01`, end: `${y + 1}-06-30` }
}

export default function Years() {
  const { can, refresh } = useAuth()
  const toast = useToast()
  const isDirector = can('director')
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState({ name: '', start: '', end: '', copy_structure: true, copy_fees: true })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [src, setSrc] = useState('')
  const [dst, setDst] = useState('')
  const [classMap, setClassMap] = useState<Record<string, string>>({})
  const [decision, setDecision] = useState<Record<string, Decision>>({})
  const [confirm, setConfirm] = useState(false)
  const [done, setDone] = useState<{ enrolled: number; graduated: number } | null>(null)

  const years = useLoad(async () => rows<AcademicYear>(await supabase.from('academic_years').select('*').order('start_date', { ascending: false })), [])

  useEffect(() => {
    const list = years.data
    if (!list || (src && dst)) return
    const cur = list.find((y) => y.is_current) ?? list[0]
    if (!cur) return
    const idx = list.findIndex((y) => y.id === cur.id)
    setDst(cur.id)
    setSrc(list[idx + 1]?.id ?? '')
  }, [years.data, src, dst])

  const plan = useLoad(async () => {
    if (!src || !dst || src === dst) return null
    const [en, enDst, cs, cd, av] = await Promise.all([
      supabase.from('enrollments').select('*').eq('academic_year_id', src).eq('status', 'active'),
      supabase.from('enrollments').select('student_id').eq('academic_year_id', dst),
      supabase.from('classes').select('*').eq('academic_year_id', src).order('name'),
      supabase.from('classes').select('*').eq('academic_year_id', dst).order('name'),
      supabase.rpc('student_year_averages', { p_year: src }),
    ])
    const enrollments = rows<Enrollment>(en)
    const st = enrollments.length ? rows<Student>(await supabase.from('students').select('id,first_name,last_name,middle_name,matricule').in('id', enrollments.map((e) => e.student_id))) : []
    return {
      enrollments, already: new Set(rows<{ student_id: string }>(enDst).map((x) => x.student_id)),
      srcClasses: rows<ClassRow>(cs), dstClasses: rows<ClassRow>(cd), students: st,
      averages: new Map(rows<{ enrollment_id: string; average: number }>(av).map((a) => [a.enrollment_id, Number(a.average)])),
    }
  }, [src, dst])

  useEffect(() => { setClassMap({}); setDecision({}); setDone(null) }, [src, dst])

  const dstByName = useMemo(() => new Map((plan.data?.dstClasses ?? []).map((c) => [c.name, c.id])), [plan.data])

  function openCreate() {
    setF({ ...suggestNext(years.data?.find((y) => y.is_current)), copy_structure: true, copy_fees: true })
    setErr(null); setCreating(true)
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (f.name.trim().length < 4) return setErr('Indiquez le nom de l’année (ex : 2027-2028).')
    if (!f.start || !f.end || f.end <= f.start) return setErr('La date de fin doit être après la date de début.')
    setBusy(true)
    const oldCurrent = years.data?.find((y) => y.is_current)
    const { data, error } = await supabase.rpc('start_new_academic_year', { p_name: f.name.trim(), p_start: f.start, p_end: f.end, p_copy_structure: f.copy_structure, p_copy_fees: f.copy_structure && f.copy_fees })
    setBusy(false)
    if (error) return setErr(errorMessage(error))
    toast('success', `Année ${f.name.trim()} ouverte.`)
    setCreating(false)
    await refresh()
    setSrc(oldCurrent?.id ?? ''); setDst(data as string)
    years.reload()
  }

  async function switchYear(y: AcademicYear) {
    const { error } = await supabase.rpc('switch_academic_year', { p_year: y.id })
    if (error) return toast('error', errorMessage(error))
    toast('success', `L’année ${y.name} est maintenant l’année en cours.`)
    await refresh(); years.reload()
  }

  // Décision effective de chaque élève
  const decisionOf = (enrId: string): Decision => decision[enrId] ?? (plan.data?.averages.get(enrId) !== undefined && (plan.data!.averages.get(enrId) as number) < 10 ? 'repeat' : 'promote')

  function buildMoves(): { moves: any[]; error?: string } {
    const d = plan.data!
    const moves: any[] = []
    for (const e of d.enrollments) {
      if (d.already.has(e.student_id)) continue
      const cls = d.srcClasses.find((c) => c.id === e.class_id)
      const dec = decisionOf(e.id)
      if (dec === 'exit') { moves.push({ enrollment_id: e.id, outcome: 'graduated' }); continue }
      if (dec === 'repeat') {
        const same = cls ? dstByName.get(cls.name) : undefined
        if (!same) return { moves, error: `Redoublement impossible pour la classe « ${cls?.name} » : aucune classe du même nom n’existe dans l’année d’arrivée.` }
        moves.push({ enrollment_id: e.id, outcome: 'repeat', class_id: same }); continue
      }
      const target = classMap[e.class_id]
      if (!target) return { moves, error: `Choisissez où passent les élèves de « ${cls?.name} ».` }
      if (target === 'exit') moves.push({ enrollment_id: e.id, outcome: 'graduated' })
      else moves.push({ enrollment_id: e.id, outcome: 'promoted', class_id: target })
    }
    return { moves }
  }

  async function submit() {
    const { moves, error } = buildMoves()
    if (error) { setConfirm(false); return toast('error', error) }
    setBusy(true)
    const { data, error: e } = await supabase.rpc('promote_students', { p_new_year: dst, p_moves: moves })
    setBusy(false)
    if (e) return toast('error', errorMessage(e))
    setConfirm(false)
    setDone(data as { enrolled: number; graduated: number })
    plan.reload()
  }

  const counts = (() => {
    if (!plan.data) return { promote: 0, repeat: 0, exit: 0, skipped: 0 }
    const c = { promote: 0, repeat: 0, exit: 0, skipped: 0 }
    for (const e of plan.data.enrollments) {
      if (plan.data.already.has(e.student_id)) { c.skipped++; continue }
      const dec = decisionOf(e.id)
      if (dec === 'promote' && classMap[e.class_id] === 'exit') c.exit++
      else c[dec]++
    }
    return c
  })()

  return (
    <>
      <PageHeader title="Années scolaires" subtitle="Ouverture d’une nouvelle année et passage de classe" actions={isDirector ? <Button onClick={openCreate}><Plus className="h-4 w-4" aria-hidden /> Nouvelle année</Button> : undefined} />

      <Card className="mb-6">
        {years.loading ? <Spinner /> : (
          <ul className="divide-y divide-marine-100">
            {years.data?.map((y) => (
              <li key={y.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div><p className="font-display text-lg font-extrabold text-marine">{y.name}</p><p className="text-xs text-slate-500">{dateFr(y.start_date)} → {dateFr(y.end_date)}</p></div>
                {y.is_current ? <Badge tone="ok">Année en cours</Badge> : isDirector && <Button variant="secondary" className="px-3 py-1.5" onClick={() => void switchYear(y)}>Définir comme année en cours</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 text-xl font-extrabold text-marine">Passage de classe</h2>
      <Card className="mb-4 p-4">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="Année d’origine"><select className="field" value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Choisir…</option>{years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field>
          <ArrowRight className="mb-3 hidden h-5 w-5 text-slate-400 sm:block" aria-hidden />
          <Field label="Année d’arrivée"><select className="field" value={dst} onChange={(e) => setDst(e.target.value)}><option value="">Choisir…</option>{years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></Field>
        </div>
        <p className="mt-3 text-sm text-slate-500">Pour chaque classe, indiquez la classe d’arrivée. Chaque élève est proposé « Passe » s’il a au moins 10/20 de moyenne annuelle, « Redouble » sinon : ajustez élève par élève avant de valider.</p>
      </Card>

      {!src || !dst || src === dst ? <Card><EmptyState title="Choisissez deux années différentes" text="Ouvrez d’abord la nouvelle année avec « Nouvelle année », puis revenez ici pour répartir les élèves." /></Card>
        : plan.loading ? <Spinner /> : plan.error ? <Alert>{plan.error}</Alert> : !plan.data?.enrollments.length ? <Card><EmptyState title="Aucun élève actif dans l’année d’origine" /></Card> : (
        <>
          {plan.data.dstClasses.length === 0 && <div className="mb-4"><Alert tone="info">L’année d’arrivée n’a pas encore de classes. Créez-les dans « Classes et cours », ou rouvrez une année en copiant la structure.</Alert></div>}
          {done && <div className="mb-4"><Alert tone="success"><strong>{done.enrolled}</strong> élève(s) inscrit(s) dans l’année d’arrivée et <strong>{done.graduated}</strong> sortant(s) enregistré(s).</Alert></div>}
          <div className="space-y-4">
            {plan.data.srcClasses.map((c) => {
              const list = plan.data!.enrollments.filter((e) => e.class_id === c.id)
              if (!list.length) return null
              return (
                <Card key={c.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-marine-100 p-4">
                    <div><p className="font-display text-lg font-extrabold text-marine">{c.name}</p><p className="text-xs text-slate-500">{list.length} élève(s)</p></div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-marine">Les élèves qui passent vont en :
                      <select className="field w-56" value={classMap[c.id] ?? ''} onChange={(e) => setClassMap((m) => ({ ...m, [c.id]: e.target.value }))}>
                        <option value="">Choisir…</option>
                        {plan.data!.dstClasses.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                        <option value="exit">Fin d’études (sortie)</option>
                      </select>
                    </label>
                  </div>
                  <ul className="divide-y divide-marine-100">
                    {list.map((e) => {
                      const st = plan.data!.students.find((s) => s.id === e.student_id)
                      const avg = plan.data!.averages.get(e.id)
                      const already = plan.data!.already.has(e.student_id)
                      return (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                          <span className="text-sm"><span className="font-semibold">{st ? fullName(st) : 'Élève'}</span> <span className="text-slate-400">{avg !== undefined ? `· ${avg.toFixed(2)}/20` : '· sans note'}</span></span>
                          {already ? <Badge tone="info">Déjà inscrit</Badge> : (
                            <select className="field w-44" aria-label="Décision" value={decisionOf(e.id)} onChange={(ev) => setDecision((d) => ({ ...d, [e.id]: ev.target.value as Decision }))}>
                              {(Object.keys(DECISION_LABEL) as Decision[]).map((k) => <option key={k} value={k}>{DECISION_LABEL[k]}</option>)}
                            </select>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Card>
              )
            })}
          </div>
          <div className="sticky bottom-0 mt-4 flex justify-end rounded-xl border border-marine-100 bg-white p-3">
            <Button onClick={() => { const r = buildMoves(); if (r.error) toast('error', r.error); else setConfirm(true) }}>Valider le passage</Button>
          </div>
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nouvelle année scolaire">
        <form onSubmit={create} className="space-y-4" noValidate>
          <Field label="Nom de l’année"><input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="2027-2028" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Début"><input className="field" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
            <Field label="Fin"><input className="field" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={f.copy_structure} onChange={(e) => setF({ ...f, copy_structure: e.target.checked })} /><span><strong>Reprendre les classes et les cours</strong> de l’année en cours (enseignants, coefficients, maximums).</span></label>
          <label className={`flex items-start gap-2 text-sm ${f.copy_structure ? '' : 'opacity-50'}`}><input type="checkbox" className="mt-0.5 h-4 w-4" disabled={!f.copy_structure} checked={f.copy_structure && f.copy_fees} onChange={(e) => setF({ ...f, copy_fees: e.target.checked })} /><span><strong>Reprendre les frais scolaires</strong> (montants identiques, échéances décalées).</span></label>
          <Alert tone="info">L’année actuelle sera clôturée comme année en cours ; ses données restent consultables. Les 6 périodes standard sont créées.</Alert>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreating(false)}>Annuler</Button><Button type="submit" loading={busy}>Ouvrir l’année</Button></div>
        </form>
      </Modal>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Confirmer le passage de classe">
        <ul className="space-y-1 text-sm">
          <li><strong>{counts.promote}</strong> élève(s) passent en classe supérieure</li>
          <li><strong>{counts.repeat}</strong> redoublant(s)</li>
          <li><strong>{counts.exit}</strong> sortant(s) en fin d’études</li>
          {counts.skipped > 0 && <li className="text-slate-500">{counts.skipped} déjà inscrit(s) : ignoré(s)</li>}
        </ul>
        <p className="mt-3 text-sm text-slate-500">Les inscriptions de l’année d’arrivée sont créées. Vous pourrez encore changer un élève de classe depuis « Élèves ».</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirm(false)}>Annuler</Button><Button loading={busy} onClick={() => void submit()}>Confirmer</Button></div>
      </Modal>
    </>
  )
}
