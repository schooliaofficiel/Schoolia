import { useState, type FormEvent } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Card, Field } from '../components/ui'
import { Logo } from '../components/Layout'

export default function MfaChallenge() {
  const { refreshMfa, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!/^\d{6}$/.test(code)) return setErr('Saisissez le code à 6 chiffres.')
    setBusy(true)
    try {
      const { data: f, error: fe } = await supabase.auth.mfa.listFactors()
      if (fe) throw fe
      const factor = f.totp.find((x) => x.status === 'verified')
      if (!factor) throw new Error('Aucun facteur de double authentification trouvé.')
      const ch = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (ch.error) throw ch.error
      const v = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code })
      if (v.error) throw v.error
      await refreshMfa()
    } catch (x) {
      setErr(/invalid|expired/i.test(errorMessage(x)) ? 'Code incorrect ou expiré. Réessayez.' : errorMessage(x))
    } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6"><Logo /></div>
        <Card className="p-6">
          <h1 className="text-2xl font-extrabold text-marine">Vérification en deux étapes</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">Ouvrez votre application d’authentification et saisissez le code à 6 chiffres.</p>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Code de vérification"><input className="field text-center font-mono text-xl tracking-widest" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            {err && <Alert>{err}</Alert>}
            <Button type="submit" loading={busy} className="w-full">Vérifier</Button>
          </form>
          <button onClick={() => void signOut()} className="mt-4 w-full text-center text-sm font-semibold text-slate-500 hover:text-marine">Se déconnecter</button>
        </Card>
      </div>
    </div>
  )
}
