/* SCHOOLIA — service worker
   Objectif : installation sur l'écran d'accueil, démarrage rapide, page de secours hors connexion, notifications push.
   Sécurité : seuls les fichiers statiques de l'application sont mis en cache. Les données (Supabase, API, authentification)
   ne passent JAMAIS par ce cache : elles sont toujours demandées au réseau. */
const VERSION = 'schoolia-v1'
const STATIC = `${VERSION}-static`
const FONTS = `${VERSION}-fonts`
const PRECACHE = ['/offline.html', '/icon-192.png', '/icon-512.png', '/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key)
    await self.clients.claim()
  })())
})

// L'application propose « Actualiser » : la nouvelle version s'active seulement à la demande de l'utilisateur
self.addEventListener('message', (event) => { if (event.data === 'SKIP_WAITING') self.skipWaiting() })

/* ---------- Notifications push ---------- */
// Réception d'un push : le serveur envoie { id, title, body, kind, url }. Aucune donnée sensible n'est mise en cache.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const title = typeof data.title === 'string' && data.title ? data.title : 'SCHOOLIA'
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: typeof data.id === 'string' ? data.id : 'schoolia',
    data: { url: typeof data.url === 'string' ? data.url : '/notifications' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Toucher la notification : ouvre (ou ramène au premier plan) SCHOOLIA sur la bonne page. Seuls les chemins internes sont acceptés.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = event.notification.data && event.notification.data.url
  const path = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/notifications'
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.focus()
        if ('navigate' in client) { try { await client.navigate(target) } catch { /* ignore */ } }
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})

async function cacheFirst(name, request) {
  const cache = await caches.open(name)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone())
  return res
}

async function staleWhileRevalidate(name, request) {
  const cache = await caches.open(name)
  const hit = await cache.match(request)
  const refresh = fetch(request).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res }).catch(() => null)
  return hit || (await refresh) || Response.error()
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Polices Google : mises en cache pour un affichage correct hors connexion
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(FONTS, request))
    return
  }
  // Tout ce qui n'est pas sur notre domaine (Supabase, fonctions serveur…) : réseau uniquement, jamais en cache
  if (url.origin !== self.location.origin) return
  if (url.pathname === '/sw.js') return

  // Navigation : réseau d'abord ; sinon l'interface déjà vue ; sinon la page « hors connexion »
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request)
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
          const cache = await caches.open(STATIC)
          cache.put('/', res.clone())
        }
        return res
      } catch {
        return (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error()
      }
    })())
    return
  }

  // Fichiers de l'application (JS/CSS empreintés) : cache d'abord
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(STATIC, request).catch(() => Response.error()))
    return
  }
  // Icônes, manifeste : on sert le cache et on actualise en arrière-plan
  event.respondWith(staleWhileRevalidate(STATIC, request))
})
