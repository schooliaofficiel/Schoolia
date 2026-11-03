import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Seule la clé publique (anon / publishable) est utilisée ici : la sécurité repose sur les règles RLS de la base.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

export function errorMessage(e: unknown): string {
  if (!e) return 'Erreur inconnue'
  const err = e as { message?: string; code?: string }
  const msg = err.message ?? String(e)
  if (err.code === '23503') return 'Opération impossible : cet élément est lié à d’autres données.'
  if (err.code === '23505') return 'Cet élément existe déjà.'
  if (err.code === '42501' || /row-level security/i.test(msg)) return 'Vous n’avez pas l’autorisation d’effectuer cette action.'
  return msg
}
