import { supabase } from './supabase'

// Clé publique VAPID (publique par nature) : la clé privée reste uniquement côté serveur.
export const VAPID_PUBLIC_KEY = 'BGFNWOTz9p6V6c81DQK32jAZ1dSXXJTzx_FN1MleusAuqfvE5U2cdXSUdR3jmO991lBuEsfaDNedVfKkfzIzRlM'

/** Les notifications push sont possibles (navigateur compatible, application en production). */
export function pushAvailable(): boolean {
  return typeof window !== 'undefined'
    && import.meta.env.PROD
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Service worker prêt, ou null s'il ne l'est pas après quelques secondes. */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ])
}

/** Abonnement de cet appareil, s'il existe. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** Demande l'autorisation, abonne cet appareil et l'enregistre pour la personne connectée. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Les notifications sont bloquées pour SCHOOLIA. Autorisez-les dans les réglages du navigateur, puis réessayez.'
      : 'Autorisation non accordée.')
  }
  const reg = await getRegistration()
  if (!reg) throw new Error('Le service de notifications n’est pas prêt. Rechargez la page, puis réessayez.')
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!json.endpoint || !p256dh || !auth) throw new Error('Abonnement incomplet. Réessayez.')
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw error
}

/** Désactive les notifications sur cet appareil. */
export async function disablePush(): Promise<void> {
  const sub = await getCurrentSubscription()
  if (!sub) return
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  if (error) throw error
  await sub.unsubscribe()
}
