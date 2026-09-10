import { useState } from 'react'
import type { AircraftModel, GameState, SeatClass, TutorialStep } from '../types'
import { AIRPORTS, findAirport } from '../data/airports'
import { findAircraftModel } from '../data/aircraft'
import { distanceKm } from '../engine/geo'
import {
  fairPriceForClass,
  flightTimeHours,
  fuelTonnes,
  estimateLoadFactor,
  managerCap,
  MANAGER_HIRE_FEE,
  MANAGER_UNLOCK_FLIGHTS,
  SEAT_CLASSES,
} from '../engine/economy'
import { computeRouteDemand } from '../engine/demand'
import { useGameStore } from '../store/gameStore'
import { formatCountdown, formatDuration, formatMoney, formatShares } from '../format'
import { Field } from './Field'
import { NumberInput } from './NumberInput'
import { RangeSlider } from './RangeSlider'

const CLASS_LABEL: Record<SeatClass, string> = {
  economy: 'Econômica',
  business: 'Executiva',
  first: 'Primeira',
}

export function RoutesPanel({ state, now, tutorial }: { state: GameState; now: number; tutorial?: TutorialStep }) {
  const createRoute = useGameStore((s) => s.createRoute)
  const dispatchFlight = useGameStore((s) => s.dispatchFlight)
  const toggleAutoManage = useGameStore((s) => s.toggleAutoManage)
  const [editingAircraft, setEditingAircraft] = useState<string | null>(null)
  const highlightDefineRoute = tutorial === 'create_route'
  const highlightDispatch = tutorial === 'dispatch_flight'

  if (state.fleet.length === 0) {
    return <p style={{ color: 'var(--text-dim)' }}>Compre uma aeronave no Mercado para começar a voar.</p>
  }

  const managersUsed = state.fleet.filter((a) => a.autoManaged).length
  const managerLimit = managerCap(state.flightsCompleted)
  const managerUnlocked = state.flightsCompleted >= MANAGER_UNLOCK_FLIGHTS

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
                  style={
                    flying || aircraft.status === 'maintenance'
                      ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                      : undefined
                  }
                >
                  {flying
                    ? `Voando · chega em ${formatCountdown(aircraft.flight!.arrivesAt - now)}`
                    : aircraft.status === 'maintenance'
                      ? `Em manutenção · pronta em ${formatCountdown((aircraft.maintenanceUntil ?? now) - now)}`
                      : 'Em solo'}
                </span>
              </div>

              {route ? (
                <>
                  <div className="stat-chip">
                    Rota{' '}
                    <strong>
                      {route.originCode} → {route.destCode}
                    </strong>{' '}
                    · {route.distanceKm.toLocaleString('pt-BR')} km · {formatDuration(route.flightTimeHours)} de voo
                  </div>
                  <div className="stat-chip">
                    {SEAT_CLASSES.filter((cls) => aircraft.seatConfig[cls] > 0)
                      .map((cls) => `${CLASS_LABEL[cls]} ${formatMoney(route.prices[cls])}`)
                      .join(' · ')}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {aircraft.status === 'idle' && !aircraft.autoManaged && (
                      <button
                        className={`primary${highlightDispatch ? ' tutorial-highlight' : ''}`}
                        onClick={() => dispatchFlight(route.id)}
                      >
                        Despachar voo
                      </button>
                    )}

                    {aircraft.autoManaged ? (
                      <>
                        <span
                          className="badge"
                          style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
                        >
                          🤖 Operação automática
                        </span>
                        <button style={{ fontSize: 12 }} onClick={() => toggleAutoManage(aircraft.id)}>
                          Dispensar gerente
                        </button>
                      </>
                    ) : !managerUnlocked ? (
                      <button style={{ fontSize: 12 }} disabled>
                        🤖 Automatizar · requer {MANAGER_UNLOCK_FLIGHTS} voos ({state.flightsCompleted}/
                        {MANAGER_UNLOCK_FLIGHTS})
                      </button>
                    ) : managersUsed >= managerLimit ? (
                      <button style={{ fontSize: 12 }} disabled>
                        🤖 Limite de gerentes ({managersUsed}/{managerLimit})
                      </button>
                    ) : (
                      <button
                        style={{ fontSize: 12 }}
                        disabled={state.cash < MANAGER_HIRE_FEE}
                        title={state.cash < MANAGER_HIRE_FEE ? 'Caixa insuficiente' : undefined}
                        onClick={() => toggleAutoManage(aircraft.id)}
                      >
                        🤖 Contratar gerente · {formatMoney(MANAGER_HIRE_FEE)}
                      </button>
                    )}
                  </div>

                  {aircraft.autoManaged && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      O gerente redespacha esse avião sozinho, mesmo com o jogo fechado. Taxa de $1.000 + 4% da
                      receita por voo.
                    </div>
                  )}
                </>
              ) : isEditing && model ? (
                <RouteForm
                  model={model}
                  seatConfig={aircraft.seatConfig}
                  hub={state.company.hubCode}
                  reputation={state.company.reputation}
                  fuelPrice={state.fuel.price}
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
  model,
  seatConfig,
  hub,
  reputation,
  fuelPrice,
  onCreate,
  onCancel,
}: {
  model: AircraftModel
  seatConfig: Record<SeatClass, number>
  hub: string
  reputation: number
  fuelPrice: number
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

  const hours = flightTimeHours(dist, model.cruiseSpeedKmh)
  const cost = fuelTonnes(model, dist) * fuelPrice + model.maintenancePerHour * hours
  const revenue = demand
    ? activeClasses.reduce((sum, cls) => {
        const load = estimateLoadFactor(dist, cls, prices[cls], reputation)
        const pax = Math.min(seatConfig[cls], Math.round(demand[cls] * load))
        return sum + pax * prices[cls]
      }, 0)
    : 0
  const profit = revenue - cost

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Origem">
          <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            {AIRPORTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.city}
              </option>
            ))}
          </select>
        </Field>
        <span style={{ paddingBottom: 7, color: 'var(--text-dim)' }}>→</span>
        <Field label="Destino">
          <select value={dest} onChange={(e) => setDest(e.target.value)}>
            {AIRPORTS.filter((a) => a.code !== origin).map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.city}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {activeClasses.map((cls) => (
          <PriceClassField
            key={cls}
            label={CLASS_LABEL[cls]}
            distanceKm={dist}
            seatClass={cls}
            seats={seatConfig[cls]}
            demand={demand ? demand[cls] : 0}
            reputation={reputation}
            price={prices[cls]}
            onChange={(value) => setPrices((p) => ({ ...p, [cls]: value }))}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          flexWrap: 'wrap',
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--panel)',
          border: '1px solid var(--border-soft)',
          fontSize: 12.5,
        }}
      >
        <span className="stat-chip">
          Receita est./voo <strong>{formatMoney(Math.round(revenue))}</strong>
        </span>
        <span className="stat-chip">
          Custo est./voo <strong>{formatMoney(Math.round(cost))}</strong>
        </span>
        <span className="stat-chip">
          Lucro est./voo{' '}
          <strong style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {profit >= 0 ? '+' : ''}
            {formatMoney(Math.round(profit))}
          </strong>
        </span>
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
  distanceKm: dist,
  seatClass,
  seats,
  demand,
  reputation,
  price,
  onChange,
}: {
  label: string
  distanceKm: number
  seatClass: SeatClass
  seats: number
  demand: number
  reputation: number
  price: number
  onChange: (value: number) => void
}) {
  const base = fairPriceForClass(dist, seatClass)
  const suggested = Math.round(base)
  const min = Math.max(1, Math.round(base * 0.4))
  const max = Math.round(base * 2.2)

  const load = estimateLoadFactor(dist, seatClass, price, reputation)
  const pax = Math.min(seats, Math.round(demand * load))
  const revenue = pax * price
  const fillPct = seats > 0 ? Math.round((pax / seats) * 100) : 0

  return (
    <div
      style={{
        width: 260,
        padding: 12,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--panel)',
        border: '1px solid var(--border-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>demanda {formatShares(demand)}/dia</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <strong style={{ fontSize: 22, color: 'var(--text-h)' }}>${price}</strong>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>por passagem</span>
      </div>

      <RangeSlider
        value={Math.min(max, Math.max(min, price))}
        min={min}
        max={max}
        marker={suggested}
        markerLabel="padrão"
        onChange={onChange}
        formatEnd={(v) => `$${v}`}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-dim)' }}>
        <span>~{fillPct}% cheio</span>
        <span>~{pax} pax</span>
        <span style={{ color: 'var(--green)' }}>~{formatMoney(revenue)}/voo</span>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={price === suggested}
          onClick={() => onChange(suggested)}
          style={{ fontSize: 11, padding: '3px 8px' }}
        >
          Usar padrão (${suggested})
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>ou</span>
        <span style={{ color: 'var(--text-dim)' }}>$</span>
        <NumberInput style={{ width: 70 }} value={price} min={1} onChange={onChange} />
      </div>
    </div>
  )
}
