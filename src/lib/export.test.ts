import { describe, expect, it } from 'vitest'
import { toCsv } from './export'

describe('toCsv', () => {
  it('utilise le point-virgule et la virgule décimale (Excel français)', () => {
    expect(toCsv(['A', 'B'], [['x', 1.5]])).toBe('A;B\r\nx;1,5')
  })
  it('met entre guillemets les cellules contenant ; " ou un retour à la ligne', () => {
    expect(toCsv(['A'], [['x;y'], ['il dit "oui"'], ['a\nb']])).toBe('A\r\n"x;y"\r\n"il dit ""oui"""\r\n"a\nb"')
  })
  it('laisse vides les valeurs nulles et convertit les booléens', () => {
    expect(toCsv(['A', 'B', 'C'], [[null, undefined, true]])).toBe('A;B;C\r\n;;oui')
  })
  it('neutralise les formules injectées dans une cellule texte', () => {
    expect(toCsv(['A'], [['=SUM(A1:A9)'], ['+33123'], ['-cmd'], ['@lien']])).toBe("A\r\n'=SUM(A1:A9)\r\n'+33123\r\n'-cmd\r\n'@lien")
  })
  it('ne modifie pas les nombres négatifs', () => {
    expect(toCsv(['A'], [[-5]])).toBe('A\r\n-5')
  })
})
