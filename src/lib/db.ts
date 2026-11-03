// Petit utilitaire : lève l'erreur Supabase éventuelle et renvoie toujours un tableau/valeur exploitable.
export function rows<T = any>(res: { data: unknown; error: unknown }): T[] {
  if (res.error) throw res.error
  return ((res.data as T[] | null) ?? [])
}
