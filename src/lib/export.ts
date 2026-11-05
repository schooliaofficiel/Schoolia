// Export CSV compatible Excel (séparateur « ; », virgule décimale, UTF-8 avec BOM).
// Protection contre l'« injection de formule » : une cellule texte commençant par = + - @ est neutralisée.
type Cell = string | number | boolean | null | undefined

function cell(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : ''
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')
}

export function downloadCsv(filename: string, headers: string[], rows: Cell[][]): void {
  const blob = new Blob(['\uFEFF' + toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Imprime uniquement l'élément portant la classe « print-area » (reçu, bulletin, rapport).
export function printArea(): void {
  document.body.classList.add('print-isolate')
  const done = () => { document.body.classList.remove('print-isolate'); window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  window.print()
}
