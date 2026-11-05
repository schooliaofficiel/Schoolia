import { describe, expect, it } from 'vitest'
import { daysUntil, priceOf, savingsPct, type Plan } from './billing'

const plan: Plan = {
  id: 'p1', code: 'standard', name: 'Standard', description: null, max_students: 600,
  price_monthly: 45, price_quarterly: 123, price_yearly: 450, features: [], is_active: true, sort: 2,
}

describe('prix des offres', () => {
  it('renvoie le prix de la durée choisie', () => {
    expect(priceOf(plan, 'monthly')).toBe(45)
    expect(priceOf(plan, 'quarterly')).toBe(123)
    expect(priceOf(plan, 'yearly')).toBe(450)
  })
  it('calcule l’économie par rapport au mensuel', () => {
    expect(savingsPct(plan, 'monthly')).toBe(0)
    expect(savingsPct(plan, 'quarterly')).toBe(9)
    expect(savingsPct(plan, 'yearly')).toBe(17)
  })
  it('ne renvoie jamais une économie négative', () => {
    expect(savingsPct({ ...plan, price_quarterly: 200 }, 'quarterly')).toBe(0)
  })
})

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }

describe('daysUntil', () => {
  it('renvoie null sans date', () => { expect(daysUntil(null)).toBeNull() })
  it('compte en jours calendaires, comme la base de données', () => {
    expect(daysUntil(shift(0))).toBe(0)
    expect(daysUntil(shift(10))).toBe(10)
    expect(daysUntil(shift(-1))).toBe(-1)
    expect(daysUntil(shift(-8))).toBe(-8)
  })
})
