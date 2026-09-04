import { useState } from 'react'
import type { GameState } from '../types'
import { AIRPORTS, findAirport } from '../data/airports'
import { findAircraftModel } from '../data/aircraft'
import { distanceKm } from '../engine/geo'
import { fairPrice } from '../engine/economy'
import { useGameStore } from '../store/gameStore'
import { formatCountdown, formatDuration, formatMoney } from '../format'

export function RoutesPanel({ state, now }: { state: GameState; now: number }) {
  const createRoute = useGameStore((s) => s.createRoute)
  const dispatchFlight = useGameStore((s) => s.dispatchFlight)
  const [editingAircraft, setEditingAircraft] = useState<string | null>(null)

  if (state.fleet.length === 0) {
    return <p style={{ color: 'var(--text-dim)' }}>Compre uma aeronave no Mercado para começar a voar.</p>
  }

  return (
    <div>
      <h3>Frota e rotas</h3>
      <table>
        <thead>
          <tr>
            <th>Aeronave</th>
            <th>Rota</th>
            <th>Preço</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {state.fleet.map((aircraft) => {
            const model = findAircraftModel(aircraft.modelId)
            const route = state.routes.find((r) => r.aircraftId === aircraft.id)
            const isEditing = editingAircraft === aircraft.id

            return (
              <tr key={aircraft.id}>
                <td>{model?.name ?? aircraft.modelId}</td>
                <td>
                  {route ? (
                    `${route.originCode} → ${route.destCode} (${route.distanceKm.toLocaleString('pt-BR')} km, ${formatDuration(route.flightTimeHours)})`
                  ) : isEditing ? (
                    <RouteForm
                      model={model?.id}
                      hub={state.company.hubCode}
                      onCancel={() => setEditingAircraft(null)}
                      onCreate={(origin, dest, price) => {
                        createRoute(origin, dest, aircraft.id, price)
                        setEditingAircraft(null)
                      }}
                    />
                  ) : (
                    <button onClick={() => setEditingAircraft(aircraft.id)}>Definir rota</button>
                  )}
                </td>
                <td>{route ? formatMoney(route.ticketPrice) : '—'}</td>
                <td>
                  {aircraft.status === 'idle'
                    ? 'Em solo'
                    : aircraft.flight
                      ? `Voando · chega em ${formatCountdown(aircraft.flight.arrivesAt - now)}`
                      : '—'}
                </td>
                <td>
                  {route && aircraft.status === 'idle' && (
                    <button className="primary" onClick={() => dispatchFlight(route.id)}>
                      Despachar
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RouteForm({
  hub,
  onCreate,
  onCancel,
}: {
  model: string | undefined
  hub: string
  onCreate: (origin: string, dest: string, price: number) => void
  onCancel: () => void
}) {
  const [origin, setOrigin] = useState(hub)
  const [dest, setDest] = useState(AIRPORTS.find((a) => a.code !== hub)!.code)

  const originAirport = findAirport(origin)
  const destAirport = findAirport(dest)
  const dist = originAirport && destAirport ? distanceKm(originAirport, destAirport) : 0
  const suggestedPrice = Math.round(fairPrice(dist))
  const [price, setPrice] = useState(suggestedPrice)

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
        {AIRPORTS.map((a) => (
          <option key={a.code} value={a.code}>
            {a.code}
          </option>
        ))}
      </select>
      →
      <select value={dest} onChange={(e) => setDest(e.target.value)}>
        {AIRPORTS.filter((a) => a.code !== origin).map((a) => (
          <option key={a.code} value={a.code}>
            {a.code}
          </option>
        ))}
      </select>
      <input
        type="number"
        style={{ width: 90 }}
        value={price}
        min={1}
        onChange={(e) => setPrice(Number(e.target.value))}
      />
      <button
        className="primary"
        disabled={origin === dest}
        onClick={() => onCreate(origin, dest, price)}
      >
        Criar
      </button>
      <button onClick={onCancel}>Cancelar</button>
    </div>
  )
}
