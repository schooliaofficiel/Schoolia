export type Cycle = 'monthly' | 'quarterly' | 'yearly'

export interface Plan {
  id: string; code: string; name: string; description: string | null; max_students: number | null
  price_monthly: number; price_quarterly: number; price_yearly: number; features: string[]; is_active: boolean; sort: number
}
export interface Subscription {
  id: string; school_id: string; plan_id: string | null; billing_cycle: Cycle | null
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
  trial_ends_on: string | null; current_period_start: string | null; current_period_end: string | null
  auto_renew: boolean; pending_plan_id: string | null; pending_cycle: Cycle | null
}
export interface Invoice {
  id: string; school_id: string; number: string; plan_id: string | null; cycle: Cycle; amount: number; currency: string
  period_start: string; period_end: string; status: 'pending' | 'paid' | 'cancelled'; auto_generated: boolean; issued_at: string; due_date: string; paid_at: string | null
}
export interface SubPayment {
  id: string; school_id: string; invoice_id: string; amount: number; method: string; reference: string; payer_phone: string | null
  status: 'pending' | 'confirmed' | 'rejected'; reject_reason: string | null; created_at: string
}

export const CYCLES: Cycle[] = ['monthly', 'quarterly', 'yearly']
export const CYCLE_LABEL: Record<Cycle, string> = { monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel' }
export const CYCLE_MONTHS: Record<Cycle, number> = { monthly: 1, quarterly: 3, yearly: 12 }
export const priceOf = (p: Plan, c: Cycle) => Number(c === 'monthly' ? p.price_monthly : c === 'quarterly' ? p.price_quarterly : p.price_yearly)
export const savingsPct = (p: Plan, c: Cycle) => Math.max(0, Math.round((1 - priceOf(p, c) / (Number(p.price_monthly) * CYCLE_MONTHS[c])) * 100))

export const STATUS: Record<Subscription['status'], { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' | 'neutral' }> = {
  trial: { label: 'Essai gratuit', tone: 'info' }, active: { label: 'Actif', tone: 'ok' },
  past_due: { label: 'Expiré (délai de grâce)', tone: 'warn' }, suspended: { label: 'Suspendu', tone: 'bad' }, cancelled: { label: 'Annulé', tone: 'neutral' },
}
export const PAY_METHODS: Record<string, string> = {
  mpesa: 'M-Pesa (Vodacom)', airtel_money: 'Airtel Money', orange_money: 'Orange Money', afrimoney: 'Afrimoney (Africell)', bank: 'Virement bancaire', card: 'Carte', cash: 'Espèces',
}
export const SETTING_KEYS: { key: string; label: string; hint: string }[] = [
  { key: 'pay_mpesa', label: 'M-Pesa', hint: 'Numéro marchand ou personnel + nom du bénéficiaire' },
  { key: 'pay_airtel_money', label: 'Airtel Money', hint: 'Numéro + nom du bénéficiaire' },
  { key: 'pay_orange_money', label: 'Orange Money', hint: 'Numéro + nom du bénéficiaire' },
  { key: 'pay_afrimoney', label: 'Afrimoney', hint: 'Numéro + nom du bénéficiaire' },
  { key: 'pay_bank', label: 'Compte bancaire', hint: 'Banque, intitulé, numéro de compte' },
  { key: 'pay_instructions', label: 'Instructions affichées aux écoles', hint: 'Ex : indiquez le numéro de facture en référence ; validation sous 24 h.' },
  { key: 'ai_guide', label: 'Guide de Schoolia AI', hint: 'Ce que l’assistant sait du fonctionnement de l’application. À mettre à jour à chaque nouveauté.' },
]
// Jours restants jusqu'à une date (AAAA-MM-JJ) : même logique que la base (différence de dates, sans heures).
export function daysUntil(d: string | null): number | null {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  const now = new Date()
  return Math.round((Date.UTC(y, m - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
}
