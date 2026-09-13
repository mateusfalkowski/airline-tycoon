import { useState } from 'react'
import type { AircraftModel, GameState, Route, SeatClass, TutorialStep } from '../types'
import { AIRPORTS, findAirport, routeLegsKm } from '../data/airports'
import { findAircraftModel } from '../data/aircraft'
import { distanceKm } from '../engine/geo'
import {
  fairPriceForClass,
  planFlight,
  fixedCostPerHour,
  estimateLoadFactor,
  managerCap,
  MANAGER_HIRE_FEE,
  MANAGER_UNLOCK_FLIGHTS,
  CHECK_INTERVAL_HOURS,
  STOPOVER_FEE,
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

function demandForRoute(route: Route | undefined, now: number): Record<SeatClass, number> | null {
  if (!route) return null
  const origin = findAirport(route.originCode)
  const dest = findAirport(route.destCode)
  return origin && dest ? computeRouteDemand(origin, dest, route.distanceKm, now) : null
}

export function RoutesPanel({ state, now, tutorial }: { state: GameState; now: number; tutorial?: TutorialStep }) {
  const createRoute = useGameStore((s) => s.createRoute)
  const dispatchFlight = useGameStore((s) => s.dispatchFlight)
  const toggleAutoManage = useGameStore((s) => s.toggleAutoManage)
  const updateRoutePrices = useGameStore((s) => s.updateRoutePrices)
  const deleteRoute = useGameStore((s) => s.deleteRoute)
  const [editingAircraft, setEditingAircraft] = useState<string | null>(null)
  const [explainManager, setExplainManager] = useState<string | null>(null)
  const [editingPrices, setEditingPrices] = useState<{ routeId: string; prices: Record<SeatClass, number> } | null>(null)
  const highlightDefineRoute = tutorial === 'create_route'
  const highlightDispatch = tutorial === 'dispatch_flight'

  if (state.fleet.length === 0) {
    return <p style={{ color: 'var(--text-dim)' }}>Compre uma aeronave no Mercado para começar a voar.</p>
  }

  const managersUsed = state.fleet.filter((a) => a.autoManaged).length
  const managerLimit = managerCap(state.flightsCompleted)
  const managerUnlocked = state.flightsCompleted >= MANAGER_UNLOCK_FLIGHTS

  const fixedPerDay = state.fleet.reduce((s, ac) => {
    const m = findAircraftModel(ac.modelId)
    return s + (m ? fixedCostPerHour(m.price) : 0)
  }, 0) * 24

  const readyToDispatch = state.fleet.filter(
    (a) =>
      a.status === 'idle' &&
      !a.autoManaged &&
      a.hoursSinceCheck < CHECK_INTERVAL_HOURS &&
      state.routes.some((r) => r.aircraftId === a.id),
  )

  return (
    <div>
      <h3>Frota e rotas</h3>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginTop: -8,
          marginBottom: 12,
        }}
      >
        <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>
          Custo fixo da frota: ~
          <strong style={{ color: 'var(--text-h)' }}>{formatMoney(Math.round(fixedPerDay))}/dia</strong> (pátio,
          seguro, equipe base) — cobrado voando ou parado.
        </p>
        {readyToDispatch.length >= 2 && (
          <button
            className="primary"
            style={{ fontSize: 12, marginLeft: 'auto' }}
            onClick={() => {
              readyToDispatch.forEach((a) => {
                const r = state.routes.find((rt) => rt.aircraftId === a.id)
                if (r) dispatchFlight(r.id)
              })
            }}
          >
            Despachar todos os prontos ({readyToDispatch.length})
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.fleet.map((aircraft) => {
          const model = findAircraftModel(aircraft.modelId)
          const route = state.routes.find((r) => r.aircraftId === aircraft.id)
          const routeDemand = demandForRoute(route, now)
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
                      {route.originCode} → {route.viaCode ? `${route.viaCode} → ` : ''}
                      {route.destCode}
                    </strong>{' '}
                    · {route.distanceKm.toLocaleString('pt-BR')} km · {formatDuration(route.flightTimeHours)} de voo
                    {route.viaCode ? ' (com escala)' : ''}
                  </div>
                  {editingPrices?.routeId === route.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {SEAT_CLASSES.filter((cls) => aircraft.seatConfig[cls] > 0).map((cls) => (
                          <PriceClassField
                            key={cls}
                            label={CLASS_LABEL[cls]}
                            distanceKm={route.distanceKm}
                            seatClass={cls}
                            seats={aircraft.seatConfig[cls]}
                            demand={routeDemand ? routeDemand[cls] : 0}
                            reputation={state.company.reputation}
                            price={editingPrices.prices[cls]}
                            onChange={(v) =>
                              setEditingPrices((p) => p && { ...p, prices: { ...p.prices, [cls]: v } })
                            }
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="primary"
                          onClick={() => {
                            updateRoutePrices(route.id, editingPrices.prices)
                            setEditingPrices(null)
                          }}
                        >
                          Salvar preços
                        </button>
                        <button onClick={() => setEditingPrices(null)}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="stat-chip" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span>
                        {SEAT_CLASSES.filter((cls) => aircraft.seatConfig[cls] > 0)
                          .map((cls) => `${CLASS_LABEL[cls]} ${formatMoney(route.prices[cls])}`)
                          .join(' · ')}
                      </span>
                      <button
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => setEditingPrices({ routeId: route.id, prices: { ...route.prices } })}
                      >
                        Editar preços
                      </button>
                      <button
                        style={{ fontSize: 11, padding: '2px 8px', borderColor: 'var(--red)', color: 'var(--red)' }}
                        disabled={aircraft.status === 'flying'}
                        title={aircraft.status === 'flying' ? 'Aguarde o avião pousar' : undefined}
                        onClick={() => deleteRoute(route.id)}
                      >
                        Remover rota
                      </button>
                    </div>
                  )}
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
                      <button style={{ fontSize: 12 }} onClick={() => setExplainManager(aircraft.id)}>
                        🤖 Automatizar decolagens
                      </button>
                    )}
                  </div>

                  {explainManager === aircraft.id && !aircraft.autoManaged && (
                    <div
                      style={{
                        border: '1px solid var(--border-soft)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--panel)',
                        padding: 12,
                        fontSize: 12.5,
                        color: 'var(--text)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <strong style={{ color: 'var(--text-h)' }}>Gerente de operações</strong>
                      <p style={{ margin: 0, color: 'var(--text-dim)' }}>
                        Um gerente contratado cuida desse avião: assim que ele pousa e está com a revisão em dia,
                        o gerente já despacha o próximo voo da rota — mesmo com o jogo fechado. Você não precisa
                        voltar pra clicar em "Despachar".
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-dim)' }}>
                        <li>Contratação: <strong style={{ color: 'var(--text-h)' }}>{formatMoney(MANAGER_HIRE_FEE)}</strong> (uma vez, sem reembolso)</li>
                        <li>Por voo automático: <strong style={{ color: 'var(--text-h)' }}>$1.000 + 4% da receita</strong>, tirado do lucro do voo</li>
                        <li>Despachar manualmente rende mais — a automação é conveniência paga</li>
                        <li>Gerentes disponíveis: {managersUsed}/{managerLimit}</li>
                      </ul>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="primary"
                          disabled={state.cash < MANAGER_HIRE_FEE}
                          title={state.cash < MANAGER_HIRE_FEE ? 'Caixa insuficiente' : undefined}
                          onClick={() => {
                            toggleAutoManage(aircraft.id)
                            setExplainManager(null)
                          }}
                        >
                          Contratar · {formatMoney(MANAGER_HIRE_FEE)}
                        </button>
                        <button onClick={() => setExplainManager(null)}>Agora não</button>
                      </div>
                    </div>
                  )}

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
                  onCreate={(origin, dest, prices, viaCode) => {
                    createRoute(origin, dest, aircraft.id, prices, viaCode)
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
  onCreate: (origin: string, dest: string, prices: Record<SeatClass, number>, viaCode?: string) => void
  onCancel: () => void
}) {
  const [origin, setOrigin] = useState(hub)
  const [dest, setDest] = useState(AIRPORTS.find((a) => a.code !== hub)!.code)
  const [via, setVia] = useState<string | null>(null)
  const activeClasses = SEAT_CLASSES.filter((cls) => seatConfig[cls] > 0)

  const originAirport = findAirport(origin)
  const destAirport = findAirport(dest)
  const directDist = originAirport && destAirport ? distanceKm(originAirport, destAirport) : 0
  const directOutOfRange = directDist > model.rangeKm

  const viaCandidates =
    directOutOfRange && originAirport && destAirport
      ? AIRPORTS.filter(
          (a) =>
            a.code !== origin &&
            a.code !== dest &&
            distanceKm(originAirport, a) <= model.rangeKm &&
            distanceKm(a, destAirport) <= model.rangeKm,
        )
      : []
  const effectiveVia = directOutOfRange && via && viaCandidates.some((a) => a.code === via) ? via : undefined

  const legs = originAirport && destAirport ? routeLegsKm(origin, dest, effectiveVia) : null
  const dist = legs?.totalKm ?? directDist
  const demand = originAirport && destAirport ? computeRouteDemand(originAirport, destAirport, dist, Date.now()) : null

  const inRange = (code: string): boolean => {
    const a = findAirport(code)
    return !!originAirport && !!a && distanceKm(originAirport, a) <= model.rangeKm
  }
  const outOfRange = directOutOfRange && !effectiveVia

  const [prices, setPrices] = useState<Record<SeatClass, number>>(() => {
    const initial = {} as Record<SeatClass, number>
    for (const cls of SEAT_CLASSES) initial[cls] = Math.round(fairPriceForClass(dist, cls))
    return initial
  })

  const plan = legs ? planFlight(model, legs.leg1Km, legs.leg2Km) : null
  const hours = plan?.hours ?? 0
  const stopoverFee = effectiveVia ? STOPOVER_FEE[model.category] : 0
  const cost = (plan?.tonnes ?? 0) * fuelPrice + model.maintenancePerHour * hours + stopoverFee
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
          <select
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value)
              setVia(null)
            }}
          >
            {AIRPORTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.city}
              </option>
            ))}
          </select>
        </Field>
        <span style={{ paddingBottom: 7, color: 'var(--text-dim)' }}>→</span>
        <Field label="Destino">
          <select
            value={dest}
            onChange={(e) => {
              setDest(e.target.value)
              setVia(null)
            }}
          >
            {AIRPORTS.filter((a) => a.code !== origin).map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.city}
                {inRange(a.code) ? '' : ' (precisa de escala)'}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {directOutOfRange && (
        <Field label="Escala — destino fora do alcance direto">
          <select value={via ?? ''} onChange={(e) => setVia(e.target.value || null)}>
            <option value="">Selecione uma escala…</option>
            {viaCandidates.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.city}
              </option>
            ))}
          </select>
          {viaCandidates.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
              Nenhum aeroporto serve de escala — nenhum fica a uma perna de alcance dos dois lados.
            </div>
          )}
        </Field>
      )}

      <div className="stat-chip" style={{ color: outOfRange ? 'var(--red)' : 'var(--text-dim)' }}>
        {Math.round(dist).toLocaleString('pt-BR')} km{effectiveVia ? ` (via ${effectiveVia})` : ''} · alcance da
        aeronave {model.rangeKm.toLocaleString('pt-BR')} km
        {outOfRange ? ' — rota longa demais' : ''}
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
        <button
          className="primary"
          disabled={origin === dest || outOfRange}
          onClick={() => onCreate(origin, dest, prices, effectiveVia)}
        >
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
