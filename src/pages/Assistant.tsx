import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import { Printer, Send, Sparkles, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { rows } from '../lib/db'
import { askAssistant } from '../lib/api'
import { dateFr } from '../lib/format'
import { printArea } from '../lib/export'
import { Alert, Button, Card } from '../components/ui'

interface Msg { id: string; role: 'user' | 'assistant'; content: string }
interface Conv { id: string; title: string | null; created_at: string }

const SUGGESTIONS = [
  'Quelle est la situation générale de l’établissement ?',
  'Combien l’école a-t-elle encaissé ce mois ?',
  'Quels parents ont encore des frais impayés ?',
  'Quels élèves accumulent le plus d’absences ?',
  'Quels enseignants n’ont pas encore encodé leurs points ?',
  'Génère un rapport financier du mois avec des recommandations.',
]

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : p))
}

function Prose({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) { blocks.push(<ul key={`l${blocks.length}`} className="my-1.5 list-disc space-y-1 pl-5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = [] }
  }
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    const li = line.match(/^\s*[-*•]\s+(.*)$/)
    if (li) { list.push(li[1]); return }
    flush()
    if (!line.trim()) return
    const h = line.match(/^#{1,4}\s+(.*)$/)
    if (h) blocks.push(<p key={i} className="mt-3 font-display text-base font-extrabold text-marine">{inline(h[1])}</p>)
    else blocks.push(<p key={i} className="my-1.5">{inline(line)}</p>)
  })
  flush()
  return <>{blocks}</>
}

export default function Assistant() {
  const { school } = useAuth()
  const [convs, setConvs] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<{ msg: string; code?: string } | null>(null)
  const [printId, setPrintId] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  async function loadConvs() {
    try { setConvs(rows<Conv>(await supabase.from('ai_conversations').select('id,title,created_at').order('created_at', { ascending: false }).limit(30))) } catch { /* historique indisponible */ }
  }
  useEffect(() => { void loadConvs() }, [])

  async function openConv(id: string | null) {
    setError(null); setActiveId(id)
    if (!id) return setMessages([])
    try { setMessages(rows<Msg>(await supabase.from('ai_messages').select('id,role,content').eq('conversation_id', id).order('created_at'))) } catch { setMessages([]) }
  }

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, sending])

  useEffect(() => {
    if (!printId) return
    const done = () => setPrintId(null)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => printArea(), 80)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done) }
  }, [printId])

  async function send(text: string) {
    const q = text.trim()
    if (q.length < 2 || sending) return
    setError(null); setInput(''); setSending(true)
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: q }])
    try {
      const r = await askAssistant({ message: q, conversation_id: activeId })
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: r.answer }])
      if (!activeId) { setActiveId(r.conversation_id); void loadConvs() }
    } catch (e) {
      const err = e as Error & { code?: string }
      setError({ msg: err.message, code: err.code })
    } finally {
      setSending(false)
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void send(input) }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 no-print">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-marine sm:text-3xl"><Sparkles className="h-6 w-6 text-crayon" aria-hidden /> Schoolia AI</h1>
          <p className="mt-1 text-sm text-slate-500">Posez vos questions : les réponses viennent des données réelles de {school?.name}.</p>
        </div>
        <div className="flex gap-2">
          <select className="field w-52" value={activeId ?? ''} onChange={(e) => void openConv(e.target.value || null)} aria-label="Historique des conversations">
            <option value="">Historique…</option>
            {convs.map((c) => <option key={c.id} value={c.id}>{dateFr(c.created_at)} — {c.title ?? 'Conversation'}</option>)}
          </select>
          <Button variant="secondary" onClick={() => void openConv(null)}><Plus className="h-4 w-4" aria-hidden /> Nouvelle</Button>
        </div>
      </div>

      <Card className="flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-4 p-4" aria-live="polite">
          {messages.length === 0 && !sending && (
            <div className="py-6 text-center no-print">
              <p className="font-display text-lg font-bold text-marine">Que voulez-vous savoir ?</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Je consulte les données à jour de l’école et je ne réponds que d’après elles.</p>
              <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => void send(s)} className="rounded-full border border-marine-200 bg-white px-3.5 py-2 text-left text-sm font-medium text-marine hover:bg-marine-50">{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={clsx('max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[80%]', m.role === 'user' ? 'bg-marine text-white' : 'border border-marine-100 bg-papier text-encre', printId === m.id && 'print-area')}>
                {printId === m.id && <p className="mb-3 hidden border-b border-marine-200 pb-2 text-xs text-slate-500 print:block">{school?.name} — rapport généré par SCHOOLIA AI le {dateFr(new Date())}</p>}
                {m.role === 'user' ? <p className="whitespace-pre-wrap">{m.content}</p> : <Prose text={m.content} />}
                {m.role === 'assistant' && <button onClick={() => setPrintId(m.id)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-ciel-700 hover:underline no-print"><Printer className="h-3.5 w-3.5" aria-hidden /> Imprimer ce rapport</button>}
              </div>
            </div>
          ))}
          {sending && <div className="flex justify-start"><div role="status" className="rounded-2xl border border-marine-100 bg-papier px-4 py-3 text-sm text-slate-500">Analyse des données de l’école…</div></div>}
          {error && (
            <div className="no-print space-y-3">
              <Alert>{error.msg}</Alert>
              {error.code === 'not_configured' && (
                <Alert tone="info">
                  <p className="font-semibold">Configuration requise (une seule fois) :</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    <li>Sur console.mistral.ai, créez une clé API (menu « API Keys »).</li>
                    <li>Dans Supabase : <em>Edge Functions → Secrets</em>, ajoutez le secret <strong>MISTRAL_API_KEY</strong> avec cette clé.</li>
                    <li>Revenez ici et reposez votre question.</li>
                  </ol>
                </Alert>
              )}
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form onSubmit={submit} className="sticky bottom-0 flex gap-2 rounded-b-xl border-t border-marine-100 bg-white p-3 no-print">
          <input className="field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Posez votre question à Schoolia AI…" maxLength={2000} aria-label="Votre question" disabled={sending} />
          <Button type="submit" loading={sending} disabled={input.trim().length < 2} aria-label="Envoyer"><Send className="h-4 w-4" aria-hidden /></Button>
        </form>
      </Card>
      <p className="mt-3 text-center text-xs text-slate-400 no-print">Schoolia AI consulte uniquement votre école, selon vos droits. Vérifiez les chiffres importants avant toute décision.</p>
    </>
  )
}
