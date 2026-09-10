import { create } from 'zustand'
import type { GameState, OwnedAircraft, Route, SeatClass, SeatConfig } from '../types'
import type { TutorialStep } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { findAirport } from '../data/airports'
import { distanceKm } from '../engine/geo'
import {
  flightTimeHours,
  realFlightMs,
  seatUnitsUsed,
  cabinUpfitCost,
  managerCap,
  MANAGER_HIRE_FEE,
  MANAGER_UNLOCK_FLIGHTS,
  CHECK_INTERVAL_HOURS,
  LIGHT_MAINTENANCE_HOURS,
  INSPECTION_HOURS,
  inspectionCost,
  lightMaintenanceCost,
} from '../engine/economy'
import { createInitialFuel, buyFuel, nextDepotUpgrade } from '../engine/fuel'
import { tick as runTick, catchUp } from '../engine/simulation'
import type { FlightLanding } from '../engine/simulation'
import { createInitialStock, computeValuation, listCompany, STOCK_LISTING_FEE } from '../engine/stockMarket'
import { loadGame, saveGame, wipeSave } from '../engine/persistence'
import { INITIAL_TOTAL_SHARES } from '../engine/stockMarket'

const STARTING_CASH = 25_000_000

function allEconomyConfig(seats: number): SeatConfig {
  return { economy: seats, business: 0, first: 0 }
}

function migrateState(saved: GameState): GameState {
  const fleet = saved.fleet.map((aircraft) => {
    const model = findAircraftModel(aircraft.modelId)
    return {
      ...aircraft,
      seatConfig: aircraft.seatConfig ?? allEconomyConfig(model?.seats ?? 0),
      wear: aircraft.wear ?? 0,
      hoursSinceCheck: aircraft.hoursSinceCheck ?? 0,
      totalHours: aircraft.totalHours ?? 0,
    }
  })

  const routes = saved.routes.map((route) => {
    if (route.prices) return route
    const legacyPrice = (route as unknown as { ticketPrice?: number }).ticketPrice ?? 0
    return { ...route, prices: { economy: legacyPrice, business: 0, first: 0 } }
  })

  const rawTutorial = saved.tutorial as string | undefined

  return {
    ...saved,
    fleet,
    routes,
    fuel: saved.fuel ?? createInitialFuel(Date.now()),
    tutorial: !rawTutorial || rawTutorial === 'stock_intro' ? 'done' : (rawTutorial as TutorialStep),
    flightsCompleted: saved.flightsCompleted ?? 0,
  }
}

interface GameStore {
  state: GameState | null
  landings: FlightLanding[]
  init: () => void
  createCompany: (name: string, hubCode: string) => void
  buyAircraft: (modelId: string, seatConfig?: SeatConfig) => void
  createRoute: (originCode: string, destCode: string, aircraftId: string, prices: Record<SeatClass, number>) => void
  dispatchFlight: (routeId: string) => void
  toggleAutoManage: (aircraftId: string) => void
  buyFuel: (litres: number) => void
  upgradeDepot: () => void
  serviceAircraft: (aircraftId: string) => void
  lightMaintenance: (aircraftId: string) => void
  doTick: () => void
  dismissLanding: (id: string) => void
  listCompany: () => void
  finishTutorial: () => void
  resetGame: () => void
}

function persist(state: GameState) {
  saveGame(state)
}

