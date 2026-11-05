/* SCHOOLIA — service worker
   Objectif : installation sur l'écran d'accueil, démarrage rapide, page de secours hors connexion.
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
