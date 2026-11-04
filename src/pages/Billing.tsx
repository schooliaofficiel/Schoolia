import { useMemo, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { CheckCircle2, CreditCard } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr, money } from '../lib/format'
import { CYCLES, CYCLE_LABEL, CYCLE_MONTHS, PAY_METHODS, STATUS, daysUntil, priceOf, savingsPct, type Cycle, type Invoice, type Plan, type SubPayment, type Subscription } from '../lib/billing'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'

export default function Billing({ suspendedMode = false }: { suspendedMode?: boolean }) {
  const toast = useToast()
  const [mode, setMode] = useState<null | 'choose' | 'change'>(null)
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [chosen, setChosen] = useState<Plan | null>(null)
  const [autoRenew, setAutoRenew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [pay, setPay] = useState({ method: 'mpesa', reference: '', phone: '' })

  const { data, loading, error, reload } = useLoad(async () => {
    const [sub, pl, inv, pp, st, stu] = await Promise.all([
      supabase.from('subscriptions').select('*').maybeSingle(),
      supabase.from('plans').select('*').eq('is_active', true).order('sort'),
      supabase.from('invoices').select('*').order('issued_at', { ascending: false }).limit(50),
      supabase.from('subscription_payments').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('platform_settings').select('key,value'),
      supabase.from('students').select('id', { count: 'exact', head: true }),
    ])
    return {
      sub: (sub.data as Subscription | null), plans: rows<Plan>(pl), invoices: rows<Invoice>(inv), payments: rows<SubPayment>(pp),
      settings: Object.fromEntries(rows<{ key: string; value: string }>(st).map((s) => [s.key, s.value])) as Record<string, string>,
      students: stu.count ?? 0,
    }
  }, [])

  const planOf = (id: string | null) => data?.plans.find((p) => p.id === id)
  const sub = data?.sub
  const isLive = sub?.status === 'active' && (daysUntil(sub.current_period_end) ?? -1) >= 0
  const configured = useMemo(() => Object.entries(data?.settings ?? {}).filter(([k, v]) => k.startsWith('pay_') && k !== 'pay_instructions' && v.trim()), [data])

  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!data) return null

  const plan = planOf(sub?.plan_id ?? null)
  const days = sub?.status === 'trial' ? daysUntil(sub.trial_ends_on) : daysUntil(sub?.current_period_end ?? null)

  function openChooser(m: 'choose' | 'change') {
    setErr(null); setChosen(null); setAutoRenew(sub?.auto_renew ?? false); setCycle((m === 'change' ? sub?.pending_cycle ?? sub?.billing_cycle : sub?.billing_cycle) ?? 'monthly'); setMode(m)
  }

  async function confirmChoice() {
    if (!chosen) return
    setBusy(true); setErr(null)
    if (mode === 'change') {
      const { error: e } = await supabase.rpc('change_next_plan', { p_plan: chosen.id, p_cycle: cycle })
      setBusy(false)
      if (e) return setErr(errorMessage(e))
      toast('success', 'Choix enregistré pour la prochaine période.')
      setMode(null); reload(); return
    }
    const { data: invId, error: e } = await supabase.rpc('request_subscription', { p_plan: chosen.id, p_cycle: cycle, p_auto_renew: autoRenew })
    setBusy(false)
    if (e) return setErr(errorMessage(e))
    toast('success', 'Facture créée : procédez au paiement.')
    setMode(null)
    const inv = rows<Invoice>(await supabase.from('invoices').select('*').eq('id', invId as string)).at(0)
    reload()
    if (inv) { setPay({ method: 'mpesa', reference: '', phone: '' }); setErr(null); setPayFor(inv) }
  }

  async function toggleAuto(v: boolean) {
    const { error: e } = await supabase.rpc('set_auto_renew', { p_enabled: v })
    if (e) return toast('error', errorMessage(e))
    toast('success', v ? 'Renouvellement automatique activé.' : 'Renouvellement automatique désactivé.')
    reload()
  }

  async function declare(e: FormEvent) {
    e.preventDefault()
    if (!payFor) return
    setErr(null)
    if (pay.reference.trim().length < 4) return setErr('Saisissez l’identifiant de la transaction reçu par SMS (au moins 4 caractères).')
    setBusy(true)
    const { error: er } = await supabase.rpc('declare_payment', { p_invoice: payFor.id, p_method: pay.method, p_reference: pay.reference.trim(), p_phone: pay.phone.trim() || null })
    setBusy(false)
    if (er) return setErr(errorMessage(er))
    toast('success', 'Paiement déclaré : validation par l’équipe SCHOOLIA sous 24 h.')
    setPayFor(null); reload()
  }

  const pendingOf = (inv: Invoice) => data.payments.find((p) => p.invoice_id === inv.id && p.status === 'pending')
  const rejectedOf = (inv: Invoice) => data.payments.find((p) => p.invoice_id === inv.id && p.status === 'rejected')

  return (
    <>
      <PageHeader title="Abonnement" subtitle="Offre, échéances, factures et paiements de votre école" />
      {suspendedMode && <div className="mb-4"><Alert>L’accès à SCHOOLIA est suspendu : l’abonnement est impayé. Réglez la facture ci-dessous ; l’accès est rétabli dès validation du paiement.</Alert></div>}

      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Offre actuelle</p>
            <p className="font-display text-2xl font-extrabold text-marine">{plan ? `${plan.name} · ${sub?.billing_cycle ? CYCLE_LABEL[sub.billing_cycle] : ''}` : 'Aucune offre choisie'}</p>
            {sub && <p className="mt-1"><Badge tone={STATUS[sub.status].tone}>{STATUS[sub.status].label}</Badge>
              {days !== null && sub.status !== 'suspended' && <span className="ml-2 text-sm text-slate-600">{days >= 0 ? `${days} jour(s) restant(s) · jusqu’au ${dateFr(sub.status === 'trial' ? sub.trial_ends_on : sub.current_period_end)}` : `échu depuis ${-days} jour(s)`}</span>}</p>}
          </div>
          <div className="flex gap-2">
            {isLive ? <Button variant="secondary" onClick={() => openChooser('change')}>Modifier pour la prochaine période</Button> : <Button onClick={() => openChooser('choose')}><CreditCard className="h-4 w-4" aria-hidden /> Choisir une offre</Button>}
          </div>
        </div>

        {plan?.max_students && <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>Élèves enregistrés</span><span>{data.students} / {plan.max_students}</span></div><div className="h-2 overflow-hidden rounded-full bg-marine-50"><div className={clsx('h-full rounded-full', data.students > plan.max_students ? 'bg-marge' : 'bg-ciel')} style={{ width: `${Math.min(100, (data.students / plan.max_students) * 100)}%` }} /></div>{data.students > plan.max_students && <p className="mt-1 text-xs font-semibold text-marge-700">Vous dépassez la limite de votre offre : passez à une offre supérieure à la prochaine période.</p>}</div>}

        {sub?.pending_plan_id && <p className="mt-3 text-sm text-slate-600">Prochaine période : <strong>{planOf(sub.pending_plan_id)?.name}</strong> · {sub.pending_cycle ? CYCLE_LABEL[sub.pending_cycle] : ''}</p>}

        {sub && sub.plan_id && (
          <label className="mt-4 flex items-start gap-3 rounded-lg bg-papier p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sub.auto_renew} onChange={(e) => void toggleAuto(e.target.checked)} />
            <span><strong>Renouvellement automatique (facultatif)</strong><span className="block text-slate-600">7 jours avant l’échéance, la facture de la période suivante est créée et vous êtes notifié. Vous confirmez ensuite le paiement par Mobile Money : aucun prélèvement n’est fait à votre insu. Décochez à tout moment pour ne plus renouveler.</span></span>
          </label>
        )}
      </Card>

      <h2 className="mb-3 text-xl font-extrabold text-marine">Factures</h2>
      <Card>
        {data.invoices.length === 0 ? <EmptyState title="Aucune facture" text="Choisissez une offre pour recevoir votre première facture." /> : (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">N°</th><th className="th">Période</th><th className="th">Offre</th><th className="th text-right">Montant</th><th className="th">Statut</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-marine-100">
              {data.invoices.filter((i) => i.status !== 'cancelled').map((i) => {
                const p = pendingOf(i), r = rejectedOf(i)
                return (
                  <tr key={i.id}>
                    <td className="td font-mono text-xs">{i.number}</td>
                    <td className="td text-sm">{dateFr(i.period_start)} → {dateFr(i.period_end)}</td>
                    <td className="td text-sm">{planOf(i.plan_id)?.name} · {CYCLE_LABEL[i.cycle]}</td>
                    <td className="td text-right font-bold">{money(i.amount, i.currency)}</td>
                    <td className="td">{i.status === 'paid' ? <Badge tone="ok">Payée {dateFr(i.paid_at)}</Badge> : p ? <Badge tone="warn">Vérification en cours</Badge> : <Badge tone="bad">À payer avant le {dateFr(i.due_date)}</Badge>}{r && !p && i.status === 'pending' && <span className="mt-1 block text-xs text-marge-700">Paiement refusé{r.reject_reason ? ` : ${r.reject_reason}` : ''}</span>}</td>
                    <td className="td text-right">{i.status === 'pending' && !p && <Button className="px-3 py-1.5" onClick={() => { setPay({ method: configured[0]?.[0].replace('pay_', '') ?? 'mpesa', reference: '', phone: '' }); setErr(null); setPayFor(i) }}>Payer</Button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      {/* Choix d'offre */}
      <Modal open={mode !== null} onClose={() => setMode(null)} title={mode === 'change' ? 'Offre de la prochaine période' : 'Choisir une offre'} wide>
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-papier p-1" role="tablist" aria-label="Durée de l’abonnement">
          {CYCLES.map((c) => <button key={c} role="tab" aria-selected={cycle === c} onClick={() => setCycle(c)} className={clsx('rounded-md px-2 py-2 text-sm font-semibold', cycle === c ? 'bg-white text-marine shadow-sm' : 'text-slate-500')}>{CYCLE_LABEL[c]}</button>)}
        </div>
        <div className="space-y-3">
          {data.plans.map((p) => {
            const tooSmall = p.max_students !== null && data.students > p.max_students
            return (
              <button key={p.id} disabled={tooSmall} onClick={() => setChosen(p)} aria-pressed={chosen?.id === p.id}
                className={clsx('w-full rounded-xl border-2 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', chosen?.id === p.id ? 'border-ciel bg-ciel-50' : 'border-marine-100 hover:border-marine-200')}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-display text-lg font-extrabold text-marine">{p.name}</p><p className="text-xs text-slate-500">{p.max_students ? `Jusqu’à ${p.max_students} élèves` : 'Élèves illimités'}{tooSmall ? ' · trop petite pour votre effectif' : ''}</p></div>
                  <div className="text-right"><p className="font-display text-xl font-extrabold text-marine">{money(priceOf(p, cycle))}</p><p className="text-xs text-slate-500">{cycle === 'monthly' ? 'par mois' : `pour ${CYCLE_MONTHS[cycle]} mois`}{savingsPct(p, cycle) > 0 && <span className="ml-1 font-semibold text-feuille-700">−{savingsPct(p, cycle)} %</span>}</p></div>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">{p.features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-feuille" aria-hidden />{f}</li>)}</ul>
              </button>
            )
          })}
        </div>
        {mode === 'choose' && <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} /><span>Activer le <strong>renouvellement automatique</strong> (facture créée 7 jours avant l’échéance ; vous gardez la main sur le paiement).</span></label>}
        <p className="mt-3 text-xs text-slate-500">{mode === 'change' ? 'Ce choix s’appliquera au prochain renouvellement. La période en cours n’est pas modifiée.' : 'Vous pourrez modifier l’offre et la durée à chaque nouvelle période.'}</p>
        {err && <div className="mt-3"><Alert>{err}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setMode(null)}>Annuler</Button><Button disabled={!chosen} loading={busy} onClick={() => void confirmChoice()}>{mode === 'change' ? 'Enregistrer' : 'Continuer vers le paiement'}</Button></div>
      </Modal>

      {/* Paiement */}
      <Modal open={payFor !== null} onClose={() => setPayFor(null)} title="Payer la facture" wide>
        {payFor && (
          <form onSubmit={declare} className="space-y-4" noValidate>
            <div className="rounded-lg bg-papier p-4 text-sm"><p>Facture <strong className="font-mono">{payFor.number}</strong></p><p className="font-display text-2xl font-extrabold text-marine">{money(payFor.amount, payFor.currency)}</p></div>
            <div>
              <p className="mb-2 text-sm font-semibold text-marine">1. Envoyez le montant à l’un de ces comptes</p>
              {configured.length === 0 ? <Alert tone="info">Les coordonnées de paiement ne sont pas encore renseignées. Contactez l’équipe SCHOOLIA.</Alert> : (
                <ul className="space-y-2">{configured.map(([k, v]) => <li key={k} className="rounded-lg border border-marine-100 p-3 text-sm"><span className="font-semibold">{PAY_METHODS[k.replace('pay_', '')]}</span><span className="block whitespace-pre-wrap text-slate-700">{v}</span></li>)}</ul>
              )}
              {data.settings.pay_instructions && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{data.settings.pay_instructions}</p>}
              <p className="mt-2 text-xs text-slate-500">Mentionnez le numéro de facture <span className="font-mono">{payFor.number}</span> en motif si possible.</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-marine">2. Indiquez la transaction effectuée</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Moyen utilisé"><select className="field" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{['mpesa', 'airtel_money', 'orange_money', 'afrimoney', 'bank'].map((m) => <option key={m} value={m}>{PAY_METHODS[m]}</option>)}</select></Field>
                <Field label="Identifiant de la transaction" hint="Reçu par SMS après le transfert"><input className="field font-mono" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
                <Field label="Numéro payeur (facultatif)"><input className="field" inputMode="tel" value={pay.phone} onChange={(e) => setPay({ ...pay, phone: e.target.value })} placeholder="+243…" /></Field>
              </div>
            </div>
            {err && <Alert>{err}</Alert>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setPayFor(null)}>Plus tard</Button><Button type="submit" loading={busy}>J’ai payé : déclarer</Button></div>
          </form>
        )}
      </Modal>
    </>
  )
}
