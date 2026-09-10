import type { ActiveFlight, FinanceEvent, FuelState, GameState, OwnedAircraft, Route } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { findAirport } from '../data/airports'
import {
  simulateFlight,
  clamp,
  managerFee,
  realFlightMs,
  flightTimeHours,
  fuelTonnes,
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

export interface DispatchOutcome {
  flight: ActiveFlight
  fuel: FuelState
  cashDelta: number
  reputationDelta: number
  ledger: FinanceEvent
  landing: FlightLanding
}

/** Settles a flight's economics at dispatch: tickets are sold and costs paid up front,
 *  the aircraft then flies for the route's real duration. Returns null if data is missing. */
export function dispatchOutcome(
  aircraft: OwnedAircraft,
  route: Route,
  fuel: FuelState,
  reputation: number,
  now: number,
): DispatchOutcome | null {
  const model = findAircraftModel(aircraft.modelId)
  const origin = findAirport(route.originCode)
  const dest = findAirport(route.destCode)
  if (!model || !origin || !dest) return null

  const hours = flightTimeHours(route.distanceKm, model.cruiseSpeedKmh)
  const tonnes = fuelTonnes(model, route.distanceKm)
  const drawn = drawFuel(fuel, tonnes)
  const effectiveFuelPrice = tonnes > 0 ? drawn.cost / tonnes : fuel.price

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
  const id = nextEventId()
  const auto = aircraft.autoManaged ? ` (auto · gerente −${Math.round(fee).toLocaleString('en-US')})` : ''

  return {
    flight: {
      routeId: route.id,
      departedAt: now,
      arrivesAt: now + realFlightMs(hours),
      hours,
    },
    fuel: drawn.fuel,
    cashDelta: netProfit,
    reputationDelta: result.reputationDelta,
    ledger: {
      id,
      t: now,
      label: `Voo ${origin.code}→${dest.code}: ${result.passengers} pax, ${Math.round(result.loadFactor * 100)}% ocupação${auto}`,
      amount: Math.round(netProfit),
    },
    landing: {
      id,
      routeLabel: `${origin.code} → ${dest.code}`,
      passengers: result.passengers,
      loadFactor: result.loadFactor,
      profit: Math.round(netProfit),
    },
  }
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

  let fleet = state.fleet.map((aircraft): OwnedAircraft => {
    // Finish maintenance that's run its course.
    if (aircraft.status === 'maintenance') {
      if ((aircraft.maintenanceUntil ?? 0) > now) return aircraft
      const cleared =
        aircraft.maintenanceKind === 'inspection'
          ? { ...aircraft, wear: 0, hoursSinceCheck: 0 }
          : { ...aircraft, wear: aircraft.wear * 0.55 }
      return { ...cleared, status: 'idle' as const, maintenanceKind: undefined, maintenanceUntil: undefined }
    }

    if (aircraft.status !== 'flying' || !aircraft.flight) return aircraft
    if (aircraft.flight.arrivesAt > now) return aircraft

    // Flight arrived — money was settled at dispatch; apply the physical toll and free the aircraft.
    const h = aircraft.flight.hours
    flightsCompleted += 1
    return {
      ...aircraft,
      status: 'idle' as const,
      flight: undefined,
      wear: clamp(aircraft.wear + h * WEAR_PER_HOUR, 0, 1),
      hoursSinceCheck: aircraft.hoursSinceCheck + h,
      totalHours: aircraft.totalHours + h,
    }
  })

  // Auto-dispatch: managed aircraft that are idle, not overdue for inspection, take off again.
  fleet = fleet.map((aircraft): OwnedAircraft => {
    if (!aircraft.autoManaged || aircraft.status !== 'idle') return aircraft
    if (aircraft.hoursSinceCheck >= CHECK_INTERVAL_HOURS) return aircraft
    const route = state.routes.find((r) => r.aircraftId === aircraft.id)
    if (!route) return aircraft
    const outcome = dispatchOutcome(aircraft, route, fuel, reputation, now)
    if (!outcome) return aircraft
    fuel = outcome.fuel
    cash += outcome.cashDelta
    reputation = clamp(reputation + outcome.reputationDelta, 0, 100)
    ledger.push(outcome.ledger)
    landings.push(outcome.landing)
    return { ...aircraft, status: 'flying', flight: outcome.flight }
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
  const withStock: GameState = {
    ...withFleet,
    stock: botResult.stock,
    cash: withFleet.cash + botResult.cashGained,
  }

  if (botResult.note) {
    withStock.ledger = [
      { id: nextEventId(), t: now, label: botResult.note, amount: botResult.cashGained },
      ...withStock.ledger,
    ].slice(0, 100)
  }

  return { state: withStock, landings }
}

/** Fast-forwards a state loaded after time away, resolving any flights that already landed. */
export function catchUp(state: GameState): TickResult {
  return tick(state)
}
