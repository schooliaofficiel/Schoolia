import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { supabase, errorMessage } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { disablePush, enablePush, getCurrentSubscription, pushAvailable } from '../lib/push'
import { Alert, Badge, Button, Card, useToast } from './ui'
import { useInstall } from './pwa'

interface Prefs { push_enabled: boolean; absence: boolean; announcement: boolean; payment: boolean }
const DEFAULT_PREFS: Prefs = { push_enabled: true, absence: true, announcement: true, payment: true }

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 text-sm text-slate-700">
      <span>{label}</span>
      <input type="checkbox" className="h-5 w-5 accent-marine" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

// Notifications push : alertes sur le téléphone (absences, annonces, paiements), réglables par personne
export default function PushCard() {
  const toast = useToast()
  const { profile, school } = useAuth()
  const { installed, isIOS } = useInstall()
  const available = pushAvailable()
  const [loading, setLoading] = useState(true)
  const [subscribed, setSubscribed] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const role = profile?.role
  const showAbsence = role === 'parent' || role === 'student'
  const showPayment = role === 'parent'
  const blocked = available && typeof Notification !== 'undefined' && Notification.permission === 'denied'

  const load = useCallback(async () => {
    if (!profile) return
    const [sub, res] = await Promise.all([
      available ? getCurrentSubscription().catch(() => null) : Promise.resolve(null),
      supabase.from('notification_preferences').select('push_enabled, absence, announcement, payment').eq('user_id', profile.id).maybeSingle(),
    ])
    setSubscribed(!!sub)
    if (res.data) setPrefs({ ...DEFAULT_PREFS, ...(res.data as Partial<Prefs>) })
    setLoading(false)
  }, [profile, available])
  useEffect(() => { void load() }, [load])

  async function enable() {
    setBusy(true); setErr(null)
    try {
      await enablePush()
      setSubscribed(true)
      toast('success', 'Notifications activées sur cet appareil.')
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true); setErr(null)
    try {
      await disablePush()
      setSubscribed(false)
      toast('success', 'Notifications désactivées sur cet appareil.')
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  async function savePrefs(next: Prefs) {
    if (!profile || !school) return
    setPrefs(next); setErr(null)
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: profile.id, school_id: school.id, ...next, updated_at: new Date().toISOString(),
    })
    if (error) { setErr(errorMessage(error)); await load() }
  }

  async function sendTest() {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('send_test_notification')
    setBusy(false)
    if (error) return setErr(errorMessage(error))
    toast('success', 'Notification de test envoyée : elle arrive dans quelques secondes.')
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-marine"><Bell className="h-5 w-5 text-ciel" aria-hidden /> Notifications</h2>
      {loading ? <p className="text-sm text-slate-500">Chargement…</p>
        : !available ? (
          <p className="text-sm text-slate-600">{isIOS && !installed
            ? 'Sur iPhone, installez d’abord SCHOOLIA sur l’écran d’accueil (carte « Application mobile »), puis ouvrez-le depuis l’icône pour activer les notifications.'
            : 'Les notifications ne sont pas disponibles sur ce navigateur. Utilisez Chrome sur Android ou installez SCHOOLIA sur votre écran d’accueil.'}</p>
        ) : subscribed ? (
          <div>
            <p className="mb-2 text-sm text-slate-600"><Badge tone="ok">Activées</Badge> Vous recevez les alertes de SCHOOLIA sur cet appareil.</p>
            <div className="mb-3 divide-y divide-marine-100">
              <Toggle label="Recevoir les notifications" checked={prefs.push_enabled} onChange={(v) => void savePrefs({ ...prefs, push_enabled: v })} />
              {prefs.push_enabled && (<>
                {showAbsence && <Toggle label="Absences" checked={prefs.absence} onChange={(v) => void savePrefs({ ...prefs, absence: v })} />}
                <Toggle label="Annonces de l’école" checked={prefs.announcement} onChange={(v) => void savePrefs({ ...prefs, announcement: v })} />
                {showPayment && <Toggle label="Paiements" checked={prefs.payment} onChange={(v) => void savePrefs({ ...prefs, payment: v })} />}
              </>)}
            </div>
            {err && <div className="mb-3"><Alert>{err}</Alert></div>}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={busy} onClick={() => void sendTest()}>Envoyer un test</Button>
              <Button variant="secondary" loading={busy} onClick={() => void disable()}>Désactiver sur cet appareil</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-slate-600">Recevez sur ce téléphone les alertes importantes de l’école : absences, annonces et paiements.</p>
            {blocked && <div className="mb-3"><Alert>Les notifications sont bloquées pour SCHOOLIA dans votre navigateur. Autorisez-les dans les réglages du site, puis réessayez.</Alert></div>}
            {err && <div className="mb-3"><Alert>{err}</Alert></div>}
            <Button variant="secondary" loading={busy} onClick={() => void enable()}>Activer les notifications</Button>
          </div>
        )}
    </Card>
  )
}
