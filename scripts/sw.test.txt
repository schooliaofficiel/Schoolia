import fs from 'node:fs'
import vm from 'node:vm'

const store = new Map() // nom du cache -> Map(url -> Response)
const caches = {
  async open(n) { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n); return { match: async (r) => m.get(typeof r === 'string' ? 'https://app.test' + r : r.url)?.clone(), put: async (r, res) => { m.set(typeof r === 'string' ? 'https://app.test' + r : r.url, res) }, addAll: async (l) => { for (const u of l) m.set('https://app.test' + u, new Response('x')) } } },
  async match(r) { for (const m of store.values()) { const h = m.get(typeof r === 'string' ? 'https://app.test' + r : r.url); if (h) return h.clone() } },
  async keys() { return [...store.keys()] }, async delete(k) { store.delete(k) },
}
let online = true
const netLog = []
const fakeFetch = async (req) => { netLog.push(req.url); if (!online) throw new Error('offline'); return new Response(req.url.includes('index') || req.mode === 'navigate' ? '<html></html>' : 'data', { status: 200, headers: { 'content-type': req.mode === 'navigate' ? 'text/html' : 'application/javascript' } }) }
const handlers = {}
const sandbox = { self: { location: new URL('https://app.test/'), addEventListener: (t, h) => { handlers[t] = h }, clients: { claim: async () => {} }, skipWaiting: () => {} }, caches, fetch: fakeFetch, Response, URL, Promise, Request }
vm.createContext(sandbox)
vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), sandbox)

const call = async (url, opts = {}) => {
  let responded = null
  const request = { url, method: opts.method ?? 'GET', mode: opts.mode ?? 'cors' }
  handlers.fetch({ request, respondWith: (p) => { responded = p } })
  return responded ? await responded : 'IGNORÉ'
}
const ok = (c, n) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) process.exitCode = 1 }

await handlers.install({ waitUntil: (p) => p })
await new Promise((r) => setTimeout(r)); // laisse le préchargement se terminer
ok(store.get('schoolia-v1-static')?.has('https://app.test/offline.html'), 'préchargement de la page hors ligne')

ok((await call('https://bgbwlxxbvypanjagggvl.supabase.co/rest/v1/students')) === 'IGNORÉ', 'API Supabase : jamais interceptée ni mise en cache')
ok((await call('https://bgbwlxxbvypanjagggvl.supabase.co/functions/v1/schoolia-ai', { method: 'POST' })) === 'IGNORÉ', 'POST : jamais intercepté')
ok((await call('https://app.test/api/anything', { method: 'POST' })) === 'IGNORÉ', 'POST same-origin ignoré')

let r = await call('https://app.test/assets/index-abc.js')
ok(r.status === 200, 'fichier de l’application : réponse réseau')
online = false
r = await call('https://app.test/assets/index-abc.js')
ok(r.status === 200, 'fichier de l’application servi hors connexion (cache)')

online = true
await call('https://app.test/eleves', { mode: 'navigate' })
online = false
r = await call('https://app.test/finances', { mode: 'navigate' })
ok(r.status === 200 && (await r.text()).includes('<html>'), 'navigation hors connexion : interface en cache')
store.get('schoolia-v1-static').delete('https://app.test/')
r = await call('https://app.test/finances', { mode: 'navigate' })
ok(r.status === 200, 'navigation hors connexion sans cache : page « hors connexion »')

const keysBefore = [...store.keys()]
ok(![...store.values()].some((m) => [...m.keys()].some((k) => k.includes('supabase'))), 'aucune URL Supabase dans les caches')
store.set('ancien-cache', new Map())
await handlers.activate({ waitUntil: (p) => p })
await new Promise((r) => setTimeout(r))
ok(!store.has('ancien-cache') && store.has('schoolia-v1-static'), 'activation : anciens caches supprimés, caches actuels conservés')
