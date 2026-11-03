import { CheckCheck } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, useLoad } from '../components/ui'

interface Notif { id: string; title: string; body: string | null; kind: string; read_at: string | null; created_at: string }
const KIND: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'bad' | 'info' }> = {
  absence: { label: 'Absence', tone: 'bad' }, result: { label: 'Résultat', tone: 'ok' }, payment: { label: 'Paiement', tone: 'warn' },
  announcement: { label: 'Annonce', tone: 'info' }, info: { label: 'Information', tone: 'neutral' },
}

export default function Notifications() {
  const { profile } = useAuth()
  const { data, loading, error, reload } = useLoad(async () =>
    rows<Notif>(await supabase.from('notifications').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false }).limit(100)), [profile?.id])

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    reload()
  }
  async function markAll() {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', profile!.id).is('read_at', null)
    reload()
  }
  const unread = data?.filter((n) => !n.read_at).length ?? 0

  return (
    <>
      <PageHeader title="Notifications" subtitle={unread ? `${unread} non lue(s)` : 'Tout est lu'} actions={unread ? <Button variant="secondary" onClick={() => void markAll()}><CheckCheck className="h-4 w-4" aria-hidden /> Tout marquer comme lu</Button> : undefined} />
      <Card>
        {loading ? <Spinner /> : error ? <div className="p-4"><Alert>{error}</Alert></div> : !data?.length ? <EmptyState title="Aucune notification" text="Les absences, résultats et annonces de l’école apparaîtront ici." /> : (
          <ul className="divide-y divide-marine-100">
            {data.map((n) => {
              const k = KIND[n.kind] ?? KIND.info
              return (
                <li key={n.id} className={clsx('flex items-start justify-between gap-3 px-4 py-3', !n.read_at && 'bg-ciel-50/50')}>
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-marine">{n.title}<Badge tone={k.tone}>{k.label}</Badge></p>
                    {n.body && <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                  {!n.read_at && <button onClick={() => void markRead(n.id)} className="shrink-0 text-xs font-semibold text-ciel-700 underline">Marquer lu</button>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
