import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner } from '../components/ui'

interface Log { id: number; user_id: string | null; action: 'INSERT' | 'UPDATE' | 'DELETE'; table_name: string; record_id: string | null; old_data: any; new_data: any; created_at: string }

const TABLES: Record<string, string> = {
  students: 'Élèves', enrollments: 'Inscriptions', guardians: 'Parents', classes: 'Classes', fee_schedules: 'Frais scolaires',
  payments: 'Paiements', expenses: 'Dépenses', other_income: 'Autres recettes', grades: 'Notes', profiles: 'Utilisateurs', announcements: 'Annonces',
}
const ACTIONS: Record<Log['action'], { label: string; tone: 'ok' | 'info' | 'bad' }> = { INSERT: { label: 'Création', tone: 'ok' }, UPDATE: { label: 'Modification', tone: 'info' }, DELETE: { label: 'Suppression', tone: 'bad' } }
const FIELDS: Record<string, string> = {
  amount: 'Montant', status: 'Statut', score: 'Note', name: 'Nom', role: 'Rôle', is_active: 'Actif', first_name: 'Prénom', last_name: 'Nom', middle_name: 'Postnom',
  full_name: 'Nom complet', class_id: 'Classe', receipt_number: 'N° de reçu', method: 'Mode', category: 'Catégorie', title: 'Titre', phone: 'Téléphone',
  birth_date: 'Naissance', due_date: 'Échéance', description: 'Description', matricule: 'Matricule', note: 'Note', reference: 'Référence', audience: 'Public',
}
const HIDDEN = new Set(['id', 'school_id', 'created_at', 'updated_at', 'recorded_by', 'author_id'])
const PAGE = 40

function label(t: string) { return TABLES[t] ?? t }
function mainText(l: Log): string {
  const d = l.new_data ?? l.old_data ?? {}
  switch (l.table_name) {
    case 'students': return [d.last_name?.toUpperCase(), d.first_name].filter(Boolean).join(' ')
    case 'guardians': case 'profiles': return d.full_name ?? ''
    case 'classes': case 'fee_schedules': return d.name ?? ''
    case 'payments': return `${d.receipt_number ?? ''} · ${d.amount ?? ''}`
    case 'expenses': return `${d.category ?? ''} · ${d.amount ?? ''}`
    case 'other_income': return `${d.source ?? ''} · ${d.amount ?? ''}`
    case 'grades': return `note ${d.score ?? ''}`
    case 'announcements': return d.title ?? ''
    default: return ''
  }
}
function changes(l: Log): { key: string; from: unknown; to: unknown }[] {
  if (l.action !== 'UPDATE') return []
  const o = l.old_data ?? {}, n = l.new_data ?? {}
  return Object.keys(n).filter((k) => !HIDDEN.has(k) && JSON.stringify(o[k]) !== JSON.stringify(n[k])).map((k) => ({ key: k, from: o[k], to: n[k] }))
}
const show = (v: unknown) => v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v)

export default function Audit() {
  const { can } = useAuth()
  const [items, setItems] = useState<Log[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [table, setTable] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<Log | null>(null)

  const load = useCallback(async (offset: number) => {
    setLoading(true); setError(null)
    try {
      let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).range(offset, offset + PAGE - 1)
      if (table) q = q.eq('table_name', table)
      if (action) q = q.eq('action', action)
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', `${to}T23:59:59`)
      const r = rows<Log>(await q)
      setItems((prev) => (offset === 0 ? r : [...prev, ...r]))
      setMore(r.length === PAGE)
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [table, action, from, to])

  useEffect(() => { void load(0) }, [load])
  useEffect(() => {
    void (async () => {
      const p = rows<{ id: string; full_name: string }>(await supabase.from('profiles').select('id,full_name'))
      setNames(Object.fromEntries(p.map((x) => [x.id, x.full_name])))
    })()
  }, [])

  if (!can('director')) return <Alert>Réservé au directeur.</Alert>

  return (
    <>
      <PageHeader title="Journal d’audit" subtitle="Historique des opérations sensibles : qui a fait quoi, et quand" />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Sujet"><select className="field" value={table} onChange={(e) => setTable(e.target.value)}><option value="">Tous</option>{Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Opération"><select className="field" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Toutes</option>{(Object.keys(ACTIONS) as Log['action'][]).map((k) => <option key={k} value={k}>{ACTIONS[k].label}</option>)}</select></Field>
          <Field label="Du"><input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Au"><input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>

      <Card>
        {error ? <div className="p-4"><Alert>{error}</Alert></div> : items.length === 0 && loading ? <Spinner /> : items.length === 0 ? <EmptyState title="Aucune opération trouvée" text="Modifiez les filtres ou revenez plus tard." /> : (
          <>
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Date</th><th className="th">Utilisateur</th><th className="th">Opération</th><th className="th">Sujet</th><th className="th">Détail</th></tr></thead>
              <tbody className="divide-y divide-marine-100">
                {items.map((l) => {
                  const ch = changes(l)
                  return (
                    <tr key={l.id} className="cursor-pointer hover:bg-papier/60" onClick={() => setDetail(l)}>
                      <td className="td whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="td">{l.user_id ? names[l.user_id] ?? 'Utilisateur' : 'Système'}</td>
                      <td className="td"><Badge tone={ACTIONS[l.action].tone}>{ACTIONS[l.action].label}</Badge></td>
                      <td className="td font-semibold">{label(l.table_name)}</td>
                      <td className="td text-sm text-slate-600">{mainText(l)}{ch.length > 0 && <span className="block text-xs text-slate-400">{ch.slice(0, 2).map((c) => `${FIELDS[c.key] ?? c.key} : ${show(c.from)} → ${show(c.to)}`).join(' · ')}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
            <div className={clsx('flex justify-center p-3', !more && 'hidden')}><Button variant="secondary" loading={loading} onClick={() => void load(items.length)}>Charger plus</Button></div>
          </>
        )}
      </Card>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Détail de l’opération" wide>
        {detail && (
          <>
            <p className="mb-3 text-sm text-slate-600">{ACTIONS[detail.action].label} · {label(detail.table_name)} · {new Date(detail.created_at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} · par {detail.user_id ? names[detail.user_id] ?? 'Utilisateur' : 'Système'}</p>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr><th className="th">Champ</th>{detail.action !== 'INSERT' && <th className="th">Avant</th>}{detail.action !== 'DELETE' && <th className="th">Après</th>}</tr></thead>
              <tbody className="divide-y divide-marine-100">
                {Object.keys(detail.new_data ?? detail.old_data ?? {}).filter((k) => !HIDDEN.has(k)).filter((k) => detail.action !== 'UPDATE' || JSON.stringify(detail.old_data?.[k]) !== JSON.stringify(detail.new_data?.[k])).map((k) => (
                  <tr key={k}><td className="td font-semibold">{FIELDS[k] ?? k}</td>{detail.action !== 'INSERT' && <td className="td">{show(detail.old_data?.[k])}</td>}{detail.action !== 'DELETE' && <td className="td">{show(detail.new_data?.[k])}</td>}</tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}
      </Modal>
    </>
  )
}
