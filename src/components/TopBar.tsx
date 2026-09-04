import { useState } from 'react'
import type { GameState } from '../types'
import { formatMoney } from '../format'
import { useGameStore } from '../store/gameStore'

interface Props {
  state: GameState
}

export function TopBar({ state }: Props) {
  const resetGame = useGameStore((s) => s.resetGame)
  const [confirming, setConfirming] = useState(false)

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '12px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel)',
        flexWrap: 'wrap',
      }}
    >
      <strong style={{ color: 'var(--text-h)', fontSize: 16 }}>✈️ {state.company.name}</strong>
      <span style={{ color: 'var(--text-dim)' }}>hub {state.company.hubCode}</span>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, alignItems: 'center' }}>
        <Stat label="Caixa" value={formatMoney(state.cash)} />
        <Stat label="Reputação" value={`${Math.round(state.company.reputation)}/100`} />
        <Stat label="Ação" value={`$${state.stock.sharePrice.toFixed(2)}`} />
        <Stat label="Frota" value={`${state.fleet.length}`} />

        {confirming ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--red)' }}>Apagar progresso?</span>
            <button style={{ fontSize: 12, borderColor: 'var(--red)' }} onClick={() => resetGame()}>
              Sim, reiniciar
            </button>
            <button style={{ fontSize: 12 }} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button style={{ fontSize: 12 }} onClick={() => setConfirming(true)}>
            Reiniciar jogo
          </button>
        )}
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text-h)' }}>{value}</div>
    </div>
  )
}
