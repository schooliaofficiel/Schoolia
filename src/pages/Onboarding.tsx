import { useState, type FormEvent } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Card, Field } from '../components/ui'
import { Logo } from '../components/Layout'

export default function Onboarding() {
  const { session, refresh, signOut } = useAuth()
  const [school, setSchool] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (school.trim().length < 2) return setError('Indiquez le nom de l’école.')
    if (name.trim().length < 2) return setError('Indiquez votre nom complet.')
    setBusy(true)
    const { error: err } = await supabase.rpc('register_school', {
      p_school_name: school.trim(), p_full_name: name.trim(), p_phone: phone.trim() || null, p_city: city.trim() || null, p_currency: currency,
    })
    setBusy(false)
    if (err) return setError(errorMessage(err))
    await refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6"><Logo /></div>
        <Card className="p-6">
          <h1 className="text-2xl font-extrabold text-marine">Créez votre école</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">Connecté en tant que {session?.user.email}. Vous serez le directeur de cet établissement.</p>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Nom de l’école"><input className="field" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Complexe scolaire…" /></Field>
            <Field label="Votre nom complet"><input className="field" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ville"><input className="field" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kinshasa" /></Field>
              <Field label="Devise">
                <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="USD">USD ($)</option><option value="CDF">CDF (FC)</option><option value="EUR">EUR (€)</option>
                </select>
              </Field>
            </div>
            <Field label="Téléphone"><input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+243…" /></Field>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" loading={busy} className="w-full">Créer l’école</Button>
          </form>
          <button onClick={() => void signOut()} className="mt-4 w-full text-center text-sm font-semibold text-slate-500 hover:text-marine">Se déconnecter</button>
        </Card>
      </div>
    </div>
  )
}
