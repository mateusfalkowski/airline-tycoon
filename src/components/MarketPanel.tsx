import { useState } from 'react'
import { AIRCRAFT_MODELS } from '../data/aircraft'
import { useGameStore } from '../store/gameStore'
import { formatMoney } from '../format'
import { SEAT_UNIT, SEAT_CLASSES, seatUnitsUsed, totalSeatCount, cabinUpfitCost } from '../engine/economy'
import type { AircraftModel, GameState, SeatClass, SeatConfig, TutorialStep } from '../types'
import { Field } from './Field'
import { NumberInput } from './NumberInput'
import { AircraftImage } from './AircraftArt'

const CATEGORY_LABEL: Record<string, string> = {
  regional: 'Regional',
  narrowbody: 'Corredor único',
  widebody: 'Longo curso',
}

const CLASS_LABEL: Record<SeatClass, string> = {
  economy: 'Econômica',
  business: 'Executiva (2x espaço)',
  first: 'Primeira (4x espaço)',
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

            <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 4px' }}>
              <AircraftImage modelId={m.id} category={m.category} width={200} />
            </div>

            <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap' }}>
              <span className="stat-chip">
                Preço <strong>{formatMoney(m.price)}</strong>
              </span>
              <span className="stat-chip">
                Assentos <strong>{m.seats}</strong>
              </span>
              <span className="stat-chip">
                Alcance <strong>{m.rangeKm.toLocaleString('pt-BR')} km</strong>
              </span>
              <span className="stat-chip">
                Velocidade <strong>{m.cruiseSpeedKmh.toLocaleString('pt-BR')} km/h</strong>
              </span>
              <span className="stat-chip">
                Consumo <strong>{m.fuelBurnPerKm.toFixed(1)} kg/km</strong>
              </span>
              <span className="stat-chip">
                Manutenção <strong>{formatMoney(m.maintenancePerHour)}/h</strong>
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

/** Sets `changed` to `rawCount` and shrinks the other two classes proportionally so the total
 *  space used never exceeds the aircraft's seat-unit budget. */
function reallocateSeats(config: SeatConfig, totalBudget: number, changed: SeatClass, rawCount: number): SeatConfig {
  const weight = SEAT_UNIT[changed]
  const maxCount = Math.floor(totalBudget / weight)
  const newCount = Math.min(Math.max(0, rawCount), maxCount)
  const remaining = totalBudget - newCount * weight

  const others = SEAT_CLASSES.filter((c) => c !== changed)
  const otherUnits = others.map((c) => config[c] * SEAT_UNIT[c])
  const sumOtherUnits = otherUnits[0] + otherUnits[1]

  const next: SeatConfig = { ...config, [changed]: newCount }

  if (sumOtherUnits > remaining) {
    const scale = sumOtherUnits > 0 ? remaining / sumOtherUnits : 0
    others.forEach((c, i) => {
      next[c] = Math.floor((otherUnits[i] * scale) / SEAT_UNIT[c])
    })
  }

  return next
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
  const [config, setConfig] = useState<SeatConfig>({ economy: model.seats, business: 0, first: 0 })

  const handleChange = (cls: SeatClass, value: number) => {
    setConfig((prev) => reallocateSeats(prev, model.seats, cls, value))
  }

  const unitsUsed = seatUnitsUsed(config)
  const totalPrice = model.price + cabinUpfitCost(config)
  const totalSeats = totalSeatCount(config)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 12,
        background: 'var(--panel)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      {SEAT_CLASSES.map((cls) => (
        <Field key={cls} label={`${CLASS_LABEL[cls]} — ${config[cls]} assentos`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={0}
              max={Math.floor(model.seats / SEAT_UNIT[cls])}
              value={config[cls]}
              onChange={(e) => handleChange(cls, Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <NumberInput style={{ width: 64 }} min={0} value={config[cls]} onChange={(v) => handleChange(cls, v)} />
          </div>
        </Field>
      ))}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="stat-chip">
          Total <strong>{totalSeats} lugares</strong> ({unitsUsed}/{model.seats} unidades de espaço)
        </span>
        <span className="stat-chip">
          Preço com essa cabine <strong>{formatMoney(totalPrice)}</strong>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="primary" disabled={cash < totalPrice} onClick={() => onConfirm(config)}>
          Confirmar compra
        </button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
