import { supabase } from './supabase'

// Appel de la fonction serveur « manage-users » (création de comptes) : la clé secrète reste côté serveur.
export async function manageUsers<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body })
  if (error) {
    let msg = error.message
    try {
      const j = await (error as any).context?.json()
      if (j?.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}

export function generatePassword(length = 10): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export interface AssistantReply { conversation_id: string; answer: string; tools: string[] }

// Appel de la fonction serveur « schoolia-ai » : la clé du fournisseur IA reste côté serveur (secret Supabase).
export async function askAssistant(body: { message: string; conversation_id?: string | null }): Promise<AssistantReply> {
  const { data, error } = await supabase.functions.invoke('schoolia-ai', { body })
  if (error) {
    let msg = error.message
    let code: string | undefined
    try {
      const j = await (error as any).context?.json()
      if (j?.error) msg = j.error
      code = j?.code
    } catch { /* ignore */ }
    throw Object.assign(new Error(msg), { code })
  }
  if (data?.error) throw Object.assign(new Error(data.error), { code: data.code })
  return data as AssistantReply
}
