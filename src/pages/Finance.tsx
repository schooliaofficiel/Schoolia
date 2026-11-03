import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Printer, Search } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { dateFr, fullName, monthKey, money, sum } from '../lib/format'
import { METHOD_LABELS, type Balance, type ClassRow, type Enrollment, type FeeSchedule, type Payment, type Student } from '../lib/types'
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, PageHeader, Spinner, useLoad, useToast } from '../components/ui'
import clsx from 'clsx'

type Tab = 'payments' | 'balances' | 'cashflow' | 'fees'
interface Expense { id: string; category: string; description: string | null; amount: number; spent_at: string }
interface Income { id: string; source: string; description: string | null; amount: number; received_at: string }

export default function Finance() {
  const { school, year, can } = useAuth()
  const toast = useToast()
  const currency = school?.currency ?? 'USD'
  const canWrite = can('director', 'accountant')
  const [tab, setTab] = useState<Tab>('payments')
  const [modal, setModal] = useState<null | 'payment' | 'cash' | 'fee'>(null)
  const [receipt, setReceipt] = useState<null | { payment: Payment; remaining: number }>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [onlyUnpaid, setOnlyUnpaid] = useState(true)
  const [q, setQ] = useState('')

  // formulaires
  const [pay, setPay] = useState({ enrollment_id: '', amount: '', method: 'cash', fee_schedule_id: '', reference: '', note: '', filter: '' })
  const [cash, setCash] = useState({ kind: 'expense', label: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10) })
  const [fee, setFee] = useState({ name: '', amount: '', class_id: '', due_date: '' })

  const { data, loading, error, reload } = useLoad(async () => {
    if (!year) return null
    const [en, st, cl, fe, pa, ba, ex, inc] = await Promise.all([
      supabase.from('enrollments').select('*').eq('academic_year_id', year.id),
      supabase.from('students').select('*'),
      supabase.from('classes').select('*').eq('academic_year_id', year.id).order('name'),
      supabase.from('fee_schedules').select('*').eq('academic_year_id', year.id).order('due_date'),
      supabase.from('payments').select('*').order('paid_at', { ascending: false }).limit(300),
      supabase.from('v_student_balances').select('*').eq('academic_year_id', year.id),
      supabase.from('expenses').select('*').order('spent_at', { ascending: false }).limit(300),
      supabase.from('other_income').select('*').order('received_at', { ascending: false }).limit(300),
    ])
    return {
      enrollments: rows<Enrollment>(en), students: rows<Student>(st), classes: rows<ClassRow>(cl), fees: rows<FeeSchedule>(fe),
      payments: rows<Payment>(pa), balances: rows<Balance>(ba), expenses: rows<Expense>(ex), income: rows<Income>(inc),
    }
  }, [year?.id])

  const studentOf = useMemo(() => new Map((data?.students ?? []).map((s) => [s.id, s])), [data])
  const classOf = useMemo(() => new Map((data?.classes ?? []).map((c) => [c.id, c])), [data])
  const enrollOf = useMemo(() => new Map((data?.enrollments ?? []).map((e) => [e.id, e])), [data])
  const balanceOf = useMemo(() => new Map((data?.balances ?? []).map((b) => [b.enrollment_id, b])), [data])
  const nameOfEnrollment = (id: string) => { const e = enrollOf.get(id); const s = e && studentOf.get(e.student_id); return s ? fullName(s) : 'Élève' }

  if (!year) return <Alert tone="info">Aucune année scolaire en cours.</Alert>
  if (loading) return <Spinner />
  if (error) return <Alert>{error}</Alert>
  if (!data) return null

  const thisMonth = monthKey(new Date())
  const monthPayments = sum(data.payments.filter((p) => monthKey(p.paid_at) === thisMonth), (p) => p.amount)
  const monthIncome = sum(data.income.filter((i) => monthKey(i.received_at) === thisMonth), (i) => i.amount)
  const monthExpenses = sum(data.expenses.filter((x) => monthKey(x.spent_at) === thisMonth), (x) => x.amount)
  const totalRemaining = sum(data.balances, (b) => b.remaining)

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'payments', label: 'Paiements', show: true },
    { id: 'balances', label: 'Soldes élèves', show: true },
    { id: 'cashflow', label: 'Dépenses et recettes', show: canWrite },
    { id: 'fees', label: 'Frais scolaires', show: true },
  ]

  /* ----- Paiement ----- */
  const candidates = data.enrollments
    .map((e) => ({ e, name: nameOfEnrollment(e.id), cls: classOf.get(e.class_id)?.name ?? '', rest: balanceOf.get(e.id)?.remaining ?? 0 }))
    .filter((c) => c.name.toLowerCase().includes(pay.filter.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const selectedBalance = pay.enrollment_id ? balanceOf.get(pay.enrollment_id) : undefined
  const applicableFees = pay.enrollment_id
    ? data.fees.filter((f) => !f.class_id || f.class_id === enrollOf.get(pay.enrollment_id)?.class_id)
    : []

  async function savePayment(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number(pay.amount)
    if (!pay.enrollment_id) return setFormError('Sélectionnez un élève.')
    if (!(amount > 0)) return setFormError('Le montant doit être supérieur à zéro.')
    setBusy(true)
    const { data: created, error: err } = await supabase.from('payments').insert({
      enrollment_id: pay.enrollment_id, amount, method: pay.method, fee_schedule_id: pay.fee_schedule_id || null,
      reference: pay.reference.trim() || null, note: pay.note.trim() || null,
    }).select('*').single()
    setBusy(false)
    if (err) return setFormError(errorMessage(err))
    toast('success', 'Paiement enregistré.')
    setReceipt({ payment: created as Payment, remaining: Math.max((selectedBalance?.remaining ?? 0) - amount, 0) })
    setModal(null)
    setPay({ enrollment_id: '', amount: '', method: 'cash', fee_schedule_id: '', reference: '', note: '', filter: '' })
    reload()
  }

  async function saveCash(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number(cash.amount)
    if (!cash.label.trim()) return setFormError(cash.kind === 'expense' ? 'Indiquez la catégorie de la dépense.' : 'Indiquez la source de la recette.')
    if (!(amount > 0)) return setFormError('Le montant doit être supérieur à zéro.')
    setBusy(true)
    const res = cash.kind === 'expense'
      ? await supabase.from('expenses').insert({ category: cash.label.trim(), description: cash.description.trim() || null, amount, spent_at: cash.date })
      : await supabase.from('other_income').insert({ source: cash.label.trim(), description: cash.description.trim() || null, amount, received_at: cash.date })
    setBusy(false)
    if (res.error) return setFormError(errorMessage(res.error))
    toast('success', cash.kind === 'expense' ? 'Dépense enregistrée.' : 'Recette enregistrée.')
    setModal(null)
    setCash({ kind: 'expense', label: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10) })
    reload()
  }

  async function saveFee(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number(fee.amount)
    if (!fee.name.trim()) return setFormError('Indiquez le nom du frais.')
    if (!(amount >= 0) || fee.amount === '') return setFormError('Indiquez un montant valide.')
    setBusy(true)
    const { error: err } = await supabase.from('fee_schedules').insert({
      academic_year_id: year!.id, name: fee.name.trim(), amount, class_id: fee.class_id || null, due_date: fee.due_date || null,
    })
    setBusy(false)
    if (err) return setFormError(errorMessage(err))
    toast('success', 'Frais ajouté.')
    setModal(null)
    setFee({ name: '', amount: '', class_id: '', due_date: '' })
    reload()
  }

  const openModal = (m: 'payment' | 'cash' | 'fee') => { setFormError(null); setModal(m) }
  const term = q.trim().toLowerCase()
  const balanceRows = data.balances
    .map((b) => ({ b, name: nameOfEnrollment(b.enrollment_id), cls: classOf.get(b.class_id)?.name ?? '' }))
    .filter((r) => (!onlyUnpaid || r.b.remaining > 0) && r.name.toLowerCase().includes(term))
    .sort((a, b) => b.b.remaining - a.b.remaining)

  return (
    <>
      <PageHeader
        title="Finances"
        subtitle={`Année ${year.name} · montants en ${currency}`}
        actions={canWrite ? <>
          <Button variant="secondary" onClick={() => openModal('fee')}>Nouveau frais</Button>
          <Button variant="secondary" onClick={() => openModal('cash')}>Dépense / recette</Button>
          <Button onClick={() => openModal('payment')}><Plus className="h-4 w-4" aria-hidden /> Encaisser</Button>
        </> : undefined}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { l: 'Frais encaissés ce mois', v: money(monthPayments, currency), c: 'text-feuille-700' },
          { l: 'Autres recettes ce mois', v: canWrite ? money(monthIncome, currency) : '—', c: 'text-ciel-700' },
          { l: 'Dépenses ce mois', v: canWrite ? money(monthExpenses, currency) : '—', c: 'text-crayon-700' },
          { l: 'Reste à percevoir', v: money(totalRemaining, currency), c: 'text-marge-700' },
        ].map((k) => (
          <Card key={k.l} className="p-4"><p className="text-sm text-slate-500">{k.l}</p><p className={clsx('font-display text-2xl font-extrabold', k.c)}>{k.v}</p></Card>
        ))}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-marine-100" role="tablist">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={clsx('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold', tab === t.id ? 'border-ciel text-marine' : 'border-transparent text-slate-500 hover:text-marine')}>{t.label}</button>
        ))}
      </div>

      {tab === 'payments' && (
        <Card>
          {data.payments.length === 0 ? <EmptyState title="Aucun paiement enregistré" text="Chaque paiement génère automatiquement un reçu numéroté." action={canWrite ? <Button onClick={() => openModal('payment')}>Encaisser un paiement</Button> : undefined} /> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Reçu</th><th className="th">Date</th><th className="th">Élève</th><th className="th">Mode</th><th className="th text-right">Montant</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-marine-100">
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="td font-mono text-xs">{p.receipt_number}</td>
                    <td className="td">{dateFr(p.paid_at)}</td>
                    <td className="td font-semibold">{nameOfEnrollment(p.enrollment_id)}</td>
                    <td className="td">{METHOD_LABELS[p.method]}</td>
                    <td className="td text-right font-bold">{money(p.amount, currency)}</td>
                    <td className="td text-right"><button className="rounded-lg p-2 text-marine hover:bg-marine-50" aria-label={`Imprimer le reçu ${p.receipt_number}`} onClick={() => setReceipt({ payment: p, remaining: balanceOf.get(p.enrollment_id)?.remaining ?? 0 })}><Printer className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'balances' && (
        <Card>
          <div className="flex flex-col gap-3 border-b border-marine-100 p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className="field pl-9" placeholder="Rechercher un élève" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un élève" />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-marine"><input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} className="h-4 w-4" /> Impayés uniquement</label>
          </div>
          {balanceRows.length === 0 ? <EmptyState title="Aucun solde à afficher" text="Aucun élève ne correspond à ces critères." /> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Élève</th><th className="th">Classe</th><th className="th text-right">Dû</th><th className="th text-right">Payé</th><th className="th text-right">Reste</th><th className="th">Statut</th></tr></thead>
              <tbody className="divide-y divide-marine-100">
                {balanceRows.map(({ b, name, cls }) => (
                  <tr key={b.enrollment_id}>
                    <td className="td font-semibold">{name}</td><td className="td">{cls}</td>
                    <td className="td text-right">{money(b.total_due, currency)}</td><td className="td text-right">{money(b.total_paid, currency)}</td>
                    <td className="td text-right font-bold">{money(b.remaining, currency)}</td>
                    <td className="td">{b.remaining <= 0 ? <Badge tone="ok">À jour</Badge> : b.total_paid > 0 ? <Badge tone="warn">Partiel</Badge> : <Badge tone="bad">Impayé</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      )}

      {tab === 'cashflow' && canWrite && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="px-4 pt-4 text-base font-bold text-marine">Dépenses</h2>
            {data.expenses.length === 0 ? <EmptyState title="Aucune dépense" /> : (
              <ul className="divide-y divide-marine-100 p-2">{data.expenses.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm"><span><span className="font-semibold">{x.category}</span><span className="block text-xs text-slate-500">{dateFr(x.spent_at)}{x.description ? ` · ${x.description}` : ''}</span></span><span className="font-bold text-crayon-700">− {money(x.amount, currency)}</span></li>
              ))}</ul>
            )}
          </Card>
          <Card>
            <h2 className="px-4 pt-4 text-base font-bold text-marine">Autres recettes</h2>
            {data.income.length === 0 ? <EmptyState title="Aucune autre recette" /> : (
              <ul className="divide-y divide-marine-100 p-2">{data.income.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm"><span><span className="font-semibold">{x.source}</span><span className="block text-xs text-slate-500">{dateFr(x.received_at)}{x.description ? ` · ${x.description}` : ''}</span></span><span className="font-bold text-feuille-700">+ {money(x.amount, currency)}</span></li>
              ))}</ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'fees' && (
        <Card>
          {data.fees.length === 0 ? <EmptyState title="Aucun frais défini" text="Définissez les frais (inscription, minerval…) pour calculer automatiquement les soldes." action={canWrite ? <Button onClick={() => openModal('fee')}>Ajouter un frais</Button> : undefined} /> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="border-b border-marine-100 bg-papier"><tr><th className="th">Frais</th><th className="th">Classe</th><th className="th">Échéance</th><th className="th text-right">Montant</th></tr></thead>
              <tbody className="divide-y divide-marine-100">{data.fees.map((f) => (
                <tr key={f.id}><td className="td font-semibold">{f.name}</td><td className="td">{f.class_id ? classOf.get(f.class_id)?.name : 'Toutes les classes'}</td><td className="td">{dateFr(f.due_date)}</td><td className="td text-right font-bold">{money(f.amount, currency)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      )}

      {/* Encaisser */}
      <Modal open={modal === 'payment'} onClose={() => setModal(null)} title="Encaisser un paiement" wide>
        <form onSubmit={savePayment} className="space-y-4" noValidate>
          <Field label="Élève">
            <input className="field mb-2" placeholder="Filtrer par nom…" value={pay.filter} onChange={(e) => setPay({ ...pay, filter: e.target.value })} aria-label="Filtrer les élèves" />
            <select className="field" value={pay.enrollment_id} onChange={(e) => setPay({ ...pay, enrollment_id: e.target.value, fee_schedule_id: '' })} size={Math.min(6, Math.max(3, candidates.length))}>
              {candidates.map((c) => <option key={c.e.id} value={c.e.id}>{c.name} — {c.cls} — reste {money(c.rest, currency)}</option>)}
            </select>
          </Field>
          {selectedBalance && <Alert tone="info">Reste à payer pour cet élève : <strong>{money(selectedBalance.remaining, currency)}</strong> sur {money(selectedBalance.total_due, currency)}.</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Montant (${currency})`}><input className="field" inputMode="decimal" type="number" min="0" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Mode de paiement">
              <select className="field" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Frais concerné (facultatif)">
              <select className="field" value={pay.fee_schedule_id} onChange={(e) => setPay({ ...pay, fee_schedule_id: e.target.value })}>
                <option value="">Paiement général</option>
                {applicableFees.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Référence (facultatif)"><input className="field" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="N° de transaction" /></Field>
          </div>
          <Field label="Note (facultatif)"><input className="field" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></Field>
          {formError && <Alert>{formError}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Annuler</Button><Button type="submit" loading={busy}>Encaisser et générer le reçu</Button></div>
        </form>
      </Modal>

      {/* Dépense / recette */}
      <Modal open={modal === 'cash'} onClose={() => setModal(null)} title="Dépense ou recette">
        <form onSubmit={saveCash} className="space-y-4" noValidate>
          <Field label="Type">
            <select className="field" value={cash.kind} onChange={(e) => setCash({ ...cash, kind: e.target.value })}><option value="expense">Dépense</option><option value="income">Autre recette</option></select>
          </Field>
          <Field label={cash.kind === 'expense' ? 'Catégorie' : 'Source'}><input className="field" value={cash.label} onChange={(e) => setCash({ ...cash, label: e.target.value })} placeholder={cash.kind === 'expense' ? 'Salaires, électricité…' : 'Location de salle…'} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Montant (${currency})`}><input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={cash.amount} onChange={(e) => setCash({ ...cash, amount: e.target.value })} /></Field>
            <Field label="Date"><input className="field" type="date" value={cash.date} onChange={(e) => setCash({ ...cash, date: e.target.value })} /></Field>
          </div>
          <Field label="Description (facultatif)"><input className="field" value={cash.description} onChange={(e) => setCash({ ...cash, description: e.target.value })} /></Field>
          {formError && <Alert>{formError}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Annuler</Button><Button type="submit" loading={busy}>Enregistrer</Button></div>
        </form>
      </Modal>

      {/* Frais */}
      <Modal open={modal === 'fee'} onClose={() => setModal(null)} title="Nouveau frais scolaire">
        <form onSubmit={saveFee} className="space-y-4" noValidate>
          <Field label="Nom du frais"><input className="field" value={fee.name} onChange={(e) => setFee({ ...fee, name: e.target.value })} placeholder="Minerval 1er trimestre" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Montant (${currency})`}><input className="field" type="number" min="0" step="0.01" inputMode="decimal" value={fee.amount} onChange={(e) => setFee({ ...fee, amount: e.target.value })} /></Field>
            <Field label="Échéance"><input className="field" type="date" value={fee.due_date} onChange={(e) => setFee({ ...fee, due_date: e.target.value })} /></Field>
          </div>
          <Field label="Classe concernée">
            <select className="field" value={fee.class_id} onChange={(e) => setFee({ ...fee, class_id: e.target.value })}><option value="">Toutes les classes</option>{data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
          {formError && <Alert>{formError}</Alert>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(null)}>Annuler</Button><Button type="submit" loading={busy}>Ajouter</Button></div>
        </form>
      </Modal>

      {/* Reçu */}
      <Modal open={receipt !== null} onClose={() => setReceipt(null)} title="Reçu de paiement">
        {receipt && (
          <>
            <div className="print-area rounded-lg border border-marine-100 p-5">
              <div className="flex items-start justify-between border-b border-dashed border-marine-200 pb-3">
                <div><p className="font-display text-xl font-extrabold text-marine">{school?.name}</p><p className="text-xs text-slate-500">{[school?.address, school?.city, school?.phone].filter(Boolean).join(' · ')}</p></div>
                <div className="text-right"><p className="text-xs text-slate-500">Reçu n°</p><p className="font-mono text-sm font-bold">{receipt.payment.receipt_number}</p></div>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Date</dt><dd>{dateFr(receipt.payment.paid_at)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Élève</dt><dd className="font-semibold">{nameOfEnrollment(receipt.payment.enrollment_id)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Classe</dt><dd>{classOf.get(enrollOf.get(receipt.payment.enrollment_id)?.class_id ?? '')?.name ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Motif</dt><dd>{data.fees.find((f) => f.id === receipt.payment.fee_schedule_id)?.name ?? 'Frais scolaires'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Mode</dt><dd>{METHOD_LABELS[receipt.payment.method]}</dd></div>
                <div className="flex justify-between border-t border-marine-100 pt-2 text-base"><dt className="font-bold">Montant reçu</dt><dd className="font-extrabold text-marine">{money(receipt.payment.amount, currency)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Reste à payer</dt><dd className="font-semibold">{money(receipt.remaining, currency)}</dd></div>
              </dl>
              <p className="mt-5 text-center text-xs text-slate-400">Reçu généré par SCHOOLIA</p>
            </div>
            <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setReceipt(null)}>Fermer</Button><Button onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden /> Imprimer</Button></div>
          </>
        )}
      </Modal>
    </>
  )
}