export const useGameStore = create<GameStore>((set, get) => ({
  state: null,
  landings: [],

  init: () => {
    const saved = loadGame()
    if (saved) {
      const { state: caughtUp, landings } = catchUp(migrateState(saved))
      set({ state: caughtUp, landings: landings.slice(-4) })
      persist(caughtUp)
    }
  },

  createCompany: (name, hubCode) => {
    const initialValuation = STARTING_CASH
    const sharePrice = initialValuation / INITIAL_TOTAL_SHARES
    const newState: GameState = {
      version: 1,
      company: { name, hubCode, foundedAt: Date.now(), reputation: 50 },
      cash: STARTING_CASH,
      fuel: createInitialFuel(Date.now()),
      fleet: [],
      routes: [],
      stock: createInitialStock(sharePrice),
      ledger: [{ id: 'evt-founding', t: Date.now(), label: `${name} foi fundada em ${hubCode}`, amount: STARTING_CASH }],
      lastSeen: Date.now(),
      tutorial: 'buy_aircraft',
      flightsCompleted: 0,
    }
    set({ state: newState })
    persist(newState)
  },

  buyAircraft: (modelId, seatConfig) => {
    const state = get().state
    const model = findAircraftModel(modelId)
    if (!state || !model) return

    const config = seatConfig ?? allEconomyConfig(model.seats)
    if (seatUnitsUsed(config) > model.seats) return

    const totalPrice = model.price + cabinUpfitCost(config)
    if (state.cash < totalPrice) return

    const aircraft: OwnedAircraft = {
      id: `ac-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      modelId,
      status: 'idle',
      seatConfig: config,
      wear: 0,
      hoursSinceCheck: 0,
      totalHours: 0,
    }
    const next: GameState = {
      ...state,
      cash: state.cash - totalPrice,
      fleet: [...state.fleet, aircraft],
      ledger: [
        { id: `evt-buy-${aircraft.id}`, t: Date.now(), label: `Comprou ${model.name}`, amount: -totalPrice },
        ...state.ledger,
      ].slice(0, 100),
      tutorial: state.tutorial === 'buy_aircraft' ? 'create_route' : state.tutorial,
    }
    set({ state: next })
    persist(next)
  },

  createRoute: (originCode, destCode, aircraftId, prices) => {
    const state = get().state
    const origin = findAirport(originCode)
    const dest = findAirport(destCode)
    const aircraft = state?.fleet.find((a) => a.id === aircraftId)
    if (!state || !origin || !dest || !aircraft || originCode === destCode) return

    const route: Route = {
      id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originCode,
      destCode,
      aircraftId,
      prices,
      distanceKm: Math.round(distanceKm(origin, dest)),
      flightTimeHours: 0,
    }
    const model = findAircraftModel(aircraft.modelId)
    if (model) route.flightTimeHours = flightTimeHours(route.distanceKm, model.cruiseSpeedKmh)

    const next: GameState = {
      ...state,
      routes: [...state.routes, route],
      tutorial: state.tutorial === 'create_route' ? 'dispatch_flight' : state.tutorial,
    }
    set({ state: next })
    persist(next)
  },

  dispatchFlight: (routeId) => {
    const state = get().state
    if (!state) return
    const route = state.routes.find((r) => r.id === routeId)
    if (!route) return
    const aircraft = state.fleet.find((a) => a.id === route.aircraftId)
    if (!aircraft || aircraft.status !== 'idle') return
    if (aircraft.hoursSinceCheck >= CHECK_INTERVAL_HOURS) return

    const now = Date.now()
    const arrivesAt = now + realFlightMs(route.flightTimeHours)
    const next: GameState = {
      ...state,
      fleet: state.fleet.map((a) =>
        a.id === aircraft.id ? { ...a, status: 'flying', flight: { routeId, departedAt: now, arrivesAt } } : a,
      ),
      tutorial: state.tutorial === 'dispatch_flight' ? 'done' : state.tutorial,
    }
    set({ state: next })
    persist(next)
  },

  toggleAutoManage: (aircraftId) => {
    const state = get().state
    if (!state) return
    const aircraft = state.fleet.find((a) => a.id === aircraftId)
    if (!aircraft) return
    const model = findAircraftModel(aircraft.modelId)
    const name = model?.name ?? aircraft.modelId
    const now = Date.now()

    if (aircraft.autoManaged) {
      const next: GameState = {
        ...state,
        fleet: state.fleet.map((a) => (a.id === aircraftId ? { ...a, autoManaged: false } : a)),
        ledger: [
          { id: `evt-mgr-off-${now}`, t: now, label: `Dispensou o gerente de operações de ${name}`, amount: 0 },
          ...state.ledger,
        ].slice(0, 100),
      }
      set({ state: next })
      persist(next)
      return
    }

    const managersUsed = state.fleet.filter((a) => a.autoManaged).length
    if (
      state.flightsCompleted < MANAGER_UNLOCK_FLIGHTS ||
      managersUsed >= managerCap(state.flightsCompleted) ||
      state.cash < MANAGER_HIRE_FEE
    ) {
      return
    }

    const next: GameState = {
      ...state,
      cash: state.cash - MANAGER_HIRE_FEE,
      fleet: state.fleet.map((a) => (a.id === aircraftId ? { ...a, autoManaged: true } : a)),
      ledger: [
        {
          id: `evt-mgr-on-${now}`,
          t: now,
          label: `Contratou gerente de operações para ${name}`,
          amount: -MANAGER_HIRE_FEE,
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  buyFuel: (tonnes) => {
    const state = get().state
    if (!state || tonnes <= 0) return
    const affordable = state.cash / state.fuel.price
    const room = state.fuel.capacity - state.fuel.stored
    const amount = Math.min(tonnes, affordable, room)
    if (amount <= 0) return
    const { fuel, cost } = buyFuel(state.fuel, amount)
    const now = Date.now()
    const next: GameState = {
      ...state,
      fuel,
      cash: state.cash - cost,
      ledger: [
        {
          id: `evt-fuel-${now}`,
          t: now,
          label: `Comprou ${Math.round(amount * 1000).toLocaleString('pt-BR')} kg de combustível`,
          amount: -Math.round(cost),
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  upgradeDepot: () => {
    const state = get().state
    if (!state) return
    const upgrade = nextDepotUpgrade(state.fuel.capacity)
    if (!upgrade || state.cash < upgrade.cost) return
    const now = Date.now()
    const next: GameState = {
      ...state,
      cash: state.cash - upgrade.cost,
      fuel: { ...state.fuel, capacity: upgrade.capacity },
      ledger: [
        {
          id: `evt-depot-${now}`,
          t: now,
          label: `Ampliou o depósito para ${Math.round(upgrade.capacity * 1000).toLocaleString('pt-BR')} kg`,
          amount: -upgrade.cost,
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  serviceAircraft: (aircraftId) => {
    const state = get().state
    if (!state) return
    const aircraft = state.fleet.find((a) => a.id === aircraftId)
    if (!aircraft || aircraft.status !== 'idle') return
    const model = findAircraftModel(aircraft.modelId)
    if (!model) return
    const cost = inspectionCost(model.price, aircraft.wear)
    if (state.cash < cost) return
    const now = Date.now()
    const next: GameState = {
      ...state,
      cash: state.cash - cost,
      fleet: state.fleet.map((a) =>
        a.id === aircraftId
          ? {
              ...a,
              status: 'maintenance',
              maintenanceKind: 'inspection',
              maintenanceUntil: now + realFlightMs(INSPECTION_HOURS),
            }
          : a,
      ),
      ledger: [
        {
          id: `evt-check-${now}`,
          t: now,
          label: `Revisão de ${model.name} (${INSPECTION_HOURS}h)`,
          amount: -cost,
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  lightMaintenance: (aircraftId) => {
    const state = get().state
    if (!state) return
    const aircraft = state.fleet.find((a) => a.id === aircraftId)
    if (!aircraft || aircraft.status !== 'idle') return
    const model = findAircraftModel(aircraft.modelId)
    if (!model) return
    const cost = lightMaintenanceCost(model.price, aircraft.wear)
    if (state.cash < cost) return
    const now = Date.now()
    const next: GameState = {
      ...state,
      cash: state.cash - cost,
      fleet: state.fleet.map((a) =>
        a.id === aircraftId
          ? {
              ...a,
              status: 'maintenance',
              maintenanceKind: 'light',
              maintenanceUntil: now + realFlightMs(LIGHT_MAINTENANCE_HOURS),
            }
          : a,
      ),
      ledger: [
        {
          id: `evt-lightmx-${now}`,
          t: now,
          label: `Manutenção leve de ${model.name} (${LIGHT_MAINTENANCE_HOURS}h)`,
          amount: -cost,
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  doTick: () => {
    const state = get().state
    if (!state) return
    const { state: next, landings } = runTick(state)
    set((s) => ({
      state: next,
      landings: landings.length ? [...s.landings, ...landings].slice(-4) : s.landings,
    }))
    persist(next)
  },

  dismissLanding: (id) => {
    set((s) => ({ landings: s.landings.filter((l) => l.id !== id) }))
  },

  listCompany: () => {
    const state = get().state
    if (!state || state.stock.ipoDone || state.cash < STOCK_LISTING_FEE) return
    const { stock, cashGained } = listCompany(state)
    const now = Date.now()
    const next: GameState = {
      ...state,
      stock,
      cash: state.cash - STOCK_LISTING_FEE + cashGained,
      ledger: [
        { id: `evt-list-open-${now}`, t: now, label: 'Abertura de capital na bolsa', amount: cashGained - STOCK_LISTING_FEE },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  finishTutorial: () => {
    const state = get().state
    if (!state) return
    const next: GameState = { ...state, tutorial: 'done' as TutorialStep }
    set({ state: next })
    persist(next)
  },

  resetGame: () => {
    wipeSave()
    set({ state: null, landings: [] })
  },
}))

export function getCompanyValuation(state: GameState): number {
  return computeValuation(state)
}
