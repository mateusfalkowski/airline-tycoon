import type { GameState, FinanceEvent, OwnedAircraft } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { findAirport } from '../data/airports'
import {
  simulateFlight,
  clamp,
  managerFee,
  realFlightMs,
  flightTimeHours,
  WEAR_PER_HOUR,
  CHECK_INTERVAL_HOURS,
} from './economy'
import { computeRouteDemand } from './demand'
import { advanceFuelMarket, drawFuel } from './fuel'
import { runBotTick } from './stockMarket'

let eventCounter = 0
function nextEventId(): string {
  eventCounter += 1
  return `evt-${Date.now()}-${eventCounter}`
}

export interface FlightLanding {
  id: string
  routeLabel: string
  passengers: number
  loadFactor: number
  profit: number
}

export interface TickResult {
  state: GameState
  landings: FlightLanding[]
}

export function tick(state: GameState): TickResult {
  const now = Date.now()
  let cash = state.cash
  let reputation = state.company.reputation
  let flightsCompleted = state.flightsCompleted
  let fuel = advanceFuelMarket(state.fuel, now)
  const ledger: FinanceEvent[] = []
  const landings: FlightLanding[] = []

  let fleet = state.fleet.map((aircraft) => {
    if (aircraft.status !== 'flying' || !aircraft.flight) return aircraft
    if (aircraft.flight.arrivesAt > now) return aircraft

    const route = state.routes.find((r) => r.id === aircraft.flight!.routeId)
    const model = findAircraftModel(aircraft.modelId)
    const origin = route ? findAirport(route.originCode) : undefined
    const dest = route ? findAirport(route.destCode) : undefined

    if (!route || !model || !origin || !dest) {
      return { ...aircraft, status: 'idle' as const, flight: undefined }
    }

    const hours = flightTimeHours(route.distanceKm, model.cruiseSpeedKmh)
    const litres = model.fuelBurnPerHour * hours
    const drawn = drawFuel(fuel, litres)
    fuel = drawn.fuel
    const effectiveFuelPrice = litres > 0 ? drawn.cost / litres : fuel.price

    const demand = computeRouteDemand(origin, dest, route.distanceKm)
    const result = simulateFlight(
      model,
      route.distanceKm,
      aircraft.seatConfig,
      route.prices,
      demand,
      reputation,
      effectiveFuelPrice,
      1 + aircraft.wear,
    )

    const fee = aircraft.autoManaged ? managerFee(result.revenue) : 0
    const netProfit = result.profit - fee
    cash += netProfit
    reputation = clamp(reputation + result.reputationDelta, 0, 100)
    flightsCompleted += 1

    const eventId = nextEventId()
    const auto = aircraft.autoManaged ? ` (auto · gerente −${Math.round(fee).toLocaleString('en-US')})` : ''
    ledger.push({
      id: eventId,
      t: now,
      label: `Voo ${origin.code}→${dest.code}: ${result.passengers} pax, ${Math.round(result.loadFactor * 100)}% ocupação${auto}`,
      amount: Math.round(netProfit),
    })
    landings.push({
      id: eventId,
      routeLabel: `${origin.code} → ${dest.code}`,
      passengers: result.passengers,
      loadFactor: result.loadFactor,
      profit: Math.round(netProfit),
    })

    return {
      ...aircraft,
      status: 'idle' as const,
      flight: undefined,
      wear: clamp(aircraft.wear + hours * WEAR_PER_HOUR, 0, 1),
      hoursSinceCheck: aircraft.hoursSinceCheck + hours,
      totalHours: aircraft.totalHours + hours,
    }
  })

  // Auto-dispatch: managed aircraft that are idle, not overdue for inspection, take off again.
  fleet = fleet.map((aircraft): OwnedAircraft => {
    if (!aircraft.autoManaged || aircraft.status !== 'idle') return aircraft
    if (aircraft.hoursSinceCheck >= CHECK_INTERVAL_HOURS) return aircraft
    const route = state.routes.find((r) => r.aircraftId === aircraft.id)
    if (!route) return aircraft
    return {
      ...aircraft,
      status: 'flying',
      flight: { routeId: route.id, departedAt: now, arrivesAt: now + realFlightMs(route.flightTimeHours) },
    }
  })

  const withFleet: GameState = {
    ...state,
    cash,
    fuel,
    fleet,
    company: { ...state.company, reputation },
    ledger: [...ledger, ...state.ledger].slice(0, 100),
    lastSeen: now,
    flightsCompleted,
  }

  const botResult = runBotTick(withFleet)
  const withStock: GameState = { ...withFleet, stock: botResult.stock }

  if (botResult.note) {
    withStock.ledger = [
      { id: nextEventId(), t: now, label: botResult.note, amount: 0 },
      ...withStock.ledger,
    ].slice(0, 100)
  }

  return { state: withStock, landings }
}

/** Fast-forwards a state loaded after time away, resolving any flights that already landed. */
export function catchUp(state: GameState): TickResult {
  return tick(state)
}
