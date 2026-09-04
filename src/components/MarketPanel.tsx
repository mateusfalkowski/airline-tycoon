import { useState } from 'react'
import { AIRCRAFT_MODELS } from '../data/aircraft'
import { useGameStore } from '../store/gameStore'
import { formatMoney } from '../format'
import { SEAT_UNIT, cabinUpfitCost } from '../engine/economy'
import type { AircraftModel, GameState, SeatConfig, TutorialStep } from '../types'
import { Field } from './Field'
import { NumberInput } from './NumberInput'

const CATEGORY_LABEL: Record<string, string> = {
  regional: 'Regional',
  narrowbody: 'Corredor único',
  widebody: 'Longo curso',
}

export function MarketPanel({ state, tutorial }: { state: GameState; tutorial?: TutorialStep }) {
  const buyAircraft = useGameStore((s) => s.buyAircraft)
  const highlightBuy = tutorial === 'buy_aircraft'
  const [configuringId, setConfiguringId] = useState<string | null>(null)

  return (
    <div>
      <h3>Mercado de aeronaves</h3>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {AIRCRAFT_MODELS.map((m) => (
          <div
            key={m.id}
            style={{
              background: 'var(--panel-alt)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-sm)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <strong style={{ color: 'var(--text-h)', fontSize: 14.5 }}>{m.name}</strong>
              <span className="badge">{CATEGORY_LABEL[m.category]}</span>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span className="stat-chip">
                Alcance <strong>{m.rangeKm.toLocaleString('pt-BR')} km</strong>
              </span>
              <span className="stat-chip">
                Assentos <strong>{m.seats}</strong>
              </span>
              <span className="stat-chip">
                Preço <strong>{formatMoney(m.price)}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              <button
                className={highlightBuy && state.cash >= m.price ? 'tutorial-highlight' : undefined}
                disabled={state.cash < m.price}
                onClick={() => buyAircraft(m.id)}
              >
                Comprar (só econômica)
              </button>
              <button onClick={() => setConfiguringId(configuringId === m.id ? null : m.id)}>
                Configurar cabine
              </button>
            </div>

            {configuringId === m.id && (
              <CabinConfigurator
                model={m}
                cash={state.cash}
                onCancel={() => setConfiguringId(null)}
                onConfirm={(config) => {
                  buyAircraft(m.id, config)
                  setConfiguringId(null)
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CabinConfigurator({
  model,
  cash,
  onCancel,
  onConfirm,
}: {
  model: AircraftModel
  cash: number
  onCancel: () => void
  onConfirm: (config: SeatConfig) => void
}) {
  const [business, setBusiness] = useState(0)
  const [first, setFirst] = useState(0)

  const unitsUsed = business * SEAT_UNIT.business + first * SEAT_UNIT.first
  const economy = Math.max(0, model.seats - unitsUsed)
  const config: SeatConfig = { economy, business, first }
  const totalPrice = model.price + cabinUpfitCost(config)
  const overBudget = unitsUsed > model.seats
  const totalSeats = economy + business + first

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        padding: 12,
        background: 'var(--panel)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <Field label="Assentos executiva (2x espaço)">
        <NumberInput style={{ width: 80 }} min={0} value={business} onChange={setBusiness} />
      </Field>
      <Field label="Assentos primeira (4x espaço)">
        <NumberInput style={{ width: 80 }} min={0} value={first} onChange={setFirst} />
      </Field>
      <div style={{ fontSize: 13, color: overBudget ? 'var(--red)' : 'var(--text-dim)' }}>
        Econômica: {economy} assentos
        <br />
        Total: {totalSeats} lugares ({unitsUsed}/{model.seats} unidades de espaço)
      </div>
      <div style={{ fontSize: 13 }}>
        <span style={{ color: 'var(--text-dim)' }}>Preço com essa cabine: </span>
        <strong style={{ color: 'var(--text-h)' }}>{formatMoney(totalPrice)}</strong>
      </div>
      <button
        className="primary"
        disabled={overBudget || cash < totalPrice}
        onClick={() => onConfirm(config)}
      >
        Confirmar compra
      </button>
      <button onClick={onCancel}>Cancelar</button>
    </div>
  )
}
