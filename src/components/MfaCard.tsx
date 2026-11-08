import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Badge, Button, Card, Field, useToast } from './ui'

interface Factor { id: string; status: string }

// Double authentification (TOTP) : application d'authentification (Google Authenticator, Microsoft Authenticator, Authy…)
export default function MfaCard() {
  const toast = useToast()
  const { profile } = useAuth()
  const [factors, setFactors] = useState<Factor[]>([])
  const [enroll, setEnroll] = useState<null | { id: string; qr: string; secret: string }>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.all ?? []).filter((f) => f.factor_type === 'totp').map((f) => ({ id: f.id, status: f.status })))
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const verified = factors.find((f) => f.status === 'verified')

  async function start() {
    setErr(null); setBusy(true)
    try {
      // retire d'abord les activations inachevées
      for (const f of factors.filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `SCHOOLIA ${new Date().toISOString().slice(0, 10)}` })
      if (error) throw error
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      setCode('')
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!enroll) return
    setErr(null)
    if (!/^\d{6}$/.test(code)) return setErr('Saisissez le code à 6 chiffres affiché par l’application.')
    setBusy(true)
    try {
      const ch = await supabase.auth.mfa.challenge({ factorId: enroll.id })
      if (ch.error) throw ch.error
      const v = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: ch.data.id, code })
      if (v.error) throw v.error
      toast('success', 'Double authentification activée.')
      setEnroll(null); await load()
    } catch (e) { setErr(/invalid|expired/i.test(errorMessage(e)) ? 'Code incorrect ou expiré. Réessayez.' : errorMessage(e)) } finally { setBusy(false) }
  }

  async function disable() {
    if (!verified) return
    setBusy(true); setErr(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id })
    setBusy(false)
    if (error) return setErr(errorMessage(error))
    toast('success', 'Double authentification désactivée.')
    await load()
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-marine"><ShieldCheck className="h-5 w-5 text-feuille" aria-hidden /> Double authentification</h2>
      {loading ? <p className="text-sm text-slate-500">Chargement…</p> : verified ? (
        <>
          <p className="mb-3 text-sm text-slate-600"><Badge tone="ok">Activée</Badge> Un code à usage unique est demandé à chaque connexion.</p>
          <Button variant="secondary" loading={busy} onClick={() => void disable()}>Désactiver</Button>
        </>
      ) : enroll ? (
        <form onSubmit={confirm} className="space-y-3" noValidate>
          <p className="text-sm text-slate-600">1. Ouvrez votre application d’authentification et scannez ce code.</p>
          <img src={enroll.qr} alt="Code QR à scanner avec votre application d’authentification" className="h-44 w-44 rounded-lg border border-marine-100 bg-white p-2" />
          <p className="text-xs text-slate-500">Impossible de scanner ? Saisissez cette clé : <span className="break-all font-mono">{enroll.secret}</span></p>
          <Field label="2. Saisissez le code à 6 chiffres"><input className="field w-40 text-center font-mono text-lg tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
          {err && <Alert>{err}</Alert>}
          <div className="flex gap-2"><Button type="submit" loading={busy}>Activer</Button><Button type="button" variant="secondary" onClick={() => setEnroll(null)}>Annuler</Button></div>
        </form>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">Protégez votre compte avec un code temporaire généré par une application sur votre téléphone. {profile?.role === 'director' ? 'Recommandée pour le directeur, qui gère les paiements et les accès.' : ''}</p>
          {err && <div className="mb-3"><Alert>{err}</Alert></div>}
          <Button variant="secondary" loading={busy} onClick={() => void start()}>Activer la double authentification</Button>
        </>
      )}
    </Card>
  )
}
