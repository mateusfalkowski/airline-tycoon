import type { GameState, FinanceEvent } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { findAirport } from '../data/airports'
import { simulateFlight, clamp } from './economy'
import { runBotTick } from './stockMarket'

let eventCounter = 0
function nextEventId(): string {
  eventCounter += 1
  return `evt-${Date.now()}-${eventCounter}`
}

export function tick(state: GameState): GameState {
  const now = Date.now()
  let cash = state.cash
  let reputation = state.company.reputation
  const ledger: FinanceEvent[] = []

  const fleet = state.fleet.map((aircraft) => {
    if (aircraft.status !== 'flying' || !aircraft.flight) return aircraft
    if (aircraft.flight.arrivesAt > now) return aircraft

    const route = state.routes.find((r) => r.id === aircraft.flight!.routeId)
    const model = findAircraftModel(aircraft.modelId)
    const origin = route ? findAirport(route.originCode) : undefined
    const dest = route ? findAirport(route.destCode) : undefined

    if (!route || !model || !origin || !dest) {
      return { ...aircraft, status: 'idle' as const, flight: undefined }
    }

    const result = simulateFlight(model, route.distanceKm, route.ticketPrice, reputation, state.fuelPrice)
    cash += result.profit
    reputation = clamp(reputation + result.reputationDelta, 0, 100)

    ledger.push({
      id: nextEventId(),
      t: now,
      label: `Voo ${origin.code}→${dest.code}: ${result.passengers} pax, ${Math.round(result.loadFactor * 100)}% ocupação`,
      amount: Math.round(result.profit),
    })

    return { ...aircraft, status: 'idle' as const, flight: undefined }
  })

  const withFleet: GameState = {
    ...state,
    cash,
    fleet,
    company: { ...state.company, reputation },
    ledger: [...ledger, ...state.ledger].slice(0, 100),
    lastSeen: now,
  }

  const botResult = runBotTick(withFleet)
  const withStock: GameState = { ...withFleet, stock: botResult.stock }

  if (botResult.note) {
    withStock.ledger = [
      { id: nextEventId(), t: now, label: botResult.note, amount: 0 },
      ...withStock.ledger,
    ].slice(0, 100)
  }

  return withStock
}

/** Fast-forwards a state loaded after time away, resolving any flights that already landed. */
export function catchUp(state: GameState): GameState {
  return tick(state)
}
