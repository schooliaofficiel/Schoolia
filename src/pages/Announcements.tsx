import { useState, type FormEvent } from 'react'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr } from '../lib/format'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

interface Ann { id: string; author_id: string | null; title: string; body: string; audience: 'all' | 'staff' | 'parents' | 'students' | 'class'; class_id: string | null; created_at: string }
const AUDIENCE: Record<Ann['audience'], string> = { all: 'Toute l’école', staff: 'Personnel', parents: 'Parents', students: 'Élèves', class: 'Une classe' }

export default function Announcements() {
  const { year, can } = useAuth()
  const toast = useToast()
  const canWrite = can('director', 'secretary')
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', body: '', audience: 'all', class_id: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Ann | null>(null)

  const { data, loading, error, reload } = useLoad(async () => {
    const [an, cl, pr] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('classes').select('id,name').eq('academic_year_id', year?.id ?? '').order('name'),
      supabase.from('profiles').select('id,full_name'),
    ])
    return { items: rows<Ann>(an), classes: rows<{ id: string; name: string }>(cl), people: rows<{ id: string; full_name: string }>(pr) }
  }, [year?.id])

  async function publish(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (f.title.trim().length < 2) return setErr('Indiquez un titre.')
    if (f.body.trim().length < 2) return setErr('Écrivez le contenu de l’annonce.')
    if (f.audience === 'class' && !f.class_id) return setErr('Choisissez la classe concernée.')
    setBusy(true)
    const { data: r, error: er } = await supabase.rpc('publish_announcement', { p_title: f.title, p_body: f.body, p_audience: f.audience, p_class_id: f.audience === 'class' ? f.class_id : null })
    setBusy(false)
    if (er) return setErr(errorMessage(er))
    toast('success', `Annonce publiée · ${(r as { notified: number }).notified} personne(s) notifiée(s).`)
    setOpen(false); setF({ title: '', body: '', audience: 'all', class_id: '' }); reload()
  }

  async function remove() {
    if (!toDelete) return
    setBusy(true)
    const { error: er } = await supabase.from('announcements').delete().eq('id', toDelete.id)
    setBusy(false)
    if (er) return toast('error', errorMessage(er))
    toast('success', 'Annonce supprimée.')
    setToDelete(null); reload()
  }

  return (
    <>
      <PageHeader title="Annonces" subtitle="Communications officielles de l’école" actions={canWrite ? <Button onClick={() => { setErr(null); setOpen(true) }}><Plus className="h-4 w-4" aria-hidden /> Nouvelle annonce</Button> : undefined} />
      {loading ? <Spinner /> : error ? <Alert>{error}</Alert> : !data?.items.length ? <Card><EmptyState title="Aucune annonce" text={canWrite ? 'Publiez une annonce : les destinataires reçoivent aussi une notification.' : 'Les annonces de l’école apparaîtront ici.'} /></Card> : (
        <div className="space-y-3">
          {data.items.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold text-marine"><Megaphone className="h-4 w-4 text-crayon" aria-hidden />{a.title}<Badge tone="info">{a.audience === 'class' ? data.classes.find((c) => c.id === a.class_id)?.name ?? 'Classe' : AUDIENCE[a.audience]}</Badge></p>
                  <p className="mt-0.5 text-xs text-slate-400">{dateFr(a.created_at)}{a.author_id ? ` · ${data.people.find((p) => p.id === a.author_id)?.full_name ?? ''}` : ''}</p>
                </div>
                {canWrite && <button onClick={() => setToDelete(a)} aria-label={`Supprimer ${a.title}`} className="rounded-lg p-2 text-marge hover:bg-marge-50"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-encre">{a.body}</p>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle annonce">
        <form onSubmit={publish} className="space-y-4" noValidate>
          <Field label="Titre"><input className="field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={150} /></Field>
          <Field label="Destinataires">
            <select className="field" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          {f.audience === 'class' && <Field label="Classe" hint="Parents, élèves et enseignants de cette classe."><select className="field" value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })}><option value="">Choisir…</option>{data?.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
          <Field label="Message"><textarea className="field min-h-32" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={5000} /></Field>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" loading={busy}>Publier</Button></div>
        </form>
      </Modal>

      <Modal open={toDelete !== null} onClose={() => setToDelete(null)} title="Supprimer l’annonce ?">
        <p className="text-sm text-slate-600">« {toDelete?.title} » ne sera plus visible. Les notifications déjà envoyées restent.</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setToDelete(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Supprimer</Button></div>
      </Modal>
    </>
  )
}
