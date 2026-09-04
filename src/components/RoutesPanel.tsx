import { useState } from 'react'
import type { GameState, SeatClass, TutorialStep } from '../types'
import { AIRPORTS, findAirport } from '../data/airports'
import { findAircraftModel } from '../data/aircraft'
import { distanceKm } from '../engine/geo'
import { fairPriceForClass, SEAT_CLASSES } from '../engine/economy'
import { computeRouteDemand } from '../engine/demand'
import { useGameStore } from '../store/gameStore'
import { formatCountdown, formatDuration, formatMoney, formatShares } from '../format'
import { Field } from './Field'
import { NumberInput } from './NumberInput'

const CLASS_LABEL: Record<SeatClass, string> = {
  economy: 'Econômica',
  business: 'Executiva',
  first: 'Primeira',
}

export function RoutesPanel({ state, now, tutorial }: { state: GameState; now: number; tutorial?: TutorialStep }) {
  const createRoute = useGameStore((s) => s.createRoute)
  const dispatchFlight = useGameStore((s) => s.dispatchFlight)
  const [editingAircraft, setEditingAircraft] = useState<string | null>(null)
  const highlightDefineRoute = tutorial === 'create_route'
  const highlightDispatch = tutorial === 'dispatch_flight'

  if (state.fleet.length === 0) {
    return <p style={{ color: 'var(--text-dim)' }}>Compre uma aeronave no Mercado para começar a voar.</p>
  }

  return (
    <div>
      <h3>Frota e rotas</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.fleet.map((aircraft) => {
          const model = findAircraftModel(aircraft.modelId)
          const route = state.routes.find((r) => r.aircraftId === aircraft.id)
          const isEditing = editingAircraft === aircraft.id
          const flying = aircraft.status === 'flying' && aircraft.flight

          return (
            <div
              key={aircraft.id}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ color: 'var(--text-h)', fontSize: 14.5 }}>{model?.name ?? aircraft.modelId}</strong>
                <span
                  className="badge"
                  style={flying ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                >
                  {flying ? `Voando · chega em ${formatCountdown(aircraft.flight!.arrivesAt - now)}` : 'Em solo'}
                </span>
              </div>

              {route ? (
                <>
                  <div className="stat-chip">
                    Rota{' '}
                    <strong>
                      {route.originCode} → {route.destCode}
                    </strong>{' '}
                    · {route.distanceKm.toLocaleString('pt-BR')} km · {formatDuration(route.flightTimeHours)}
                  </div>
                  <div className="stat-chip">
                    {SEAT_CLASSES.filter((cls) => aircraft.seatConfig[cls] > 0)
                      .map((cls) => `${CLASS_LABEL[cls]} ${formatMoney(route.prices[cls])}`)
                      .join(' · ')}
                  </div>
                  {aircraft.status === 'idle' && (
                    <div>
                      <button
                        className={`primary${highlightDispatch ? ' tutorial-highlight' : ''}`}
                        onClick={() => dispatchFlight(route.id)}
                      >
                        Despachar voo
                      </button>
                    </div>
                  )}
                </>
              ) : isEditing ? (
                <RouteForm
                  seatConfig={aircraft.seatConfig}
                  hub={state.company.hubCode}
                  onCancel={() => setEditingAircraft(null)}
                  onCreate={(origin, dest, prices) => {
                    createRoute(origin, dest, aircraft.id, prices)
                    setEditingAircraft(null)
                  }}
                />
              ) : (
                <div>
                  <button
                    className={highlightDefineRoute ? 'tutorial-highlight' : undefined}
                    onClick={() => setEditingAircraft(aircraft.id)}
                  >
                    Definir rota
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RouteForm({
  seatConfig,
  hub,
  onCreate,
  onCancel,
}: {
  seatConfig: Record<SeatClass, number>
  hub: string
  onCreate: (origin: string, dest: string, prices: Record<SeatClass, number>) => void
  onCancel: () => void
}) {
  const [origin, setOrigin] = useState(hub)
  const [dest, setDest] = useState(AIRPORTS.find((a) => a.code !== hub)!.code)
  const activeClasses = SEAT_CLASSES.filter((cls) => seatConfig[cls] > 0)

  const originAirport = findAirport(origin)
  const destAirport = findAirport(dest)
  const dist = originAirport && destAirport ? distanceKm(originAirport, destAirport) : 0
  const demand = originAirport && destAirport ? computeRouteDemand(originAirport, destAirport, dist) : null

  const [prices, setPrices] = useState<Record<SeatClass, number>>(() => {
    const initial = {} as Record<SeatClass, number>
    for (const cls of SEAT_CLASSES) initial[cls] = Math.round(fairPriceForClass(dist, cls))
    return initial
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Origem">
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {AIRPORTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code}
              </option>
            ))}
          </select>
        </Field>
        <span style={{ paddingBottom: 7, color: 'var(--text-dim)' }}>→</span>
        <Field label="Destino">
          <select value={dest} onChange={(e) => setDest(e.target.value)}>
            {AIRPORTS.filter((a) => a.code !== origin).map((a) => (
              <option key={a.code} value={a.code}>
                {a.code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {demand && (
        <div className="stat-chip">
          Demanda diária: {activeClasses.map((cls) => `${CLASS_LABEL[cls]} ${formatShares(demand[cls])}`).join(' · ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {activeClasses.map((cls) => (
          <PriceClassField
            key={cls}
            label={`Preço — ${CLASS_LABEL[cls]}`}
            basePrice={fairPriceForClass(dist, cls)}
            price={prices[cls]}
            onChange={(value) => setPrices((p) => ({ ...p, [cls]: value }))}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="primary" disabled={origin === dest} onClick={() => onCreate(origin, dest, prices)}>
          Criar rota
        </button>
        <button onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function PriceClassField({
  label,
  basePrice,
  price,
  onChange,
}: {
  label: string
  basePrice: number
  price: number
  onChange: (value: number) => void
}) {
  const sliderMin = Math.max(1, Math.round(basePrice * 0.5))
  const sliderMax = Math.round(basePrice * 2)

  const suggested = Math.round(basePrice)
  const isSuggested = price === suggested

  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 220 }}>
        <button
          type="button"
          title="Preço sugerido para essa rota, sem ser o ideal — só um ponto de partida"
          onClick={() => onChange(suggested)}
          style={{
            fontSize: 11,
            padding: '4px 8px',
            alignSelf: 'flex-start',
            borderColor: isSuggested ? 'var(--accent)' : undefined,
            background: isSuggested ? 'var(--accent-dim)' : undefined,
          }}
        >
          Padrão · ${suggested}
        </button>
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          value={clampToRange(price, sliderMin, sliderMax)}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: 'var(--text-dim)' }}>$</span>
          <NumberInput style={{ width: 80 }} value={price} min={1} onChange={onChange} />
        </div>
      </div>
    </Field>
  )
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
