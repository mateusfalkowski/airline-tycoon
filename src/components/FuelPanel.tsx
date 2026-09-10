import { useState } from 'react'
import type { GameState } from '../types'
import { useGameStore } from '../store/gameStore'
import { formatMoney } from '../format'
import { nextDepotUpgrade } from '../engine/fuel'
import { NumberInput } from './NumberInput'

export function FuelPanel({ state }: { state: GameState }) {
  const buyFuel = useGameStore((s) => s.buyFuel)
  const upgradeDepot = useGameStore((s) => s.upgradeDepot)
  const { fuel } = state

  const prev = fuel.history.length >= 2 ? fuel.history[fuel.history.length - 2].price : fuel.price
  const delta = fuel.price - prev
  const room = Math.max(0, fuel.capacity - fuel.stored)
  const [litres, setLitres] = useState(0)
  const upgrade = nextDepotUpgrade(fuel.capacity)

  const buy = (amount: number) => buyFuel(Math.round(amount))

  return (
    <div>
      <h3>Combustível</h3>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
            Preço spot
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-h)' }}>
            ${fuel.price.toFixed(3)}
            <span style={{ fontSize: 13, marginLeft: 8, color: delta >= 0 ? 'var(--red)' : 'var(--green)' }}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(3)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>por litro · muda a cada 15 min</div>
        </div>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
            Custo médio no depósito
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-h)' }}>${fuel.avgCost.toFixed(3)}/L</div>
        </div>
      </div>

      <FuelChart history={fuel.history} />

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>
          Depósito: {Math.round(fuel.stored).toLocaleString('pt-BR')} / {fuel.capacity.toLocaleString('pt-BR')} L
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.min(100, (fuel.stored / fuel.capacity) * 100)}%`,
              height: '100%',
              background: 'var(--accent)',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => buy(fuel.capacity * 0.25)} disabled={room <= 0}>
          +25%
        </button>
        <button onClick={() => buy(fuel.capacity * 0.5)} disabled={room <= 0}>
          +50%
        </button>
        <button className="primary" onClick={() => buy(room)} disabled={room <= 0}>
          Encher o depósito
        </button>
        <span style={{ color: 'var(--text-dim)' }}>ou</span>
        <NumberInput style={{ width: 110 }} min={0} value={litres} onChange={setLitres} />
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>L</span>
        <button onClick={() => buy(litres)} disabled={litres <= 0}>
          Comprar · {formatMoney(Math.round(Math.min(litres, room) * fuel.price))}
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 style={{ fontSize: 15 }}>Depósito</h3>
        {upgrade ? (
          <button
            className="primary"
            disabled={state.cash < upgrade.cost}
            onClick={upgradeDepot}
          >
            Ampliar para {upgrade.capacity.toLocaleString('pt-BR')} L · {formatMoney(upgrade.cost)}
          </button>
        ) : (
          <p style={{ color: 'var(--text-dim)' }}>Depósito no tamanho máximo.</p>
        )}
        <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6 }}>
          Voos consomem primeiro do depósito (ao custo médio que você pagou); o que faltar é comprado no
          preço spot do momento. Estoque quando estiver barato.
        </p>
      </div>
    </div>
  )
}

const W = 640
const H = 130
const PAD = 6

function FuelChart({ history }: { history: { t: number; price: number }[] }) {
  if (history.length < 2) return null
  const prices = history.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  const points = history.map((p, i) => {
    const x = PAD + (i / (history.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((p.price - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })
  const rising = prices[prices.length - 1] >= prices[0]
  const color = rising ? 'var(--red)' : 'var(--green)'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: H }}>
      <polyline points={`${PAD},${H - PAD} ${points.join(' ')} ${W - PAD},${H - PAD}`} fill={color} opacity={0.12} />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={2} />
      <text x={PAD} y={12} fontSize={10} fill="var(--text-dim)">
        ${max.toFixed(2)}
      </text>
      <text x={PAD} y={H - PAD - 2} fontSize={10} fill="var(--text-dim)">
        ${min.toFixed(2)}
      </text>
    </svg>
  )
}
