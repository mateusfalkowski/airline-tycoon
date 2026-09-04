import type { PricePoint } from '../types'

const WIDTH = 640
const HEIGHT = 140
const PADDING = 8

export function StockChart({ history, ipoDone }: { history: PricePoint[]; ipoDone: boolean }) {
  if (history.length < 2) {
    return (
      <div style={{ color: 'var(--text-dim)', height: HEIGHT, display: 'flex', alignItems: 'center' }}>
        {ipoDone
          ? 'Aguardando a primeira rodada de negociação dos investidores...'
          : 'Histórico de preço aparecerá aqui após o IPO.'}
      </div>
    )
  }

  const prices = history.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const points = history.map((p, i) => {
    const x = PADDING + (i / (history.length - 1)) * (WIDTH - PADDING * 2)
    const y = HEIGHT - PADDING - ((p.price - min) / range) * (HEIGHT - PADDING * 2)
    return `${x},${y}`
  })

  const rising = prices[prices.length - 1] >= prices[0]
  const color = rising ? 'var(--green)' : 'var(--red)'

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ width: '100%', maxWidth: WIDTH, height: HEIGHT }}>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  )
}
