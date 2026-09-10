import { useEffect } from 'react'
import { useGameStore } from '../store/gameStore'
import { formatMoney } from '../format'
import type { FlightLanding } from '../engine/simulation'

export function LandingToasts() {
  const landings = useGameStore((s) => s.landings)

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 50,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {landings.map((landing) => (
        <Toast key={landing.id} landing={landing} />
      ))}
    </div>
  )
}

function Toast({ landing }: { landing: FlightLanding }) {
  const dismissLanding = useGameStore((s) => s.dismissLanding)
  const positive = landing.profit >= 0

  useEffect(() => {
    const id = setTimeout(() => dismissLanding(landing.id), 6000)
    return () => clearTimeout(id)
  }, [landing.id, dismissLanding])

  return (
    <div
      onClick={() => dismissLanding(landing.id)}
      style={{
        cursor: 'pointer',
        background: 'var(--panel-raised)',
        border: `1px solid ${positive ? 'var(--green)' : 'var(--red)'}`,
        borderLeft: `4px solid ${positive ? 'var(--green)' : 'var(--red)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: '10px 14px',
        boxShadow: 'var(--shadow-card)',
        minWidth: 220,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        ✈️ Voo pousou · {landing.routeLabel}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginTop: 2 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {landing.passengers} pax · {Math.round(landing.loadFactor * 100)}%
        </span>
        <strong style={{ fontSize: 15, color: positive ? 'var(--green)' : 'var(--red)' }}>
          {positive ? '+' : ''}
          {formatMoney(landing.profit)}
        </strong>
      </div>
    </div>
  )
}
