import fs from 'node:fs'
import vm from 'node:vm'

const handlers = {}
const shown = []
const opened = []
let windows = []
const sandbox = {
  self: {
    location: new URL('https://app.test/'),
    addEventListener: (t, h) => { handlers[t] = h },
    clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async (u) => { opened.push(u) } },
    registration: { showNotification: async (title, options) => { shown.push({ title, options }) } },
    skipWaiting: () => {},
  },
  caches: {}, fetch: async () => new Response('x'), Response, URL, Promise, Request,
}
vm.createContext(sandbox)
vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), sandbox)

const ok = (c, n) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) process.exitCode = 1 }
const push = (data) => handlers.push({ data: { json: () => data, text: () => String(data) }, waitUntil: (p) => p })
const click = (url) => {
  let closed = false
  const event = { notification: { data: url === undefined ? undefined : { url }, close: () => { closed = true } }, waitUntil: (p) => p }
  return { event, wasClosed: () => closed }
}

ok(typeof handlers.push === 'function' && typeof handlers.notificationclick === 'function', 'gestionnaires push et notificationclick présents')

await push({ id: 'n1', title: 'Absence signalée', body: 'Patrick a été noté absent.', kind: 'absence', url: '/notifications' })
ok(shown.length === 1 && shown[0].title === 'Absence signalée', 'push : notification affichée avec le titre reçu')
ok(shown[0].options.body === 'Patrick a été noté absent.' && shown[0].options.tag === 'n1' && shown[0].options.icon === '/icon-192.png', 'push : texte, étiquette et icône')

await push({})
ok(shown[1].title === 'SCHOOLIA' && shown[1].options.body === '', 'push vide : titre par défaut')

// Aucune fenêtre ouverte : on ouvre la page demandée
let c = click('/notifications')
await handlers.notificationclick(c.event)
await new Promise((r) => setTimeout(r))
ok(c.wasClosed() && opened[0] === 'https://app.test/notifications', 'clic sans fenêtre : ouverture de /notifications')

// Adresse externe ou piégée : repli sur /notifications
c = click('https://evil.test/')
await handlers.notificationclick(c.event)
c = click('//evil.test/')
await handlers.notificationclick(c.event)
await new Promise((r) => setTimeout(r))
ok(opened[1] === 'https://app.test/notifications' && opened[2] === 'https://app.test/notifications', 'adresses externes refusées')

// Fenêtre déjà ouverte : on la ramène au premier plan
let focused = false, navigated = null
windows = [{ url: 'https://app.test/eleves', focus: async () => { focused = true }, navigate: async (u) => { navigated = u } }]
c = click('/annonces')
await handlers.notificationclick(c.event)
await new Promise((r) => setTimeout(r))
ok(focused && navigated === 'https://app.test/annonces' && opened.length === 3, 'clic avec fenêtre ouverte : mise au premier plan et navigation')
