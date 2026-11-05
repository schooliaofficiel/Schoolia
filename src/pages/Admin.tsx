import { useMemo, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Pencil, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr, money } from '../lib/format'
import { CYCLE_LABEL, PAY_METHODS, SETTING_KEYS, STATUS, type Invoice, type Plan, type SubPayment, type Subscription } from '../lib/billing'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

type Tab = 'overview' | 'schools' | 'payments' | 'invoices' | 'plans' | 'settings'
interface SchoolRow {
  school_id: string; name: string; city: string | null; created_at: string; is_suspended: boolean; students: number; users: number; director_name: string | null
  plan_name: string | null; billing_cycle: Subscription['billing_cycle']; status: Subscription['status'] | null; trial_ends_on: string | null; period_end: string | null; auto_renew: boolean | null
}
interface Stats { schools: number; active: number; trial: number; past_due: number; suspended: number; pending_payments: number; revenue_this_month: number; mrr: number; students: number }

export default function Admin() {
  const { isPlatformAdmin } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('overview')
  const [busy, setBusy] = useState(false)
  const [extend, setExtend] = useState<SchoolRow | null>(null)
  const [days, setDays] = useState('30')
  const [suspend, setSuspend] = useState<SchoolRow | null>(null)
  const [reason, setReason] = useState('')
  const [reject, setReject] = useState<SubPayment | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [record, setRecord] = useState<Invoice | null>(null)
  const [rec, setRec] = useState({ method: 'mpesa', reference: '' })
  const [plan, setPlan] = useState<Plan | 'new' | null>(null)
  const [pf, setPf] = useState({ code: '', name: '', description: '', max_students: '', price_monthly: '', price_quarterly: '', price_yearly: '', features: '', is_active: true, sort: '0' })
  const [settings, setSettings] = useState<Record<string, string> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const { data, loading, error, reload } = useLoad(async () => {
    if (!isPlatformAdmin) return null
    const [st, sc, pa, inv, pl, se] = await Promise.all([
      supabase.rpc('admin_stats'), supabase.rpc('admin_list_schools'),
      supabase.from('subscription_payments').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('invoices').select('*').order('issued_at', { ascending: false }).limit(200),
      supabase.from('plans').select('*').order('sort'), supabase.from('platform_settings').select('key,value'),
    ])
    if (st.error) throw st.error
    return {
      stats: st.data as Stats, schools: rows<SchoolRow>(sc), payments: rows<SubPayment>(pa), invoices: rows<Invoice>(inv), plans: rows<Plan>(pl),
      settings: Object.fromEntries(rows<{ key: string; value: string }>(se).map((s) => [s.key, s.value])) as Record<string, string>,
    }
  }, [isPlatformAdmin])

  const schoolName = useMemo(() => new Map((data?.schools ?? []).map((s) => [s.school_id, s.name])), [data])
  const planName = (id: string | null) => data?.plans.find((p) => p.id === id)?.name ?? '—'

  if (!isPlatformAdmin) return <Alert>Accès réservé à l’administrateur de la plateforme.</Alert>
  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!data) return null

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string, after?: () => void) {
    setBusy(true); setErr(null)
    const { error: e } = await fn()
    setBusy(false)
    if (e) { setErr(errorMessage(e)); toast('error', errorMessage(e)); return false }
    toast('success', ok); after?.(); reload(); return true
  }

  const pending = data.payments.filter((p) => p.status === 'pending')
  const invOf = (id: string) => data.invoices.find((i) => i.id === id)
  const list = data.schools.filter((s) => `${s.name} ${s.city ?? ''} ${s.director_name ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))

  function openPlan(p: Plan | 'new') {
    setErr(null)
    setPf(p === 'new' ? { code: '', name: '', description: '', max_students: '', price_monthly: '', price_quarterly: '', price_yearly: '', features: '', is_active: true, sort: '0' }
      : { code: p.code, name: p.name, description: p.description ?? '', max_students: p.max_students ? String(p.max_students) : '', price_monthly: String(p.price_monthly), price_quarterly: String(p.price_quarterly), price_yearly: String(p.price_yearly), features: p.features.join('\n'), is_active: p.is_active, sort: String(p.sort) })
    setPlan(p)
  }
  async function savePlan(e: FormEvent) {
    e.preventDefault()
    const nums = [pf.price_monthly, pf.price_quarterly, pf.price_yearly].map(Number)
    if (pf.name.trim().length < 2) return setErr('Nom de l’offre obligatoire.')
    if (nums.some((n) => Number.isNaN(n) || n < 0) || [pf.price_monthly, pf.price_quarterly, pf.price_yearly].some((x) => x === '')) return setErr('Saisissez les trois prix.')
    if (plan === 'new' && !/^[a-z0-9-]{2,30}$/.test(pf.code)) return setErr('Code : lettres minuscules, chiffres et tirets (2 à 30).')
    const payload = { name: pf.name.trim(), description: pf.description.trim() || null, max_students: pf.max_students ? Number(pf.max_students) : null, price_monthly: nums[0], price_quarterly: nums[1], price_yearly: nums[2], features: pf.features.split('\n').map((x) => x.trim()).filter(Boolean), is_active: pf.is_active, sort: Number(pf.sort) || 0 }
    await run(() => plan === 'new' ? supabase.from('plans').insert({ ...payload, code: pf.code }) : supabase.from('plans').update(payload).eq('id', (plan as Plan).id), 'Offre enregistrée.', () => setPlan(null))
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Aperçu' }, { id: 'schools', label: `Écoles (${data.schools.length})` }, { id: 'payments', label: `Paiements à valider${pending.length ? ` (${pending.length})` : ''}` },
    { id: 'invoices', label: 'Factures' }, { id: 'plans', label: 'Offres' }, { id: 'settings', label: 'Coordonnées de paiement' },
  ]

  return (
    <>
      <PageHeader title="Administration de la plateforme" subtitle="Vue d’ensemble des écoles, abonnements et paiements. Aucune donnée d’élèves n’est consultable ici." />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-marine-100" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={clsx('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold', tab === t.id ? 'border-ciel text-marine' : 'border-transparent text-slate-500 hover:text-marine')}>{t.label}</button>)}
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { l: 'Écoles inscrites', v: String(data.stats.schools), n: `${data.stats.students} élèves au total` },
              { l: 'Abonnements actifs', v: String(data.stats.active), n: `${data.stats.trial} en essai` },
              { l: 'Revenu mensuel récurrent', v: money(data.stats.mrr), n: 'Abonnements actifs, ramené au mois' },
              { l: 'Encaissé ce mois', v: money(data.stats.revenue_this_month), n: 'Factures payées' },
              { l: 'Paiements à valider', v: String(data.stats.pending_payments), n: 'À traiter' },
              { l: 'Expirés (délai de grâce)', v: String(data.stats.past_due), n: '7 jours avant suspension' },
              { l: 'Écoles suspendues', v: String(data.stats.suspended), n: 'Accès bloqué' },
            ].map((k) => <Card key={k.l} className="p-4"><p className="text-sm text-slate-500">{k.l}</p><p className="font-display text-2xl font-extrabold text-marine">{k.v}</p><p className="text-xs text-slate-400">{k.n}</p></Card>)}
          </div>
          <Card className="mt-4 p-4">
            <h2 className="font-display text-base font-bold text-marine">Cycle de facturation automatique</h2>
            <p className="mt-1 text-sm text-slate-600">Il s’exécute chaque jour à 5 h (UTC) : factures de renouvellement des écoles qui l’ont choisi, rappels à 7 et 1 jour, passage en « expiré », puis suspension après 7 jours de grâce.</p>
            <div className="mt-3"><Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); const { data: r, error: e } = await supabase.rpc('run_billing_cycle'); setBusy(false); if (e) return toast('error', errorMessage(e)); toast('success', `Cycle exécuté : ${JSON.stringify(r)}`); reload() }}>Exécuter maintenant</Button></div>
          </Card>
        </>
      )}

      {tab === 'schools' && (
        <Card>
          <div className="border-b border-marine-100 p-4"><input className="field" placeholder="Rechercher une école, une ville, un directeur" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher" /></div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">École</th><th className="th">Directeur</th><th className="th text-right">Élèves</th><th className="th">Offre</th><th className="th">Statut</th><th className="th">Échéance</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-marine-100">
              {list.map((s) => (
                <tr key={s.school_id}>
                  <td className="td"><span className="font-semibold">{s.name}</span><span className="block text-xs text-slate-400">{s.city ?? '—'} · inscrite le {dateFr(s.created_at)}</span></td>
                  <td className="td text-sm">{s.director_name ?? '—'}<span className="block text-xs text-slate-400">{s.users} utilisateur(s)</span></td>
                  <td className="td text-right">{s.students}</td>
                  <td className="td text-sm">{s.plan_name ?? '—'}{s.billing_cycle && <span className="block text-xs text-slate-400">{CYCLE_LABEL[s.billing_cycle]}{s.auto_renew ? ' · auto' : ''}</span>}</td>
                  <td className="td">{s.is_suspended ? <Badge tone="bad">Suspendue</Badge> : s.status ? <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge> : '—'}</td>
                  <td className="td text-sm">{dateFr(s.status === 'trial' ? s.trial_ends_on : s.period_end)}</td>
                  <td className="td text-right whitespace-nowrap">
                    <Button variant="ghost" className="px-2 py-1.5" onClick={() => { setErr(null); setDays('30'); setExtend(s) }}>Prolonger</Button>
                    {s.is_suspended ? <Button variant="ghost" className="px-2 py-1.5" onClick={() => void run(() => supabase.rpc('admin_set_suspended', { p_school: s.school_id, p_suspended: false }), 'École réactivée.')}>Réactiver</Button>
                      : <Button variant="ghost" className="px-2 py-1.5 text-marge" onClick={() => { setReason(''); setSuspend(s) }}>Suspendre</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {list.length === 0 && <EmptyState title="Aucune école" />}
        </Card>
      )}

      {tab === 'payments' && (
        <div className="space-y-4">
          <Card>
            <h2 className="px-4 pt-4 text-base font-bold text-marine">En attente de validation</h2>
            {pending.length === 0 ? <EmptyState title="Aucun paiement à valider" /> : (
              <ul className="divide-y divide-marine-100 p-2">
                {pending.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
                    <div className="text-sm"><p className="font-semibold">{schoolName.get(p.school_id) ?? 'École'} · {money(p.amount)}</p>
                      <p className="text-xs text-slate-500">{PAY_METHODS[p.method]} · réf. <span className="font-mono">{p.reference}</span>{p.payer_phone ? ` · ${p.payer_phone}` : ''} · facture {invOf(p.invoice_id)?.number} · {dateFr(p.created_at)}</p></div>
                    <div className="flex gap-2"><Button variant="secondary" className="px-3 py-1.5" onClick={() => { setRejectReason(''); setReject(p) }}>Refuser</Button><Button className="px-3 py-1.5" loading={busy} onClick={() => void run(() => supabase.rpc('admin_confirm_payment', { p_payment: p.id }), 'Paiement confirmé, abonnement activé.')}>Confirmer</Button></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="px-4 pt-4 text-base font-bold text-marine">Historique</h2>
            <ul className="divide-y divide-marine-100 p-2">
              {data.payments.filter((p) => p.status !== 'pending').slice(0, 50).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm"><span>{schoolName.get(p.school_id) ?? 'École'} · {PAY_METHODS[p.method]} · <span className="font-mono text-xs">{p.reference}</span></span><span className="flex items-center gap-2">{money(p.amount)}<Badge tone={p.status === 'confirmed' ? 'ok' : 'bad'}>{p.status === 'confirmed' ? 'Confirmé' : 'Refusé'}</Badge></span></li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'invoices' && (
        <Card>
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">N°</th><th className="th">École</th><th className="th">Offre</th><th className="th">Période</th><th className="th text-right">Montant</th><th className="th">Statut</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-marine-100">
              {data.invoices.map((i) => (
                <tr key={i.id}><td className="td font-mono text-xs">{i.number}</td><td className="td text-sm">{schoolName.get(i.school_id) ?? '—'}</td><td className="td text-sm">{planName(i.plan_id)} · {CYCLE_LABEL[i.cycle]}</td><td className="td text-xs">{dateFr(i.period_start)} → {dateFr(i.period_end)}</td><td className="td text-right font-bold">{money(i.amount)}</td>
                  <td className="td"><Badge tone={i.status === 'paid' ? 'ok' : i.status === 'pending' ? 'warn' : 'neutral'}>{i.status === 'paid' ? 'Payée' : i.status === 'pending' ? 'En attente' : 'Annulée'}</Badge></td>
                  <td className="td text-right">{i.status === 'pending' && <Button variant="secondary" className="px-3 py-1.5" onClick={() => { setRec({ method: 'mpesa', reference: '' }); setErr(null); setRecord(i) }}>Enregistrer un paiement</Button>}</td></tr>
              ))}
            </tbody>
          </table></div>
          {data.invoices.length === 0 && <EmptyState title="Aucune facture" />}
        </Card>
      )}

      {tab === 'plans' && (
        <>
          <div className="mb-4"><Button onClick={() => openPlan('new')}><Plus className="h-4 w-4" aria-hidden /> Nouvelle offre</Button></div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.plans.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between"><div><p className="font-display text-lg font-extrabold text-marine">{p.name}</p><p className="text-xs text-slate-500">{p.max_students ? `≤ ${p.max_students} élèves` : 'Illimité'} · {p.code}</p></div><button onClick={() => openPlan(p)} aria-label={`Modifier ${p.name}`} className="rounded-lg p-2 text-marine hover:bg-marine-50"><Pencil className="h-4 w-4" /></button></div>
                <p className="mt-2 text-sm">{money(p.price_monthly)} / mois · {money(p.price_quarterly)} / trimestre · {money(p.price_yearly)} / an</p>
                {!p.is_active && <p className="mt-2"><Badge tone="warn">Masquée aux écoles</Badge></p>}
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'settings' && (() => {
        const s = settings ?? data.settings
        return (
          <Card className="p-5">
            <p className="mb-4 text-sm text-slate-600">Ces coordonnées sont affichées aux écoles au moment de payer. Renseignez uniquement les moyens que vous utilisez réellement.</p>
            <div className="space-y-4">
              {SETTING_KEYS.map((k) => <Field key={k.key} label={k.label} hint={k.hint}>{k.key === 'pay_instructions' || k.key === 'pay_bank' || k.key === 'ai_guide' ? <textarea className={k.key === 'ai_guide' ? 'field min-h-80 font-mono text-xs' : 'field min-h-20'} value={s[k.key] ?? ''} onChange={(e) => setSettings({ ...s, [k.key]: e.target.value })} /> : <input className="field" value={s[k.key] ?? ''} onChange={(e) => setSettings({ ...s, [k.key]: e.target.value })} />}</Field>)}
            </div>
            <div className="mt-5"><Button loading={busy} onClick={() => void run(() => supabase.from('platform_settings').upsert(SETTING_KEYS.map((k) => ({ key: k.key, value: (settings ?? data.settings)[k.key] ?? '' }))), 'Coordonnées enregistrées.', () => setSettings(null))}>Enregistrer</Button></div>
          </Card>
        )
      })()}

      <Modal open={extend !== null} onClose={() => setExtend(null)} title={`Prolonger — ${extend?.name ?? ''}`}>
        <Field label="Nombre de jours offerts" hint="Prolonge l’essai ou l’abonnement en cours et réactive l’école si elle était suspendue."><input className="field" type="number" min="1" max="366" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        {err && <div className="mt-3"><Alert>{err}</Alert></div>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setExtend(null)}>Annuler</Button><Button loading={busy} onClick={() => void run(() => supabase.rpc('admin_extend', { p_school: extend!.school_id, p_days: Number(days) }), 'Abonnement prolongé.', () => setExtend(null))}>Prolonger</Button></div>
      </Modal>

      <Modal open={suspend !== null} onClose={() => setSuspend(null)} title={`Suspendre — ${suspend?.name ?? ''}`}>
        <p className="mb-3 text-sm text-slate-600">Les utilisateurs de l’école ne pourront plus accéder à leurs données ; le directeur verra seulement la page d’abonnement. Rien n’est supprimé.</p>
        <Field label="Motif (affiché dans le journal)"><input className="field" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setSuspend(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={() => void run(() => supabase.rpc('admin_set_suspended', { p_school: suspend!.school_id, p_suspended: true, p_reason: reason }), 'École suspendue.', () => setSuspend(null))}>Suspendre</Button></div>
      </Modal>

      <Modal open={reject !== null} onClose={() => setReject(null)} title="Refuser le paiement">
        <Field label="Motif communiqué au directeur"><input className="field" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Transaction introuvable, montant incorrect…" /></Field>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setReject(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={() => void run(() => supabase.rpc('admin_reject_payment', { p_payment: reject!.id, p_reason: rejectReason }), 'Paiement refusé.', () => setReject(null))}>Refuser</Button></div>
      </Modal>

      <Modal open={record !== null} onClose={() => setRecord(null)} title="Enregistrer un paiement reçu">
        <p className="mb-3 text-sm text-slate-600">Facture {record?.number} · {record ? money(record.amount) : ''} — {record ? schoolName.get(record.school_id) : ''}</p>
        <div className="space-y-4">
          <Field label="Moyen"><select className="field" value={rec.method} onChange={(e) => setRec({ ...rec, method: e.target.value })}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Référence de la transaction"><input className="field font-mono" value={rec.reference} onChange={(e) => setRec({ ...rec, reference: e.target.value })} /></Field>
        </div>
        {err && <div className="mt-3"><Alert>{err}</Alert></div>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setRecord(null)}>Annuler</Button><Button loading={busy} onClick={() => rec.reference.trim().length < 4 ? setErr('Référence trop courte.') : void run(() => supabase.rpc('admin_record_payment', { p_invoice: record!.id, p_method: rec.method, p_reference: rec.reference }), 'Paiement enregistré, abonnement activé.', () => setRecord(null))}>Enregistrer et activer</Button></div>
      </Modal>

      <Modal open={plan !== null} onClose={() => setPlan(null)} title={plan === 'new' ? 'Nouvelle offre' : 'Modifier l’offre'} wide>
        <form onSubmit={savePlan} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom"><input className="field" value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} /></Field>
            {plan === 'new' && <Field label="Code" hint="Minuscules, ex : premium-plus"><input className="field" value={pf.code} onChange={(e) => setPf({ ...pf, code: e.target.value })} /></Field>}
            <Field label="Élèves maximum" hint="Vide = illimité"><input className="field" type="number" min="1" value={pf.max_students} onChange={(e) => setPf({ ...pf, max_students: e.target.value })} /></Field>
            <Field label="Ordre d’affichage"><input className="field" type="number" value={pf.sort} onChange={(e) => setPf({ ...pf, sort: e.target.value })} /></Field>
            <Field label="Prix mensuel (USD)"><input className="field" type="number" min="0" step="0.01" value={pf.price_monthly} onChange={(e) => setPf({ ...pf, price_monthly: e.target.value })} /></Field>
            <Field label="Prix trimestriel (USD)"><input className="field" type="number" min="0" step="0.01" value={pf.price_quarterly} onChange={(e) => setPf({ ...pf, price_quarterly: e.target.value })} /></Field>
            <Field label="Prix annuel (USD)"><input className="field" type="number" min="0" step="0.01" value={pf.price_yearly} onChange={(e) => setPf({ ...pf, price_yearly: e.target.value })} /></Field>
          </div>
          <Field label="Description"><input className="field" value={pf.description} onChange={(e) => setPf({ ...pf, description: e.target.value })} /></Field>
          <Field label="Avantages (un par ligne)"><textarea className="field min-h-24" value={pf.features} onChange={(e) => setPf({ ...pf, features: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={pf.is_active} onChange={(e) => setPf({ ...pf, is_active: e.target.checked })} /> Offre visible par les écoles</label>
          {err && <Alert>{err}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setPlan(null)}>Annuler</Button><Button type="submit" loading={busy}>Enregistrer</Button></div>
        </form>
      </Modal>
    </>
  )
}
