const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

function formatNumber(n: number) {
  if (!isFinite(n) || n <= 0) return ''
  let r =
    n >= 100
      ? Math.round(n / 5) * 5
      : n >= 10
        ? Math.round(n)
        : Math.round(n * 4) / 4
  if (r === 0) r = Math.round(n * 100) / 100
  const i = Math.floor(r)
  const f = Math.round((r - i) * 100) / 100
  const frac = FRACTIONS[f]
  if (frac) return `${i || ''}${frac}`
  return String(r).replace('.', ',')
}

export function qtyText(q: number, u: string) {
  if (u === 'g' && q >= 1000) {
    q /= 1000
    u = 'kg'
  }
  if (u === 'ml' && q >= 1000) {
    q /= 1000
    u = 'l'
  }
  return formatNumber(q) + (u ? ` ${u}` : '')
}
