import { useMemo, useState, type FormEvent } from 'react'
import { Download, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { downloadCsv } from '../lib/export'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr, fullName } from '../lib/format'
import type { ClassRow, Enrollment, Student } from '../lib/types'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

interface Form {
  first_name: string; last_name: string; middle_name: string; gender: '' | 'M' | 'F'
  birth_date: string; birth_place: string; address: string; class_id: string
  guardian_name: string; guardian_phone: string
}
const EMPTY: Form = { first_name: '', last_name: '', middle_name: '', gender: '', birth_date: '', birth_place: '', address: '', class_id: '', guardian_name: '', guardian_phone: '' }

function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {}
  if (!f.last_name.trim()) e.last_name = 'Le nom est obligatoire.'
  if (!f.first_name.trim()) e.first_name = 'Le prénom est obligatoire.'
  if (f.birth_date && new Date(f.birth_date) > new Date()) e.birth_date = 'La date de naissance ne peut pas être dans le futur.'
  if (f.guardian_phone && !/^[+0-9 ()-]{6,20}$/.test(f.guardian_phone)) e.guardian_phone = 'Numéro de téléphone invalide.'
  return e
}

export default function Students() {
  const { year, can } = useAuth()
  const toast = useToast()
  const canWrite = can('director', 'secretary')
  const [q, setQ] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [editing, setEditing] = useState<Student | 'new' | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<Student | null>(null)

  const { data, loading, error, reload } = useLoad(async () => {
    const [st, en, cl] = await Promise.all([
      supabase.from('students').select('*').order('last_name').order('first_name'),
      supabase.from('enrollments').select('*').eq('academic_year_id', year?.id ?? ''),
      supabase.from('classes').select('*').eq('academic_year_id', year?.id ?? '').order('name'),
    ])
    return { students: rows<Student>(st), enrollments: rows<Enrollment>(en), classes: rows<ClassRow>(cl) }
  }, [year?.id])

  const enrollmentOf = useMemo(() => new Map((data?.enrollments ?? []).map((e) => [e.student_id, e])), [data])
  const classOf = useMemo(() => new Map((data?.classes ?? []).map((c) => [c.id, c])), [data])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data?.students ?? []).filter((s) => {
      const e = enrollmentOf.get(s.id)
      if (classFilter === 'none' ? e : classFilter && e?.class_id !== classFilter) return false
      if (!term) return true
      return `${s.first_name} ${s.last_name} ${s.middle_name ?? ''} ${s.matricule}`.toLowerCase().includes(term)
    })
  }, [data, q, classFilter, enrollmentOf])

  function openNew() { setForm(EMPTY); setErrors({}); setFormError(null); setEditing('new') }
  function openEdit(s: Student) {
    setForm({
      first_name: s.first_name, last_name: s.last_name, middle_name: s.middle_name ?? '', gender: s.gender ?? '',
      birth_date: s.birth_date ?? '', birth_place: s.birth_place ?? '', address: s.address ?? '',
      class_id: enrollmentOf.get(s.id)?.class_id ?? '', guardian_name: '', guardian_phone: '',
    })
    setErrors({}); setFormError(null); setEditing(s)
  }
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value as never }))

  async function save(e: FormEvent) {
    e.preventDefault()
    const v = validate(form)
    setErrors(v); setFormError(null)
    if (Object.keys(v).length) return
    setBusy(true)
    try {
      const payload = {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(), middle_name: form.middle_name.trim() || null,
        gender: form.gender || null, birth_date: form.birth_date || null, birth_place: form.birth_place.trim() || null, address: form.address.trim() || null,
      }
      if (editing === 'new') {
        const { data: created, error: err } = await supabase.from('students').insert(payload).select('id').single()
        if (err) throw err
        if (form.class_id && year) {
          const { error: e2 } = await supabase.from('enrollments').insert({ student_id: created.id, class_id: form.class_id, academic_year_id: year.id })
          if (e2) throw e2
        }
        if (form.guardian_name.trim()) {
          const { data: g, error: e3 } = await supabase.from('guardians').insert({ full_name: form.guardian_name.trim(), phone: form.guardian_phone.trim() || null, relation: 'Parent' }).select('id').single()
          if (e3) throw e3
          const { error: e4 } = await supabase.from('student_guardians').insert({ student_id: created.id, guardian_id: g.id, is_primary: true })
          if (e4) throw e4
        }
        toast('success', 'Élève enregistré.')
      } else if (editing) {
        const { error: err } = await supabase.from('students').update(payload).eq('id', editing.id)
        if (err) throw err
        const current = enrollmentOf.get(editing.id)
        if (form.class_id && year && current?.class_id !== form.class_id) {
          const res = current
            ? await supabase.from('enrollments').update({ class_id: form.class_id }).eq('id', current.id)
            : await supabase.from('enrollments').insert({ student_id: editing.id, class_id: form.class_id, academic_year_id: year.id, is_reenrollment: true })
          if (res.error) throw res.error
        }
        toast('success', 'Modifications enregistrées.')
      }
      setEditing(null)
      reload()
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!toDelete) return
    setBusy(true)
    const { error: err } = await supabase.from('students').delete().eq('id', toDelete.id)
    setBusy(false)
    if (err) { toast('error', err.code === '23503' ? 'Suppression impossible : cet élève a des paiements enregistrés.' : errorMessage(err)); return }
    toast('success', 'Élève supprimé.')
    setToDelete(null)
    reload()
  }

  return (
    <>
      <PageHeader
        title="Élèves"
        subtitle={`${data?.students.length ?? 0} élève(s) · ${data?.enrollments.length ?? 0} inscrit(s) cette année`}
        actions={<>
          <Button variant="secondary" onClick={() => downloadCsv(`eleves-${year?.name ?? ''}`, ['Matricule', 'Nom', 'Postnom', 'Prénom', 'Sexe', 'Naissance', 'Classe'], list.map((s) => [s.matricule, s.last_name, s.middle_name ?? '', s.first_name, s.gender ?? '', s.birth_date ?? '', classOf.get(enrollmentOf.get(s.id)?.class_id ?? '')?.name ?? 'Non inscrit']))} disabled={list.length === 0}><Download className="h-4 w-4" aria-hidden /> Exporter</Button>
          {canWrite && <Button onClick={openNew}><Plus className="h-4 w-4" aria-hidden /> Nouvel élève</Button>}
        </>}
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-marine-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="field pl-9" placeholder="Rechercher par nom ou matricule" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un élève" />
          </div>
          <select className="field sm:w-56" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filtrer par classe">
            <option value="">Toutes les classes</option>
            {data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="none">Non inscrits</option>
          </select>
        </div>

        {loading ? <Spinner /> : error ? <div className="p-4"><Alert>{error}</Alert></div> : list.length === 0 ? (
          <EmptyState title={data?.students.length ? 'Aucun résultat' : 'Aucun élève pour le moment'} text={data?.students.length ? 'Modifiez votre recherche ou le filtre de classe.' : 'Ajoutez votre premier élève ou chargez les données de démonstration dans les paramètres.'} action={canWrite && !data?.students.length ? <Button onClick={openNew}>Ajouter un élève</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-marine-100 bg-papier"><tr>
                <th className="th">Matricule</th><th className="th">Nom complet</th><th className="th">Sexe</th><th className="th">Naissance</th><th className="th">Classe</th>{canWrite && <th className="th text-right">Actions</th>}
              </tr></thead>
              <tbody className="divide-y divide-marine-100">
                {list.map((s) => {
                  const e = enrollmentOf.get(s.id)
                  return (
                    <tr key={s.id} className="hover:bg-papier/60">
                      <td className="td font-mono text-xs">{s.matricule}</td>
                      <td className="td font-semibold">{fullName(s)}</td>
                      <td className="td">{s.gender ?? '—'}</td>
                      <td className="td">{dateFr(s.birth_date)}</td>
                      <td className="td">{e ? classOf.get(e.class_id)?.name : <Badge tone="warn">Non inscrit</Badge>}</td>
                      {canWrite && (
                        <td className="td text-right">
                          <button onClick={() => openEdit(s)} aria-label={`Modifier ${fullName(s)}`} className="rounded-lg p-2 text-marine hover:bg-marine-50"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setToDelete(s)} aria-label={`Supprimer ${fullName(s)}`} className="rounded-lg p-2 text-marge hover:bg-marge-50"><Trash2 className="h-4 w-4" /></button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouvel élève' : 'Modifier l’élève'} wide>
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom" error={errors.last_name}><input className="field" value={form.last_name} onChange={set('last_name')} /></Field>
            <Field label="Postnom"><input className="field" value={form.middle_name} onChange={set('middle_name')} /></Field>
            <Field label="Prénom" error={errors.first_name}><input className="field" value={form.first_name} onChange={set('first_name')} /></Field>
            <Field label="Sexe">
              <select className="field" value={form.gender} onChange={set('gender')}><option value="">Non précisé</option><option value="M">Masculin</option><option value="F">Féminin</option></select>
            </Field>
            <Field label="Date de naissance" error={errors.birth_date}><input className="field" type="date" value={form.birth_date} onChange={set('birth_date')} /></Field>
            <Field label="Lieu de naissance"><input className="field" value={form.birth_place} onChange={set('birth_place')} /></Field>
          </div>
          <Field label="Adresse"><input className="field" value={form.address} onChange={set('address')} /></Field>
          <Field label={`Classe (${year?.name ?? 'année en cours'})`} hint={data?.classes.length ? undefined : 'Aucune classe n’existe encore : l’inscription pourra se faire plus tard.'}>
            <select className="field" value={form.class_id} onChange={set('class_id')}>
              <option value="">Ne pas inscrire maintenant</option>
              {data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {editing === 'new' && (
            <div className="grid gap-4 rounded-lg bg-papier p-4 sm:grid-cols-2">
              <Field label="Parent / tuteur"><input className="field" value={form.guardian_name} onChange={set('guardian_name')} /></Field>
              <Field label="Téléphone du parent" error={errors.guardian_phone}><input className="field" inputMode="tel" value={form.guardian_phone} onChange={set('guardian_phone')} placeholder="+243…" /></Field>
            </div>
          )}
          {formError && <Alert>{formError}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Annuler</Button>
            <Button type="submit" loading={busy}>Enregistrer</Button>
          </div>
        </form>
      </Modal>

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} title="Supprimer cet élève ?">
        <p className="text-sm text-slate-600">Vous allez supprimer <strong>{toDelete ? fullName(toDelete) : ''}</strong>, ainsi que ses inscriptions, notes et présences. Cette action est irréversible.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>Annuler</Button>
          <Button variant="danger" loading={busy} onClick={() => void remove()}>Supprimer</Button>
        </div>
      </Modal>
    </>
  )
}
