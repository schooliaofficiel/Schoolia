import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { errorMessage, supabase } from '../lib/supabase'
import { ROLE_LABELS } from '../lib/types'
import { Alert, Button, Card, Field, Modal, PageHeader, useToast } from '../components/ui'
import MfaCard from '../components/MfaCard'
import { InstallCard } from '../components/pwa'
import PushCard from '../components/PushCard'

export default function SettingsPage() {
  const { school, profile, year, can, refresh } = useAuth()
  const toast = useToast()
  const isDirector = can('director')
  const [form, setForm] = useState({ name: '', city: '', address: '', phone: '', email: '', currency: 'USD' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSeed, setConfirmSeed] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [pwd, setPwd] = useState({ a: '', b: '' })
  const [pwdBusy, setPwdBusy] = useState(false)
  const [pwdError, setPwdError] = useState<string | null>(null)

  useEffect(() => {
    if (school) setForm({ name: school.name, city: school.city ?? '', address: school.address ?? '', phone: school.phone ?? '', email: school.email ?? '', currency: school.currency })
  }, [school])

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.name.trim().length < 2) return setError('Le nom de l’école est obligatoire.')
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return setError('Adresse e-mail invalide.')
    setBusy(true)
    const { error: err } = await supabase.from('schools').update({
      name: form.name.trim(), city: form.city.trim() || null, address: form.address.trim() || null,
      phone: form.phone.trim() || null, email: form.email.trim() || null, currency: form.currency,
    }).eq('id', school!.id)
    setBusy(false)
    if (err) return setError(errorMessage(err))
    toast('success', 'Informations enregistrées.')
    await refresh()
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    setPwdError(null)
    if (pwd.a.length < 8) return setPwdError('Le mot de passe doit contenir au moins 8 caractères.')
    if (pwd.a !== pwd.b) return setPwdError('Les deux mots de passe ne correspondent pas.')
    setPwdBusy(true)
    const { error: err } = await supabase.auth.updateUser({ password: pwd.a })
    setPwdBusy(false)
    if (err) return setPwdError(errorMessage(err))
    setPwd({ a: '', b: '' })
    toast('success', 'Mot de passe modifié.')
  }

  async function seed() {
    setSeeding(true); setSeedError(null)
    const { error: err } = await supabase.rpc('seed_demo_data')
    setSeeding(false)
    if (err) return setSeedError(errorMessage(err))
    setConfirmSeed(false)
    toast('success', 'Données de démonstration chargées.')
  }

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Informations de l’établissement et du compte" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold text-marine">Établissement</h2>
          <form onSubmit={save} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom de l’école"><input className="field" disabled={!isDirector} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Ville"><input className="field" disabled={!isDirector} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="Adresse"><input className="field" disabled={!isDirector} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              <Field label="Téléphone"><input className="field" disabled={!isDirector} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="E-mail"><input className="field" disabled={!isDirector} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Devise">
                <select className="field" disabled={!isDirector} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option value="USD">USD ($)</option><option value="CDF">CDF (FC)</option><option value="EUR">EUR (€)</option></select>
              </Field>
            </div>
            {error && <Alert>{error}</Alert>}
            {isDirector ? <Button type="submit" loading={busy}>Enregistrer</Button> : <p className="text-sm text-slate-500">Seul le directeur peut modifier ces informations.</p>}
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-marine">Mon compte</h2>
            <p className="font-semibold">{profile?.full_name}</p>
            <p className="mb-2 text-sm text-slate-500">{profile && ROLE_LABELS[profile.role]}</p>
            <p className="text-sm text-slate-600">Année scolaire : <strong>{year?.name ?? '—'}</strong></p>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-bold text-marine">Mot de passe</h2>
            <form onSubmit={changePassword} className="space-y-3" noValidate>
              <Field label="Nouveau mot de passe"><input className="field" type="password" autoComplete="new-password" value={pwd.a} onChange={(e) => setPwd({ ...pwd, a: e.target.value })} /></Field>
              <Field label="Confirmer"><input className="field" type="password" autoComplete="new-password" value={pwd.b} onChange={(e) => setPwd({ ...pwd, b: e.target.value })} /></Field>
              {pwdError && <Alert>{pwdError}</Alert>}
              <Button type="submit" variant="secondary" loading={pwdBusy}>Changer le mot de passe</Button>
            </form>
          </Card>
          <InstallCard />
          <PushCard />
          <MfaCard />
          {isDirector && (
            <Card className="p-5">
              <h2 className="mb-1 text-lg font-bold text-marine">Données de démonstration</h2>
              <p className="mb-3 text-sm text-slate-500">Ajoute des élèves, classes, notes, présences et paiements fictifs pour explorer SCHOOLIA. Disponible uniquement pour une école vide.</p>
              <Button variant="secondary" onClick={() => { setSeedError(null); setConfirmSeed(true) }}>Charger la démonstration</Button>
            </Card>
          )}
        </div>
      </div>

      <Modal open={confirmSeed} onClose={() => setConfirmSeed(false)} title="Charger la démonstration ?">
        <p className="text-sm text-slate-600">Des données fictives (30 élèves, 3 classes, notes, présences, paiements) seront ajoutées à votre école. Utilisez cette option uniquement sur une école de test.</p>
        {seedError && <div className="mt-3"><Alert>{seedError}</Alert></div>}
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirmSeed(false)}>Annuler</Button><Button loading={seeding} onClick={() => void seed()}>Charger</Button></div>
      </Modal>
    </>
  )
}
