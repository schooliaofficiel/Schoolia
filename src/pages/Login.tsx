import { useState, type FormEvent } from 'react'
import { supabase, errorMessage, isConfigured } from '../lib/supabase'
import { Alert, Button, Field } from '../components/ui'
import { Logo } from '../components/Layout'

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(() => {
    try { if (sessionStorage.getItem('schoolia_idle')) { sessionStorage.removeItem('schoolia_idle'); return 'Votre session a été fermée après 30 minutes d’inactivité. Reconnectez-vous.' } } catch { /* ignore */ }
    return null
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null); setInfo(null)
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Saisissez une adresse e-mail valide.')
    if (password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.')
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) throw err
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email, password })
        if (err) throw err
        if (!data.session) setInfo('Compte créé. Confirmez votre adresse e-mail grâce au lien reçu, puis connectez-vous.')
      }
    } catch (err) {
      const msg = errorMessage(err)
      setError(/invalid login credentials/i.test(msg) ? 'E-mail ou mot de passe incorrect.' : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-marine lg:block">
        <div className="ruled absolute inset-0 opacity-40" aria-hidden />
        <div className="absolute inset-y-0 left-16 w-0.5 bg-marge/70" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-14 pl-24">
          <Logo light />
          <div>
            <h2 className="font-display text-5xl font-extrabold leading-[1.05] text-white">Toute votre école,<br />sur une seule page.</h2>
            <p className="mt-5 max-w-md text-lg text-marine-200">Inscriptions, frais, notes, présences et un assistant qui répond à la direction à partir des vraies données de l’établissement.</p>
          </div>
          <p className="text-sm text-marine-200">Conçu pour les établissements de la RDC.</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-3xl font-extrabold text-marine">{mode === 'signin' ? 'Connexion' : 'Créer un compte'}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-500">
            {mode === 'signin' ? 'Accédez à l’espace de votre établissement.' : 'Vous pourrez ensuite créer votre école et en devenir le directeur.'}
          </p>

          {!isConfigured && <div className="mb-4"><Alert>Configuration manquante : renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.</Alert></div>}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Adresse e-mail">
              <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@ecole.cd" />
            </Field>
            <Field label="Mot de passe" hint={mode === 'signup' ? '8 caractères minimum.' : undefined}>
              <input className="field" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <Alert>{error}</Alert>}
            {info && <Alert tone="success">{info}</Alert>}
            <Button type="submit" loading={busy} className="w-full">{mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}</Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            {mode === 'signin' ? 'Première visite ?' : 'Déjà un compte ?'}{' '}
            <button className="font-semibold text-ciel-700 underline" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setInfo(null) }}>
              {mode === 'signin' ? 'Créer un compte' : 'Se connecter'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
