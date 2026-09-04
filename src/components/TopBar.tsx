import type { GameState } from '../types'
import { formatMoney } from '../format'

interface Props {
  state: GameState
}

export function TopBar({ state }: Props) {
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

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
        <Stat label="Caixa" value={formatMoney(state.cash)} />
        <Stat label="Reputação" value={`${Math.round(state.company.reputation)}/100`} />
        <Stat label="Ação" value={`$${state.stock.sharePrice.toFixed(2)}`} />
        <Stat label="Frota" value={`${state.fleet.length}`} />
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
