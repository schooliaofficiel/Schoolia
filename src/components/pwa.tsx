import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share, WifiOff, X } from 'lucide-react'
import { Alert, Badge, Button, Card } from './ui'

/* ---------- Installation (événement capturé dès le chargement du module) ---------- */
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: InstallEvent | null = null
let installedFlag = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)

if (typeof window !== 'undefined') {
  installedFlag = standalone()
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; emit() })
  window.addEventListener('appinstalled', () => { installedFlag = true; deferred = null; emit() })
}

export function useInstall() {
  const snapshot = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => `${deferred ? 1 : 0}${installedFlag ? 1 : 0}`,
  )
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return {
    canPrompt: snapshot[0] === '1',
    installed: snapshot[1] === '1',
    isIOS,
    install: async () => {
      if (!deferred) return
      const d = deferred
      await d.prompt()
      await d.userChoice
      deferred = null
      emit()
    },
  }
}

const DISMISS_KEY = 'schoolia_install_dismissed'

/** Bandeau discret (mobile uniquement) proposant d'installer l'application. */
export function InstallBanner() {
  const { canPrompt, installed, isIOS, install } = useInstall()
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } })
  if (installed || hidden || !(canPrompt || isIOS)) return null
  const close = () => { setHidden(true); try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ } }
  return (
    <div className="no-print mb-5 flex items-start gap-3 rounded-lg border border-ciel/30 bg-ciel-50 p-3 text-sm text-ciel-700 lg:hidden">
      <Download className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">Installez SCHOOLIA sur votre téléphone</p>
        {canPrompt ? <button onClick={() => void install()} className="mt-1 font-bold underline">Installer l’application</button>
          : <p className="mt-0.5">Touchez <Share className="inline h-4 w-4" aria-label="Partager" />, puis « Sur l’écran d’accueil ».</p>}
      </div>
      <button onClick={close} aria-label="Masquer" className="rounded p-1 hover:bg-ciel-100"><X className="h-4 w-4" /></button>
    </div>
  )
}

/** Carte détaillée dans les Paramètres. */
export function InstallCard() {
  const { canPrompt, installed, isIOS, install } = useInstall()
  return (
    <Card className="p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-marine"><Download className="h-5 w-5 text-ciel" aria-hidden /> Application mobile</h2>
      {installed ? <p className="text-sm text-slate-600"><Badge tone="ok">Installée</Badge> SCHOOLIA s’ouvre depuis votre écran d’accueil, comme une application.</p>
        : canPrompt ? (<><p className="mb-3 text-sm text-slate-600">Ajoutez SCHOOLIA à votre écran d’accueil : ouverture en un geste, plein écran, sans barre de navigateur.</p><Button variant="secondary" onClick={() => void install()}>Installer SCHOOLIA</Button></>)
        : isIOS ? (<ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700"><li>Ouvrez SCHOOLIA dans <strong>Safari</strong>.</li><li>Touchez le bouton <strong>Partager</strong> (carré avec une flèche).</li><li>Choisissez <strong>« Sur l’écran d’accueil »</strong>, puis <strong>Ajouter</strong>.</li></ol>)
        : <p className="text-sm text-slate-600">Dans le menu de votre navigateur (⋮), choisissez <strong>« Installer l’application »</strong> ou <strong>« Ajouter à l’écran d’accueil »</strong>. Sur Android, utilisez Chrome.</p>}
    </Card>
  )
}

/* ---------- Connexion ---------- */
export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export function OnlineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" className="no-print mb-5 flex items-center gap-2 rounded-lg bg-crayon-50 px-4 py-3 text-sm font-semibold text-crayon-700">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden /> Vous êtes hors connexion : les données ne peuvent pas être enregistrées ni actualisées.
    </div>
  )
}

/* ---------- Service worker + mise à jour ---------- */
export function PwaUpdateBanner() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
    const hadController = !!navigator.serviceWorker.controller
    let reloading = false
    const onChange = () => { if (!hadController || reloading) return; reloading = true; window.location.reload() }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    let timer: ReturnType<typeof setInterval> | undefined
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      const check = () => { if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting) }
      check()
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => { if (w.state === 'installed') check() })
      })
      timer = setInterval(() => { reg.update().catch(() => undefined) }, 60 * 60 * 1000)
    }).catch(() => undefined)
    return () => { navigator.serviceWorker.removeEventListener('controllerchange', onChange); if (timer) clearInterval(timer) }
  }, [])

  if (!waiting) return null
  return (
    <div className="no-print fixed inset-x-0 bottom-4 z-[70] mx-auto w-[92%] max-w-md">
      <Alert tone="info">
        <div className="flex items-center justify-between gap-3">
          <span>Une nouvelle version de SCHOOLIA est disponible.</span>
          <Button className="px-3 py-1.5" onClick={() => waiting.postMessage('SKIP_WAITING')}>Actualiser</Button>
        </div>
      </Alert>
    </div>
  )
}
