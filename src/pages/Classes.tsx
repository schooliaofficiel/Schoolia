import { useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { WEEKDAYS } from '../lib/format'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

type Tab = 'classes' | 'courses' | 'teachers' | 'timetable'
type Kind = 'class' | 'assign' | 'teacher' | 'slot'
interface Opt { id: string; name: string }
interface Cls { id: string; name: string; level: string | null; option_id: string | null }
interface CC { id: string; class_id: string; course_id: string; teacher_id: string | null; coefficient: number; max_score: number }
interface Teacher { id: string; full_name: string; phone: string | null; email: string | null; specialty: string | null }
interface Slot { id: string; class_course_id: string; weekday: number; start_time: string; end_time: string; room: string | null }

export default function Classes() {
  const { year, can } = useAuth()
  const toast = useToast()
  const canWrite = can('director', 'secretary')
  const [tab, setTab] = useState<Tab>('classes')
  const [selClass, setSelClass] = useState('')
  const [dlg, setDlg] = useState<{ kind: Kind; id?: string } | null>(null)
  const [f, setF] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [del, setDel] = useState<{ table: string; id: string; label: string } | null>(null)

  const { data, loading, error, reload } = useLoad(async () => {
    if (!year) return null
    const [cl, op, co, cc, te, en, sl] = await Promise.all([
      supabase.from('classes').select('*').eq('academic_year_id', year.id).order('name'),
      supabase.from('options').select('id,name').order('name'),
      supabase.from('courses').select('id,name').order('name'),
      supabase.from('class_courses').select('*'),
      supabase.from('teachers').select('*').order('full_name'),
      supabase.from('enrollments').select('id,class_id').eq('academic_year_id', year.id),
      supabase.from('timetable_slots').select('*').order('start_time'),
    ])
    return { classes: rows<Cls>(cl), options: rows<Opt>(op), courses: rows<Opt>(co), cc: rows<CC>(cc), teachers: rows<Teacher>(te), enrollments: rows<{ id: string; class_id: string }>(en), slots: rows<Slot>(sl) }
  }, [year?.id])

  if (!year) return <Alert tone="info">Aucune année scolaire en cours.</Alert>
  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!data) return null

  const classId = selClass || data.classes[0]?.id || ''
  const courseName = (id: string) => data.courses.find((c) => c.id === id)?.name ?? 'Cours'
  const teacherName = (id: string | null) => data.teachers.find((t) => t.id === id)?.full_name ?? 'Non assigné'
  const classCourses = data.cc.filter((x) => x.class_id === classId)
  const bind = (k: string) => ({ value: f[k] ?? '', onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value })) })
  const open = (kind: Kind, id?: string, init: Record<string, string> = {}) => { setF(init); setErr(null); setDlg({ kind, id }) }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!dlg) return
    setErr(null)
    setBusy(true)
    try {
      if (dlg.kind === 'class') {
        if (!f.name?.trim()) throw new Error('Le nom de la classe est obligatoire.')
        let optionId = f.option_id || null
        if (f.new_option?.trim()) {
          const { data: o, error: oe } = await supabase.from('options').insert({ name: f.new_option.trim() }).select('id').single()
          if (oe) throw oe
          optionId = o.id
        }
        const payload = { name: f.name.trim(), level: f.level?.trim() || null, option_id: optionId }
        const r = dlg.id ? await supabase.from('classes').update(payload).eq('id', dlg.id) : await supabase.from('classes').insert({ ...payload, academic_year_id: year!.id })
        if (r.error) throw r.error
      }
      if (dlg.kind === 'assign') {
        const coef = Number(f.coefficient), max = Number(f.max_score)
        if (!(coef > 0)) throw new Error('Le coefficient doit être supérieur à zéro.')
        if (!(max > 0)) throw new Error('Le maximum doit être supérieur à zéro.')
        if (dlg.id) {
          const r = await supabase.from('class_courses').update({ teacher_id: f.teacher_id || null, coefficient: coef, max_score: max }).eq('id', dlg.id)
          if (r.error) throw r.error
        } else {
          let courseId = f.course_id
          if (courseId === 'new' || !courseId) {
            if (!f.new_course?.trim()) throw new Error('Choisissez un cours ou saisissez un nouveau nom.')
            const { data: c, error: ce } = await supabase.from('courses').insert({ name: f.new_course.trim() }).select('id').single()
            if (ce) throw ce
            courseId = c.id
          }
          const r = await supabase.from('class_courses').insert({ class_id: classId, course_id: courseId, teacher_id: f.teacher_id || null, coefficient: coef, max_score: max })
          if (r.error) throw r.error
        }
      }
      if (dlg.kind === 'teacher') {
        if (!f.full_name?.trim()) throw new Error('Le nom de l’enseignant est obligatoire.')
        if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) throw new Error('Adresse e-mail invalide.')
        const payload = { full_name: f.full_name.trim(), phone: f.phone?.trim() || null, email: f.email?.trim() || null, specialty: f.specialty?.trim() || null }
        const r = dlg.id ? await supabase.from('teachers').update(payload).eq('id', dlg.id) : await supabase.from('teachers').insert(payload)
        if (r.error) throw r.error
      }
      if (dlg.kind === 'slot') {
        if (!f.class_course_id) throw new Error('Choisissez un cours.')
        if (!f.start_time || !f.end_time) throw new Error('Indiquez l’heure de début et de fin.')
        if (f.end_time <= f.start_time) throw new Error('L’heure de fin doit être après l’heure de début.')
        const r = await supabase.from('timetable_slots').insert({ class_course_id: f.class_course_id, weekday: Number(f.weekday || 1), start_time: f.start_time, end_time: f.end_time, room: f.room?.trim() || null })
        if (r.error) throw r.error
      }
      toast('success', 'Enregistré.')
      setDlg(null)
      reload()
    } catch (x) {
      setErr(errorMessage(x))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!del) return
    setBusy(true)
    const { error: e } = await supabase.from(del.table).delete().eq('id', del.id)
    setBusy(false)
    if (e) return toast('error', e.code === '23503' ? 'Suppression impossible : des données y sont liées.' : errorMessage(e))
    toast('success', 'Supprimé.')
    setDel(null)
    reload()
  }

  const tabs: { id: Tab; label: string }[] = [{ id: 'classes', label: 'Classes' }, { id: 'courses', label: 'Cours' }, { id: 'teachers', label: 'Enseignants' }, { id: 'timetable', label: 'Horaires' }]
  const ClassPicker = (
    <select className="field mb-4 sm:w-72" value={classId} onChange={(e) => setSelClass(e.target.value)} aria-label="Classe">
      {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
  const RowActions = ({ onEdit, onDelete, label }: { onEdit?: () => void; onDelete: () => void; label: string }) => canWrite ? (
    <span className="whitespace-nowrap">
      {onEdit && <button onClick={onEdit} aria-label={`Modifier ${label}`} className="rounded-lg p-2 text-marine hover:bg-marine-50"><Pencil className="h-4 w-4" /></button>}
      <button onClick={onDelete} aria-label={`Supprimer ${label}`} className="rounded-lg p-2 text-marge hover:bg-marge-50"><Trash2 className="h-4 w-4" /></button>
    </span>
  ) : null

  return (
    <>
      <PageHeader title="Classes et cours" subtitle={`Année ${year.name}`} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-marine-100" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={clsx('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold', tab === t.id ? 'border-ciel text-marine' : 'border-transparent text-slate-500 hover:text-marine')}>{t.label}</button>)}
      </div>

      {tab === 'classes' && (
        <>
          {canWrite && <div className="mb-4"><Button onClick={() => open('class', undefined, {})}><Plus className="h-4 w-4" aria-hidden /> Nouvelle classe</Button></div>}
          {data.classes.length === 0 ? <Card><EmptyState title="Aucune classe" text="Créez les classes de l’année pour pouvoir y inscrire des élèves." /></Card> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.classes.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-display text-lg font-extrabold text-marine">{c.name}</p><p className="text-sm text-slate-500">{[c.level, data.options.find((o) => o.id === c.option_id)?.name].filter(Boolean).join(' · ') || '—'}</p></div>
                    <RowActions label={c.name} onEdit={() => open('class', c.id, { name: c.name, level: c.level ?? '', option_id: c.option_id ?? '' })} onDelete={() => setDel({ table: 'classes', id: c.id, label: c.name })} />
                  </div>
                  <p className="mt-3 flex gap-2"><Badge tone="info">{data.enrollments.filter((x) => x.class_id === c.id).length} élève(s)</Badge><Badge>{data.cc.filter((x) => x.class_id === c.id).length} cours</Badge></p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'courses' && (data.classes.length === 0 ? <Card><EmptyState title="Créez d’abord une classe" /></Card> : (
        <>
          {ClassPicker}
          {canWrite && <div className="mb-4"><Button onClick={() => open('assign', undefined, { coefficient: '1', max_score: '20', course_id: data.courses[0]?.id ?? 'new' })}><Plus className="h-4 w-4" aria-hidden /> Ajouter un cours</Button></div>}
          <Card>
            {classCourses.length === 0 ? <EmptyState title="Aucun cours dans cette classe" text="Ajoutez les matières avec leur enseignant, leur coefficient et leur note maximale." /> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Cours</th><th className="th">Enseignant</th><th className="th text-right">Coefficient</th><th className="th text-right">Maximum</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-marine-100">{classCourses.map((x) => (
                  <tr key={x.id}><td className="td font-semibold">{courseName(x.course_id)}</td><td className="td">{teacherName(x.teacher_id)}</td><td className="td text-right">{x.coefficient}</td><td className="td text-right">{x.max_score}</td>
                    <td className="td text-right"><RowActions label={courseName(x.course_id)} onEdit={() => open('assign', x.id, { teacher_id: x.teacher_id ?? '', coefficient: String(x.coefficient), max_score: String(x.max_score) })} onDelete={() => setDel({ table: 'class_courses', id: x.id, label: courseName(x.course_id) })} /></td></tr>
                ))}</tbody></table></div>
            )}
          </Card>
        </>
      ))}

      {tab === 'teachers' && (
        <>
          {canWrite && <div className="mb-4"><Button onClick={() => open('teacher', undefined, {})}><Plus className="h-4 w-4" aria-hidden /> Nouvel enseignant</Button></div>}
          <Card>
            {data.teachers.length === 0 ? <EmptyState title="Aucun enseignant" text="Ajoutez les enseignants pour les affecter aux cours." /> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Nom</th><th className="th">Spécialité</th><th className="th">Téléphone</th><th className="th">E-mail</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-marine-100">{data.teachers.map((t) => (
                  <tr key={t.id}><td className="td font-semibold">{t.full_name}</td><td className="td">{t.specialty ?? '—'}</td><td className="td">{t.phone ?? '—'}</td><td className="td">{t.email ?? '—'}</td>
                    <td className="td text-right"><RowActions label={t.full_name} onEdit={() => open('teacher', t.id, { full_name: t.full_name, phone: t.phone ?? '', email: t.email ?? '', specialty: t.specialty ?? '' })} onDelete={() => setDel({ table: 'teachers', id: t.id, label: t.full_name })} /></td></tr>
                ))}</tbody></table></div>
            )}
          </Card>
        </>
      )}

      {tab === 'timetable' && (data.classes.length === 0 ? <Card><EmptyState title="Créez d’abord une classe" /></Card> : (
        <>
          {ClassPicker}
          {canWrite && <div className="mb-4"><Button onClick={() => open('slot', undefined, { weekday: '1', class_course_id: classCourses[0]?.id ?? '' })} disabled={classCourses.length === 0}><Plus className="h-4 w-4" aria-hidden /> Ajouter une séance</Button></div>}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((d) => {
              const daySlots = data.slots.filter((s) => s.weekday === d && classCourses.some((c) => c.id === s.class_course_id)).sort((a, b) => a.start_time.localeCompare(b.start_time))
              return (
                <Card key={d} className="p-4">
                  <h3 className="mb-2 font-display text-base font-bold text-marine">{WEEKDAYS[d]}</h3>
                  {daySlots.length === 0 ? <p className="text-sm text-slate-400">Aucune séance</p> : (
                    <ul className="space-y-2">{daySlots.map((s) => {
                      const cc = classCourses.find((c) => c.id === s.class_course_id)
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-papier px-3 py-2 text-sm">
                          <span><span className="font-semibold">{cc ? courseName(cc.course_id) : ''}</span><span className="block text-xs text-slate-500">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}{s.room ? ` · ${s.room}` : ''}</span></span>
                          <RowActions label="cette séance" onDelete={() => setDel({ table: 'timetable_slots', id: s.id, label: 'cette séance' })} />
                        </li>
                      )
                    })}</ul>
                  )}
                </Card>
              )
            })}
          </div>
        </>
      ))}

      <Modal open={dlg !== null} onClose={() => setDlg(null)} title={dlg?.kind === 'class' ? (dlg.id ? 'Modifier la classe' : 'Nouvelle classe') : dlg?.kind === 'assign' ? (dlg.id ? 'Modifier le cours' : 'Ajouter un cours à la classe') : dlg?.kind === 'teacher' ? (dlg.id ? 'Modifier l’enseignant' : 'Nouvel enseignant') : 'Nouvelle séance'}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {dlg?.kind === 'class' && <>
            <Field label="Nom de la classe"><input className="field" {...bind('name')} placeholder="1ère Sciences A" /></Field>
            <Field label="Niveau"><input className="field" {...bind('level')} placeholder="1ère" /></Field>
            <Field label="Option"><select className="field" {...bind('option_id')}><option value="">Aucune</option>{data.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            <Field label="Ou nouvelle option" hint="Remplit et remplace le choix ci-dessus."><input className="field" {...bind('new_option')} placeholder="Électricité, Latin-philo…" /></Field>
          </>}
          {dlg?.kind === 'assign' && <>
            {!dlg.id && <>
              <Field label="Cours"><select className="field" {...bind('course_id')}>{data.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="new">+ Nouveau cours…</option></select></Field>
              {(f.course_id === 'new' || data.courses.length === 0) && <Field label="Nom du nouveau cours"><input className="field" {...bind('new_course')} placeholder="Chimie" /></Field>}
            </>}
            <Field label="Enseignant"><select className="field" {...bind('teacher_id')}><option value="">Non assigné</option>{data.teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Coefficient"><input className="field" type="number" min="0.5" step="0.5" inputMode="decimal" {...bind('coefficient')} /></Field>
              <Field label="Note maximale"><input className="field" type="number" min="1" inputMode="decimal" {...bind('max_score')} /></Field>
            </div>
          </>}
          {dlg?.kind === 'teacher' && <>
            <Field label="Nom complet"><input className="field" {...bind('full_name')} /></Field>
            <Field label="Spécialité"><input className="field" {...bind('specialty')} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Téléphone"><input className="field" inputMode="tel" {...bind('phone')} /></Field>
              <Field label="E-mail"><input className="field" type="email" {...bind('email')} /></Field>
            </div>
          </>}
          {dlg?.kind === 'slot' && <>
            <Field label="Cours"><select className="field" {...bind('class_course_id')}>{classCourses.map((c) => <option key={c.id} value={c.id}>{courseName(c.course_id)}</option>)}</select></Field>
            <Field label="Jour"><select className="field" {...bind('weekday')}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Début"><input className="field" type="time" {...bind('start_time')} /></Field>
              <Field label="Fin"><input className="field" type="time" {...bind('end_time')} /></Field>
            </div>
            <Field label="Salle (facultatif)"><input className="field" {...bind('room')} /></Field>
          </>}
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDlg(null)}>Annuler</Button><Button type="submit" loading={busy}>Enregistrer</Button></div>
        </form>
      </Modal>

      <Modal open={del !== null} onClose={() => setDel(null)} title="Confirmer la suppression">
        <p className="text-sm text-slate-600">Supprimer <strong>{del?.label}</strong> ? Les données qui en dépendent (notes, séances…) peuvent être supprimées aussi.</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setDel(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Supprimer</Button></div>
      </Modal>
    </>
  )
}
