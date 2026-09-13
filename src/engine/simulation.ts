import type { ActiveFlight, CO2State, FinanceEvent, FuelState, GameState, OwnedAircraft, Route } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { findAirport } from '../data/airports'
import type { SeatClass } from '../types'
import {
  simulateFlight,
  clamp,
  managerFee,
  realFlightMs,
  flightTimeHours,
  fuelTonnes,
  fixedCostPerHour,
  retunePrice,
  LOAN_DAILY_RATE,
  WEAR_PER_HOUR,
  CHECK_INTERVAL_HOURS,
  REVENUE_TEAM_CUT,
  REVENUE_TUNE_INTERVAL_MS,
  SEAT_CLASSES,
} from './economy'
import { computeRouteDemand } from './demand'
import { advanceFuelMarket, drawFuel } from './fuel'
import { CO2_PER_FUEL_TONNE, advanceCO2Market, drawCO2 } from './co2'
import { runBotTick } from './stockMarket'
import { updateMilestones } from './milestones'
import { rollNextEventAt, rollRandomEvent } from './events'

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
  co2: CO2State
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
  co2: CO2State,
  reputation: number,
  now: number,
  revenueCut = 0,
): DispatchOutcome | null {
  const model = findAircraftModel(aircraft.modelId)
  const origin = findAirport(route.originCode)
  const dest = findAirport(route.destCode)
  if (!model || !origin || !dest) return null

  const hours = flightTimeHours(route.distanceKm, model.cruiseSpeedKmh)
  const tonnes = fuelTonnes(model, route.distanceKm)
  const drawnFuel = drawFuel(fuel, tonnes)
  const effectiveFuelPrice = tonnes > 0 ? drawnFuel.cost / tonnes : fuel.price
  const drawnCO2 = drawCO2(co2, tonnes * CO2_PER_FUEL_TONNE)

  const demand = computeRouteDemand(origin, dest, route.distanceKm, now)
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
  const rmFee = revenueCut * result.revenue
  const netProfit = result.profit - fee - rmFee - drawnCO2.cost
  const id = nextEventId()
  const auto = aircraft.autoManaged ? ` (auto · gerente −${Math.round(fee).toLocaleString('en-US')})` : ''

  return {
    flight: {
      routeId: route.id,
      departedAt: now,
      arrivesAt: now + realFlightMs(hours),
      hours,
      passengers: result.passengers,
      loadFactor: result.loadFactor,
      profit: Math.round(netProfit),
    },
    fuel: drawnFuel.fuel,
    co2: drawnCO2.co2,
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

const MAX_CATCHUP_EVENTS = 300

function nextAircraftEventAt(aircraft: OwnedAircraft): number | null {
  if (aircraft.status === 'flying' && aircraft.flight) return aircraft.flight.arrivesAt
  if (aircraft.status === 'maintenance') return aircraft.maintenanceUntil ?? null
  return null
}

interface FleetAdvanceResult {
  fleet: OwnedAircraft[]
  fuel: FuelState
  co2: CO2State
  cash: number
  reputation: number
  flightsCompleted: number
  ledger: FinanceEvent[]
  landings: FlightLanding[]
}

/** Steps the fleet through every flight-arrival and maintenance-completion up to `now`, one at a
 *  time, redispatching auto-managed aircraft immediately — so a manager keeps flying its route
 *  while the game is closed instead of only resolving whatever was already in the air. */
function advanceFleetTo(
  fleet: OwnedAircraft[],
  routes: Route[],
  fuel: FuelState,
  co2: CO2State,
  reputation: number,
  cash: number,
  flightsCompleted: number,
  revenueCut: number,
  now: number,
): FleetAdvanceResult {
  let working = fleet
  const landings: FlightLanding[] = []
  let autoFlights = 0
  let autoProfit = 0

  for (let guard = 0; guard < MAX_CATCHUP_EVENTS; guard++) {
    let pickIdx = -1
    let pickTime = Infinity
    for (let i = 0; i < working.length; i++) {
      const t = nextAircraftEventAt(working[i])
      if (t !== null && t <= now && t < pickTime) {
        pickTime = t
        pickIdx = i
      }
    }
    if (pickIdx === -1) break

    const aircraft = working[pickIdx]

    if (aircraft.status === 'maintenance') {
      const cleared =
        aircraft.maintenanceKind === 'inspection'
          ? { ...aircraft, wear: 0, hoursSinceCheck: 0 }
          : { ...aircraft, wear: aircraft.wear * 0.55 }
      const idled = { ...cleared, status: 'idle' as const, maintenanceKind: undefined, maintenanceUntil: undefined }
      working = working.map((a, i) => (i === pickIdx ? idled : a))
      continue
    }

    // Flight arrival — apply the physical toll and free the aircraft.
    const h = aircraft.flight!.hours
    flightsCompleted += 1
    let updated: OwnedAircraft = {
      ...aircraft,
      status: 'idle' as const,
      flight: undefined,
      wear: clamp(aircraft.wear + h * WEAR_PER_HOUR, 0, 1),
      hoursSinceCheck: aircraft.hoursSinceCheck + h,
      totalHours: aircraft.totalHours + h,
    }

    if (updated.autoManaged && updated.hoursSinceCheck < CHECK_INTERVAL_HOURS) {
      const route = routes.find((r) => r.aircraftId === updated.id)
      const outcome = route ? dispatchOutcome(updated, route, fuel, co2, reputation, pickTime, revenueCut) : null
      if (outcome) {
        fuel = outcome.fuel
        co2 = outcome.co2
        cash += outcome.cashDelta
        reputation = clamp(reputation + outcome.reputationDelta, 0, 100)
        landings.push(outcome.landing)
        autoFlights += 1
        autoProfit += outcome.cashDelta
        updated = { ...updated, status: 'flying', flight: outcome.flight }
      }
    }

    working = working.map((a, i) => (i === pickIdx ? updated : a))
  }

  const ledger: FinanceEvent[] = []
  if (autoFlights > 0) {
    ledger.push({
      id: nextEventId(),
      t: now,
      label: `Enquanto você estava fora: ${autoFlights} ${autoFlights === 1 ? 'voo automático' : 'voos automáticos'}`,
      amount: Math.round(autoProfit),
    })
  }

  return { fleet: working, fuel, co2, cash, reputation, flightsCompleted, ledger, landings }
}

export function tick(state: GameState): TickResult {
  const now = Date.now()
  let cash = state.cash
  let reputation = state.company.reputation
  let flightsCompleted = state.flightsCompleted
  let fuel = advanceFuelMarket(state.fuel, now)
  let co2 = advanceCO2Market(state.co2, now)
  const ledger: FinanceEvent[] = []
  const landings: FlightLanding[] = []

  // Fixed fleet upkeep — charged continuously, logged hourly. Capped so a very stale save can't wipe you.
  const fixedPerHour = state.fleet.reduce((sum, ac) => {
    const m = findAircraftModel(ac.modelId)
    return sum + (m ? fixedCostPerHour(m.price) : 0)
  }, 0)
  const upkeepHours = Math.min(72, Math.max(0, (now - state.lastSeen) / 3_600_000))
  const interestPerHour = (state.debt * LOAN_DAILY_RATE) / 24
  cash -= (fixedPerHour + interestPerHour) * upkeepHours

  let lastFixedLogAt = state.lastFixedLogAt
  if (now - lastFixedLogAt >= 3_600_000 && (fixedPerHour > 0 || interestPerHour > 0)) {
    const loggedHours = Math.min(72, (now - lastFixedLogAt) / 3_600_000)
    if (fixedPerHour > 0)
      ledger.push({
        id: nextEventId(),
        t: now,
        label: 'Custos fixos da frota (pátio, seguro, equipe base)',
        amount: -Math.round(fixedPerHour * loggedHours),
      })
    if (interestPerHour > 0)
      ledger.push({
        id: nextEventId(),
        t: now,
        label: 'Juros da dívida',
        amount: -Math.round(interestPerHour * loggedHours),
      })
    lastFixedLogAt = now
  }

  // Revenue team: periodically nudge every route's prices toward demand.
  let routes = state.routes
  let lastRevenueTuneAt = state.lastRevenueTuneAt
  const revenueCut = state.revenueTeam ? REVENUE_TEAM_CUT : 0
  if (state.revenueTeam && now - lastRevenueTuneAt >= REVENUE_TUNE_INTERVAL_MS) {
    routes = state.routes.map((route) => {
      const ac = state.fleet.find((a) => a.id === route.aircraftId)
      const origin = findAirport(route.originCode)
      const dest = findAirport(route.destCode)
      if (!ac || !origin || !dest) return route
      const demand = computeRouteDemand(origin, dest, route.distanceKm, now)
      const nextPrices = { ...route.prices } as Record<SeatClass, number>
      for (const cls of SEAT_CLASSES) {
        if (ac.seatConfig[cls] > 0) {
          nextPrices[cls] = retunePrice(
            route.prices[cls],
            route.distanceKm,
            cls,
            ac.seatConfig[cls],
            demand[cls],
            state.company.reputation,
          )
        }
      }
      return { ...route, prices: nextPrices }
    })
    lastRevenueTuneAt = now
  }

  // Random events: rare, short-lived shocks or bonuses.
  let nextEventAt = state.nextEventAt ?? rollNextEventAt(now)
  let eventFleet = state.fleet
  let staffMorale = state.staffMorale
  if (now >= nextEventAt) {
    const outcome = rollRandomEvent(state, now)
    if (outcome) {
      cash += outcome.cashDelta
      reputation = clamp(reputation + outcome.reputationDelta, 0, 100)
      staffMorale = clamp(staffMorale + outcome.moraleDelta, 0, 100)
      if (outcome.fleet) eventFleet = outcome.fleet
      ledger.push({ id: nextEventId(), t: now, label: outcome.label, amount: Math.round(outcome.cashDelta) })
    }
    nextEventAt = rollNextEventAt(now)
  }

  let fleet = eventFleet.map((aircraft): OwnedAircraft => {
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
    const route = routes.find((r) => r.aircraftId === aircraft.id)
    if (!route) return aircraft
    const outcome = dispatchOutcome(aircraft, route, fuel, co2, reputation, now, revenueCut)
    if (!outcome) return aircraft
    fuel = outcome.fuel
    co2 = outcome.co2
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
    co2,
    fleet,
    routes,
    company: { ...state.company, reputation },
    ledger: [...ledger, ...state.ledger].slice(0, 100),
    lastSeen: now,
    flightsCompleted,
    lastFixedLogAt,
    lastRevenueTuneAt,
    nextEventAt,
    staffMorale,
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

  return { state: updateMilestones(withStock), landings }
}

/** Fast-forwards a state loaded after time away: walks every flight-arrival and
 *  maintenance-completion up to now in order, letting auto-managed aircraft keep flying their
 *  route the whole time, then hands off to a normal tick for everything else (fixed costs, fuel
 *  market, stock bots, random events — all already time-integrated or single-step by design). */
export function catchUp(state: GameState): TickResult {
  const now = Date.now()
  const revenueCut = state.revenueTeam ? REVENUE_TEAM_CUT : 0
  const advanced = advanceFleetTo(
    state.fleet,
    state.routes,
    state.fuel,
    state.co2,
    state.company.reputation,
    state.cash,
    state.flightsCompleted,
    revenueCut,
    now,
  )

  const withAdvance: GameState = {
    ...state,
    fleet: advanced.fleet,
    fuel: advanced.fuel,
    co2: advanced.co2,
    cash: advanced.cash,
    company: { ...state.company, reputation: advanced.reputation },
    flightsCompleted: advanced.flightsCompleted,
    ledger: advanced.ledger.length ? [...advanced.ledger, ...state.ledger].slice(0, 100) : state.ledger,
  }

  const { state: ticked, landings: tickLandings } = tick(withAdvance)
  return { state: ticked, landings: [...advanced.landings, ...tickLandings].slice(-4) }
}
