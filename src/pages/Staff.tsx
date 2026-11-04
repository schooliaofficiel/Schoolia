import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr } from '../lib/format'
import { Alert, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

interface Member { id: string; full_name: string; position: string; responsibilities: string | null; phone: string | null; email: string | null; hired_at: string | null }
const POSITIONS = ['Préfet des études', 'Directeur de discipline', 'Économe', 'Secrétaire', 'Caissier', 'Bibliothécaire', 'Surveillant', 'Concierge', 'Gardien', 'Infirmier', 'Autre']
const EMPTY = { full_name: '', position: '', responsibilities: '', phone: '', email: '', hired_at: '' }

export default function Staff() {
  const { can } = useAuth()
  const toast = useToast()
  const canWrite = can('director')
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Member | null>(null)
  const { data, loading, error, reload } = useLoad(async () => rows<Member>(await supabase.from('staff').select('*').order('full_name')), [])

  function openNew() { setF(EMPTY); setErr(null); setEditing('new') }
  function openEdit(m: Member) { setF({ full_name: m.full_name, position: m.position, responsibilities: m.responsibilities ?? '', phone: m.phone ?? '', email: m.email ?? '', hired_at: m.hired_at ?? '' }); setErr(null); setEditing(m) }

  async function save(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (f.full_name.trim().length < 2) return setErr('Indiquez le nom complet.')
    if (!f.position.trim()) return setErr('Indiquez la fonction.')
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Adresse e-mail invalide.')
    if (f.hired_at && new Date(f.hired_at) > new Date()) return setErr('La date d’embauche ne peut pas être dans le futur.')
    setBusy(true)
    const payload = { full_name: f.full_name.trim(), position: f.position.trim(), responsibilities: f.responsibilities.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null, hired_at: f.hired_at || null }
    const r = editing === 'new' ? await supabase.from('staff').insert(payload) : await supabase.from('staff').update(payload).eq('id', (editing as Member).id)
    setBusy(false)
    if (r.error) return setErr(errorMessage(r.error))
    toast('success', 'Enregistré.')
    setEditing(null); reload()
  }

  async function remove() {
    if (!toDelete) return
    setBusy(true)
    const { error: er } = await supabase.from('staff').delete().eq('id', toDelete.id)
    setBusy(false)
    if (er) return toast('error', errorMessage(er))
    toast('success', 'Supprimé.')
    setToDelete(null); reload()
  }

  return (
    <>
      <PageHeader title="Personnel" subtitle="Équipe administrative et responsabilités (les enseignants se gèrent dans « Classes et cours »)" actions={canWrite ? <Button onClick={openNew}><Plus className="h-4 w-4" aria-hidden /> Nouveau membre</Button> : undefined} />
      {loading ? <Spinner /> : error ? <Alert>{error}</Alert> : !data?.length ? <Card><EmptyState title="Aucun membre du personnel" text="Ajoutez le préfet, l’économe, les surveillants… avec leurs responsabilités." action={canWrite ? <Button onClick={openNew}>Ajouter un membre</Button> : undefined} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-display text-lg font-extrabold text-marine">{m.full_name}</p><p className="text-sm font-semibold text-ciel-700">{m.position}</p></div>
                {canWrite && <span className="whitespace-nowrap"><button onClick={() => openEdit(m)} aria-label={`Modifier ${m.full_name}`} className="rounded-lg p-2 text-marine hover:bg-marine-50"><Pencil className="h-4 w-4" /></button><button onClick={() => setToDelete(m)} aria-label={`Supprimer ${m.full_name}`} className="rounded-lg p-2 text-marge hover:bg-marge-50"><Trash2 className="h-4 w-4" /></button></span>}
              </div>
              {m.responsibilities && <p className="mt-2 text-sm text-slate-700">{m.responsibilities}</p>}
              <p className="mt-3 text-xs text-slate-500">{[m.phone, m.email, m.hired_at ? `Embauché le ${dateFr(m.hired_at)}` : null].filter(Boolean).join(' · ') || 'Aucune coordonnée'}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nouveau membre du personnel' : 'Modifier le membre'} wide>
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom complet"><input className="field" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Fonction"><input className="field" list="positions" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} placeholder="Choisir ou saisir…" /><datalist id="positions">{POSITIONS.map((p) => <option key={p} value={p} />)}</datalist></Field>
            <Field label="Téléphone"><input className="field" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="E-mail"><input className="field" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Date d’embauche"><input className="field" type="date" value={f.hired_at} onChange={(e) => setF({ ...f, hired_at: e.target.value })} /></Field>
          </div>
          <Field label="Responsabilités" hint="Ex : suivi de la discipline, gestion de la caisse, inventaire du matériel…"><textarea className="field min-h-24" value={f.responsibilities} onChange={(e) => setF({ ...f, responsibilities: e.target.value })} /></Field>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Annuler</Button><Button type="submit" loading={busy}>Enregistrer</Button></div>
        </form>
      </Modal>

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} title="Supprimer ce membre ?">
        <p className="text-sm text-slate-600"><strong>{toDelete?.full_name}</strong> sera retiré de la liste du personnel.</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Supprimer</Button></div>
      </Modal>
    </>
  )
}
