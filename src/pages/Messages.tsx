import { useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { ROLE_LABELS, type Profile } from '../lib/types'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

interface Msg { id: string; sender_id: string; recipient_id: string | null; subject: string; body: string; read_at: string | null; created_at: string }

export default function Messages() {
  const { profile, can } = useAuth()
  const toast = useToast()
  const isAdmin = can('director', 'secretary')
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [reading, setReading] = useState<Msg | null>(null)
  const [composing, setComposing] = useState(false)
  const [f, setF] = useState({ to: '', subject: '', body: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const { data, loading, error, reload } = useLoad(async () => {
    const [ms, pr] = await Promise.all([
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('id,full_name,role').order('full_name'),
    ])
    return { messages: rows<Msg>(ms), people: rows<Pick<Profile, 'id' | 'full_name' | 'role'>>(pr) }
  }, [])

  const nameOf = (id: string | null) => id === null ? 'Administration' : data?.people.find((p) => p.id === id)?.full_name ?? 'Utilisateur'
  const me = profile!.id
  const inbox = (data?.messages ?? []).filter((m) => m.sender_id !== me && (m.recipient_id === me || (m.recipient_id === null && isAdmin)))
  const sent = (data?.messages ?? []).filter((m) => m.sender_id === me)
  const list = tab === 'inbox' ? inbox : sent

  async function open(m: Msg) {
    setReading(m)
    if (tab === 'inbox' && !m.read_at) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id)
      reload()
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (f.subject.trim().length < 2) return setErr('Indiquez l’objet du message.')
    if (f.body.trim().length < 2) return setErr('Écrivez votre message.')
    setBusy(true)
    const { error: er } = await supabase.from('messages').insert({
      sender_id: me, recipient_id: isAdmin && f.to ? f.to : null, subject: f.subject.trim(), body: f.body.trim(),
    })
    setBusy(false)
    if (er) return setErr(errorMessage(er))
    toast('success', 'Message envoyé.')
    setComposing(false); setF({ to: '', subject: '', body: '' }); setTab('sent'); reload()
  }

  return (
    <>
      <PageHeader title="Messages" subtitle={isAdmin ? 'Communication avec le personnel, les parents et les élèves' : 'Communication avec l’administration de l’école'} actions={<Button onClick={() => { setErr(null); setComposing(true) }}><Plus className="h-4 w-4" aria-hidden /> Nouveau message</Button>} />
      <div className="mb-4 flex gap-1 border-b border-marine-100" role="tablist">
        {([['inbox', `Reçus${isAdmin ? '' : ''}`], ['sent', 'Envoyés']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={clsx('border-b-2 px-4 py-2.5 text-sm font-semibold', tab === id ? 'border-ciel text-marine' : 'border-transparent text-slate-500 hover:text-marine')}>{label}</button>
        ))}
      </div>
      <Card>
        {loading ? <Spinner /> : error ? <div className="p-4"><Alert>{error}</Alert></div> : list.length === 0 ? <EmptyState title={tab === 'inbox' ? 'Aucun message reçu' : 'Aucun message envoyé'} /> : (
          <ul className="divide-y divide-marine-100">
            {list.map((m) => (
              <li key={m.id}>
                <button onClick={() => void open(m)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-papier">
                  <span className="min-w-0">
                    <span className={clsx('block truncate text-sm', tab === 'inbox' && !m.read_at ? 'font-bold text-marine' : 'font-semibold')}>{m.subject}</span>
                    <span className="block truncate text-xs text-slate-500">{tab === 'inbox' ? `De ${nameOf(m.sender_id)}` : `À ${nameOf(m.recipient_id)}`} · {m.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}{tab === 'inbox' && !m.read_at && <Badge tone="info">Nouveau</Badge>}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={reading !== null} onClose={() => setReading(null)} title={reading?.subject ?? ''}>
        {reading && <>
          <p className="mb-3 text-xs text-slate-500">De {nameOf(reading.sender_id)} · à {nameOf(reading.recipient_id)} · {new Date(reading.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          <p className="whitespace-pre-wrap text-sm text-encre">{reading.body}</p>
        </>}
      </Modal>

      <Modal open={composing} onClose={() => setComposing(false)} title="Nouveau message">
        <form onSubmit={send} className="space-y-4" noValidate>
          {isAdmin ? (
            <Field label="Destinataire"><select className="field" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Administration</option>{data?.people.filter((p) => p.id !== me).map((p) => <option key={p.id} value={p.id}>{p.full_name} ({ROLE_LABELS[p.role]})</option>)}</select></Field>
          ) : <p className="text-sm text-slate-600">Ce message sera envoyé à l’<strong>administration</strong> de l’école.</p>}
          <Field label="Objet"><input className="field" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <Field label="Message"><textarea className="field min-h-32" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setComposing(false)}>Annuler</Button><Button type="submit" loading={busy}>Envoyer</Button></div>
        </form>
      </Modal>
    </>
  )
}
