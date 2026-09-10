import { create } from 'zustand'
import type { GameState, OwnedAircraft, Route, SeatClass, SeatConfig } from '../types'
import type { TutorialStep } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { findAirport } from '../data/airports'
import { distanceKm } from '../engine/geo'
import {
  flightTimeHours,
  realFlightMs,
  BASE_FUEL_PRICE,
  seatUnitsUsed,
  cabinUpfitCost,
  managerCap,
  MANAGER_HIRE_FEE,
  MANAGER_UNLOCK_FLIGHTS,
} from '../engine/economy'
import { tick as runTick, catchUp } from '../engine/simulation'
import type { FlightLanding } from '../engine/simulation'
import { createInitialStock, computeValuation, ipo, sellShares, buyBackShares } from '../engine/stockMarket'
import { loadGame, saveGame, wipeSave } from '../engine/persistence'
import { INITIAL_TOTAL_SHARES } from '../engine/stockMarket'

const STARTING_CASH = 25_000_000

function allEconomyConfig(seats: number): SeatConfig {
  return { economy: seats, business: 0, first: 0 }
}

function migrateState(saved: GameState): GameState {
  const fleet = saved.fleet.map((aircraft) => {
    if (aircraft.seatConfig) return aircraft
    const model = findAircraftModel(aircraft.modelId)
    return { ...aircraft, seatConfig: allEconomyConfig(model?.seats ?? 0) }
  })

  const routes = saved.routes.map((route) => {
    if (route.prices) return route
    const legacyPrice = (route as unknown as { ticketPrice?: number }).ticketPrice ?? 0
    return { ...route, prices: { economy: legacyPrice, business: 0, first: 0 } }
  })

  return {
    ...saved,
    fleet,
    routes,
    tutorial: saved.tutorial ?? 'done',
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
  doTick: () => void
  dismissLanding: (id: string) => void
  doIpo: (floatPercent: number) => void
  doSellShares: (shares: number) => void
  doBuyBackShares: (shares: number) => void
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
      fuelPrice: BASE_FUEL_PRICE,
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

    const now = Date.now()
    const arrivesAt = now + realFlightMs(route.flightTimeHours)
    const next: GameState = {
      ...state,
      fleet: state.fleet.map((a) =>
        a.id === aircraft.id ? { ...a, status: 'flying', flight: { routeId, departedAt: now, arrivesAt } } : a,
      ),
      tutorial: state.tutorial === 'dispatch_flight' ? 'stock_intro' : state.tutorial,
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

  doIpo: (floatPercent) => {
    const state = get().state
    if (!state || state.stock.ipoDone) return
    const { stock, cashGained } = ipo(state, floatPercent)
    const next: GameState = {
      ...state,
      stock,
      cash: state.cash + cashGained,
      ledger: [
        { id: `evt-ipo-${Date.now()}`, t: Date.now(), label: `IPO: ${floatPercent}% das ações na bolsa`, amount: cashGained },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  doSellShares: (shares) => {
    const state = get().state
    if (!state) return
    const { stock, cashGained } = sellShares(state, shares)
    const next: GameState = {
      ...state,
      stock,
      cash: state.cash + cashGained,
      ledger: [
        { id: `evt-sell-${Date.now()}`, t: Date.now(), label: `Vendeu ${shares.toLocaleString('pt-BR')} ações`, amount: cashGained },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  doBuyBackShares: (shares) => {
    const state = get().state
    if (!state) return
    const { stock, cashSpent } = buyBackShares(state, shares)
    const next: GameState = {
      ...state,
      stock,
      cash: state.cash - cashSpent,
      ledger: [
        { id: `evt-buyback-${Date.now()}`, t: Date.now(), label: `Recomprou ${shares.toLocaleString('pt-BR')} ações`, amount: -cashSpent },
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
