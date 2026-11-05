import { describe, expect, it } from 'vitest'
import { dateFr, fullName, lastMonths, mention, monthKey, monthLabel, money, sum } from './format'

describe('money', () => {
  it('formate un montant en français avec deux décimales', () => {
    expect(money(1234.5, 'USD').replace(/\s/g, '')).toContain('1234,50')
  })
  it('traite null et undefined comme zéro', () => {
    expect(money(null).replace(/\s/g, '')).toContain('0,00')
    expect(money(undefined).replace(/\s/g, '')).toContain('0,00')
  })
  it('ne plante pas avec une devise inconnue', () => {
    expect(() => money(10, 'XXX')).not.toThrow()
  })
})

describe('dateFr', () => {
  it('renvoie un tiret pour une date absente ou invalide', () => {
    expect(dateFr(null)).toBe('—')
    expect(dateFr('')).toBe('—')
    expect(dateFr('pas une date')).toBe('—')
  })
  it('formate une date valide', () => {
    expect(dateFr('2026-03-15')).toContain('2026')
  })
})

describe('fullName', () => {
  it('met le nom en majuscules et ignore le postnom absent', () => {
    expect(fullName({ first_name: 'Jean', last_name: 'Mukendi', middle_name: 'Paul' })).toBe('MUKENDI Paul Jean')
    expect(fullName({ first_name: 'Grâce', last_name: 'Kabeya' })).toBe('KABEYA Grâce')
  })
})

describe('mois', () => {
  it('construit une clé AAAA-MM', () => {
    expect(monthKey('2026-03-15')).toBe('2026-03')
    expect(monthKey(new Date(2026, 10, 5))).toBe('2026-11')
  })
  it('liste les n derniers mois, le dernier étant le mois courant', () => {
    const list = lastMonths(6)
    expect(list).toHaveLength(6)
    expect(list[5]).toBe(monthKey(new Date()))
    expect(new Set(list).size).toBe(6)
  })
  it('donne un libellé court', () => {
    expect(monthLabel('2026-03').length).toBeGreaterThan(0)
  })
})

describe('sum', () => {
  it('additionne en convertissant les chaînes et en ignorant les valeurs vides', () => {
    expect(sum([{ a: 1 }, { a: '2' }, { a: null }], (r) => Number(r.a))).toBe(3)
    expect(sum([], () => 1)).toBe(0)
  })
})

describe('mention', () => {
  it('respecte les seuils de mention', () => {
    expect(mention(18).label).toBe('Excellent')
    expect(mention(16).label).toBe('Excellent')
    expect(mention(15).label).toBe('Très bien')
    expect(mention(12).label).toBe('Bien')
    expect(mention(10).label).toBe('Satisfaisant')
    expect(mention(9.99).label).toBe('Insuffisant')
    expect(mention(9.99).tone).toBe('bad')
  })
})
