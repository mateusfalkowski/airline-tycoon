import { create } from 'zustand'
import type { GameState, OwnedAircraft, Route, SeatClass, SeatConfig, TrainingCategory } from '../types'
import type { TutorialStep } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { routeLegsKm, hasFreeSlot } from '../data/airports'
import {
  planFlight,
  realFlightMs,
  seatUnitsUsed,
  cabinUpfitCost,
  managerCap,
  MANAGER_HIRE_FEE,
  MANAGER_UNLOCK_FLIGHTS,
  checkIntervalHours,
  canLeaseAircraft,
  maintenanceHours,
  inspectionCost,
  lightMaintenanceCost,
  resaleValue,
  CAMPAIGNS,
  CAMPAIGN_COOLDOWN_MS,
  campaignGain,
  REVENUE_TEAM_HIRE_FEE,
  REVENUE_TEAM_UNLOCK_FLIGHTS,
  REVENUE_TEAM_CUT,
  maxLoan,
  STAFF_BONUS_COOLDOWN_MS,
  staffBonusCost,
  staffBonusGain,
  TRAINING_MAX_LEVEL,
  trainingCost,
  TRAINING_LABEL,
} from '../engine/economy'
import { createInitialFuel, buyFuel, nextDepotUpgrade, SAF_PRICE_PREMIUM, SAF_ACTIVATION_REPUTATION_BONUS } from '../engine/fuel'
import { createInitialCO2, buyCO2 } from '../engine/co2'
import { rollNextEventAt } from '../engine/events'
import { tick as runTick, catchUp, dispatchOutcome } from '../engine/simulation'
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
      flight: aircraft.flight,
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
    co2: saved.co2 ?? createInitialCO2(Date.now()),
    tutorial: !rawTutorial || rawTutorial === 'stock_intro' ? 'done' : (rawTutorial as TutorialStep),
    flightsCompleted: saved.flightsCompleted ?? 0,
    lastFixedLogAt: saved.lastFixedLogAt ?? Date.now(),
    revenueTeam: saved.revenueTeam ?? false,
    lastRevenueTuneAt: saved.lastRevenueTuneAt ?? Date.now(),
    debt: saved.debt ?? 0,
    achievedMilestones: saved.achievedMilestones ?? [],
    nextEventAt: saved.nextEventAt ?? rollNextEventAt(Date.now()),
    staffMorale: saved.staffMorale ?? 70,
    training: saved.training ?? { fuel: 0, maintenance: 0, emissions: 0, crew: 0 },
    safEnabled: saved.safEnabled ?? false,
  }
}

interface GameStore {
  state: GameState | null
  landings: FlightLanding[]
  init: () => void
  createCompany: (name: string, hubCode: string) => void
  buyAircraft: (modelId: string, seatConfig?: SeatConfig) => void
  leaseAircraft: (modelId: string, seatConfig?: SeatConfig) => void
  sellAircraft: (aircraftId: string) => void
  createRoute: (
    originCode: string,
    destCode: string,
    aircraftId: string,
    prices: Record<SeatClass, number>,
    viaCode?: string,
  ) => void
  updateRoutePrices: (routeId: string, prices: Record<SeatClass, number>) => void
  deleteRoute: (routeId: string) => void
  dispatchFlight: (routeId: string) => void
  toggleAutoManage: (aircraftId: string) => void
  buyFuel: (litres: number) => void
  toggleSAF: () => void
  buyCO2Quota: (tonnes: number) => void
  upgradeDepot: () => void
  runCampaign: (campaignId: string) => void
  giveStaffBonus: () => void
  investTraining: (category: TrainingCategory) => void
  toggleRevenueTeam: () => void
  takeLoan: (amount: number) => void
  repayLoan: (amount: number) => void
  serviceAircraft: (aircraftId: string) => void
  lightMaintenance: (aircraftId: string) => void
  scheduleMaintenance: (aircraftId: string, kind: 'light' | 'inspection') => void
  doTick: () => void
  dismissLanding: (id: string) => void
  listCompany: () => void
  finishTutorial: () => void
  resetGame: () => void
  importSave: (json: string) => boolean
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
      co2: createInitialCO2(Date.now()),
      fleet: [],
      routes: [],
      stock: createInitialStock(sharePrice),
      ledger: [{ id: 'evt-founding', t: Date.now(), label: `${name} foi fundada em ${hubCode}`, amount: STARTING_CASH }],
      lastSeen: Date.now(),
      tutorial: 'buy_aircraft',
      flightsCompleted: 0,
      lastFixedLogAt: Date.now(),
      revenueTeam: false,
      lastRevenueTuneAt: Date.now(),
      debt: 0,
      achievedMilestones: [],
      nextEventAt: rollNextEventAt(Date.now()),
      staffMorale: 70,
      training: { fuel: 0, maintenance: 0, emissions: 0, crew: 0 },
      safEnabled: false,
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

  leaseAircraft: (modelId, seatConfig) => {
    const state = get().state
    const model = findAircraftModel(modelId)
    if (!state || !model) return
    if (!canLeaseAircraft(model.category, state.flightsCompleted, state.company.reputation)) return

    const config = seatConfig ?? allEconomyConfig(model.seats)
    if (seatUnitsUsed(config) > model.seats) return

    const upfitCost = cabinUpfitCost(config)
    if (state.cash < upfitCost) return

    const aircraft: OwnedAircraft = {
      id: `ac-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      modelId,
      status: 'idle',
      seatConfig: config,
      wear: 0,
      hoursSinceCheck: 0,
      totalHours: 0,
      leased: true,
    }
    const next: GameState = {
      ...state,
      cash: state.cash - upfitCost,
      fleet: [...state.fleet, aircraft],
      ledger: [
        {
          id: `evt-lease-${aircraft.id}`,
          t: Date.now(),
          label: `Arrendou ${model.name}${upfitCost > 0 ? ' (cabine paga à vista)' : ''}`,
          amount: -upfitCost,
        },
        ...state.ledger,
      ].slice(0, 100),
      tutorial: state.tutorial === 'buy_aircraft' ? 'create_route' : state.tutorial,
    }
    set({ state: next })
    persist(next)
  },

  sellAircraft: (aircraftId) => {
    const state = get().state
    if (!state) return
    const aircraft = state.fleet.find((a) => a.id === aircraftId)
    if (!aircraft || aircraft.status !== 'idle') return
    const model = findAircraftModel(aircraft.modelId)
    if (!model) return
    const value = aircraft.leased ? 0 : resaleValue(model.price, aircraft.totalHours, aircraft.wear)
    const now = Date.now()
    const next: GameState = {
      ...state,
      cash: state.cash + value,
      fleet: state.fleet.filter((a) => a.id !== aircraftId),
      routes: state.routes.filter((r) => r.aircraftId !== aircraftId),
      ledger: [
        {
          id: `evt-sell-${now}`,
          t: now,
          label: aircraft.leased ? `Devolveu ${model.name} arrendado` : `Vendeu ${model.name} (usado)`,
          amount: value,
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  createRoute: (originCode, destCode, aircraftId, prices, viaCode) => {
    const state = get().state
    const aircraft = state?.fleet.find((a) => a.id === aircraftId)
    if (!state || !aircraft || originCode === destCode) return
    if (viaCode && (viaCode === originCode || viaCode === destCode)) return

    const legs = routeLegsKm(originCode, destCode, viaCode)
    if (!legs) return
    const model = findAircraftModel(aircraft.modelId)
    if (model && (legs.leg1Km > model.rangeKm || legs.leg2Km > model.rangeKm)) return
    const touchedAirports = [originCode, destCode, viaCode].filter((c): c is string => !!c)
    if (touchedAirports.some((code) => !hasFreeSlot(state.routes, code))) return

    const plan = model ? planFlight(model, legs.leg1Km, legs.leg2Km) : null

    const route: Route = {
      id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originCode,
      destCode,
      viaCode,
      aircraftId,
      prices,
      distanceKm: Math.round(plan?.distanceKm ?? legs.totalKm),
      flightTimeHours: plan?.hours ?? 0,
    }

    const next: GameState = {
      ...state,
      routes: [...state.routes, route],
      tutorial: state.tutorial === 'create_route' ? 'dispatch_flight' : state.tutorial,
    }
    set({ state: next })
    persist(next)
  },

  updateRoutePrices: (routeId, prices) => {
    const state = get().state
    if (!state) return
    const next: GameState = {
      ...state,
      routes: state.routes.map((r) => (r.id === routeId ? { ...r, prices } : r)),
    }
    set({ state: next })
    persist(next)
  },

  deleteRoute: (routeId) => {
    const state = get().state
    if (!state) return
    const route = state.routes.find((r) => r.id === routeId)
    if (!route) return
    const aircraft = state.fleet.find((a) => a.id === route.aircraftId)
    if (aircraft?.status === 'flying') return
    const next: GameState = {
      ...state,
      routes: state.routes.filter((r) => r.id !== routeId),
      fleet: state.fleet.map((a) => (a.id === route.aircraftId ? { ...a, autoManaged: false } : a)),
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
    const model = findAircraftModel(aircraft.modelId)
    if (!model || aircraft.hoursSinceCheck >= checkIntervalHours(model.category)) return

    const now = Date.now()
    const outcome = dispatchOutcome(
      aircraft,
      route,
      state.fuel,
      state.co2,
      state.company.reputation,
      now,
      state.revenueTeam ? REVENUE_TEAM_CUT : 0,
      state.training,
      state.safEnabled,
    )
    if (!outcome) return

    const next: GameState = {
      ...state,
      cash: state.cash + outcome.cashDelta,
      fuel: outcome.fuel,
      co2: outcome.co2,
      company: {
        ...state.company,
        reputation: Math.min(100, Math.max(0, state.company.reputation + outcome.reputationDelta)),
      },
      fleet: state.fleet.map((a) =>
        a.id === aircraft.id ? { ...a, status: 'flying', flight: outcome.flight, homeSide: outcome.homeSide } : a,
      ),
      routes: state.routes.map((r) => (r.id === route.id ? { ...r, loyalty: outcome.routeLoyalty } : r)),
      ledger: [outcome.ledger, ...state.ledger].slice(0, 100),
      tutorial: state.tutorial === 'dispatch_flight' ? 'done' : state.tutorial,
    }
    set((s) => ({ state: next, landings: [...s.landings, outcome.landing].slice(-4) }))
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
    const priceMult = state.safEnabled ? SAF_PRICE_PREMIUM : 1
    const affordable = state.cash / (state.fuel.price * priceMult)
    const room = state.fuel.capacity - state.fuel.stored
    const amount = Math.min(tonnes, affordable, room)
    if (amount <= 0) return
    const { fuel, cost } = buyFuel(state.fuel, amount, priceMult)
    const now = Date.now()
    const next: GameState = {
      ...state,
      fuel,
      cash: state.cash - cost,
      ledger: [
        {
          id: `evt-fuel-${now}`,
          t: now,
          label: `Comprou ${Math.round(amount * 1000).toLocaleString('pt-BR')} kg de combustível${state.safEnabled ? ' (SAF)' : ''}`,
          amount: -Math.round(cost),
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  toggleSAF: () => {
    const state = get().state
    if (!state) return
    const now = Date.now()
    const turningOn = !state.safEnabled
    const next: GameState = {
      ...state,
      safEnabled: turningOn,
      company: turningOn
        ? { ...state.company, reputation: Math.min(100, state.company.reputation + SAF_ACTIVATION_REPUTATION_BONUS) }
        : state.company,
      ledger: turningOn
        ? [
            {
              id: `evt-saf-${now}`,
              t: now,
              label: `Passou a usar combustível sustentável, SAF (+${SAF_ACTIVATION_REPUTATION_BONUS} reputação)`,
              amount: 0,
            },
            ...state.ledger,
          ].slice(0, 100)
        : state.ledger,
    }
    set({ state: next })
    persist(next)
  },

  buyCO2Quota: (tonnes) => {
    const state = get().state
    if (!state || tonnes <= 0) return
    const affordable = state.cash / state.co2.price
    const room = state.co2.capacity - state.co2.stored
    const amount = Math.min(tonnes, affordable, room)
    if (amount <= 0) return
    const { co2, cost } = buyCO2(state.co2, amount)
    const now = Date.now()
    const next: GameState = {
      ...state,
      co2,
      cash: state.cash - cost,
      ledger: [
        {
          id: `evt-co2-${now}`,
          t: now,
          label: `Comprou ${amount.toFixed(1)} t de cota de CO2`,
          amount: -Math.round(cost),
        },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  toggleRevenueTeam: () => {
    const state = get().state
    if (!state) return
    const now = Date.now()
    if (state.revenueTeam) {
      const next: GameState = {
        ...state,
        revenueTeam: false,
        ledger: [
          { id: `evt-rm-off-${now}`, t: now, label: 'Dispensou a equipe de revenue', amount: 0 },
          ...state.ledger,
        ].slice(0, 100),
      }
      set({ state: next })
      persist(next)
      return
    }
    if (state.flightsCompleted < REVENUE_TEAM_UNLOCK_FLIGHTS || state.cash < REVENUE_TEAM_HIRE_FEE) return
    const next: GameState = {
      ...state,
      revenueTeam: true,
      cash: state.cash - REVENUE_TEAM_HIRE_FEE,
      lastRevenueTuneAt: now,
      ledger: [
        { id: `evt-rm-on-${now}`, t: now, label: 'Contratou a equipe de revenue', amount: -REVENUE_TEAM_HIRE_FEE },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  takeLoan: (amount) => {
    const state = get().state
    if (!state) return
    const ceiling = maxLoan(computeValuation(state), state.debt)
    const draw = Math.min(Math.floor(amount), ceiling)
    if (draw <= 0) return
    const now = Date.now()
    const next: GameState = {
      ...state,
      cash: state.cash + draw,
      debt: state.debt + draw,
      ledger: [
        { id: `evt-loan-${now}`, t: now, label: 'Empréstimo contratado', amount: draw },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  repayLoan: (amount) => {
    const state = get().state
    if (!state) return
    const pay = Math.min(Math.floor(amount), state.debt, Math.floor(state.cash))
    if (pay <= 0) return
    const now = Date.now()
    const next: GameState = {
      ...state,
      cash: state.cash - pay,
      debt: state.debt - pay,
      ledger: [
        { id: `evt-repay-${now}`, t: now, label: 'Amortização de dívida', amount: -pay },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  runCampaign: (campaignId) => {
    const state = get().state
    if (!state) return
    const c = CAMPAIGNS.find((x) => x.id === campaignId)
    if (!c || state.cash < c.cost) return
    const now = Date.now()
    if ((state.company.campaignReadyAt ?? 0) > now) return
    const gain = campaignGain(c.gain, state.company.reputation)
    const next: GameState = {
      ...state,
      cash: state.cash - c.cost,
      company: {
        ...state.company,
        reputation: Math.min(100, state.company.reputation + gain),
        campaignReadyAt: now + CAMPAIGN_COOLDOWN_MS,
      },
      ledger: [
        { id: `evt-mkt-${now}`, t: now, label: `Campanha de marketing ${c.name} (+${gain} reputação)`, amount: -c.cost },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  giveStaffBonus: () => {
    const state = get().state
    if (!state) return
    const cost = staffBonusCost(state.fleet.length)
    if (state.cash < cost) return
    const now = Date.now()
    if ((state.company.staffBonusReadyAt ?? 0) > now) return
    const gain = staffBonusGain(state.staffMorale)
    const next: GameState = {
      ...state,
      cash: state.cash - cost,
      company: { ...state.company, staffBonusReadyAt: now + STAFF_BONUS_COOLDOWN_MS },
      staffMorale: Math.min(100, state.staffMorale + gain),
      ledger: [
        { id: `evt-staff-${now}`, t: now, label: `Bônus para a equipe (+${gain} moral)`, amount: -cost },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  investTraining: (category) => {
    const state = get().state
    if (!state) return
    const level = state.training[category]
    if (level >= TRAINING_MAX_LEVEL) return
    const cost = trainingCost(level)
    if (state.cash < cost) return
    const now = Date.now()
    const next: GameState = {
      ...state,
      cash: state.cash - cost,
      training: { ...state.training, [category]: level + 1 },
      ledger: [
        {
          id: `evt-training-${now}`,
          t: now,
          label: `Treinamento: ${TRAINING_LABEL[category]} (nível ${level + 1})`,
          amount: -cost,
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
    const hrs = maintenanceHours(model.category, 'inspection')
    const next: GameState = {
      ...state,
      cash: state.cash - cost,
      fleet: state.fleet.map((a) =>
        a.id === aircraftId
          ? {
              ...a,
              status: 'maintenance',
              maintenanceKind: 'inspection',
              maintenanceUntil: now + realFlightMs(hrs),
            }
          : a,
      ),
      ledger: [
        { id: `evt-check-${now}`, t: now, label: `Revisão de ${model.name} (${hrs}h)`, amount: -cost },
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
    const hrs = maintenanceHours(model.category, 'light')
    const next: GameState = {
      ...state,
      cash: state.cash - cost,
      fleet: state.fleet.map((a) =>
        a.id === aircraftId
          ? {
              ...a,
              status: 'maintenance',
              maintenanceKind: 'light',
              maintenanceUntil: now + realFlightMs(hrs),
            }
          : a,
      ),
      ledger: [
        { id: `evt-lightmx-${now}`, t: now, label: `Manutenção leve de ${model.name} (${hrs}h)`, amount: -cost },
        ...state.ledger,
      ].slice(0, 100),
    }
    set({ state: next })
    persist(next)
  },

  /** While the aircraft is on the ground, does the maintenance right away — same as the actions
   *  above. While it's flying, queues it instead: the moment it lands it goes straight into the
   *  shop, no need to come back and click again. Clicking the same kind again cancels it. */
  scheduleMaintenance: (aircraftId, kind) => {
    const state = get().state
    if (!state) return
    const aircraft = state.fleet.find((a) => a.id === aircraftId)
    if (!aircraft || aircraft.status === 'maintenance') return

    if (aircraft.status === 'idle') {
      if (kind === 'inspection') get().serviceAircraft(aircraftId)
      else get().lightMaintenance(aircraftId)
      return
    }

    const next: GameState = {
      ...state,
      fleet: state.fleet.map((a) =>
        a.id === aircraftId
          ? { ...a, scheduledMaintenance: a.scheduledMaintenance === kind ? undefined : kind }
          : a,
      ),
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

  importSave: (json) => {
    let parsed: GameState
    try {
      parsed = JSON.parse(json) as GameState
    } catch {
      return false
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.fleet) || !Array.isArray(parsed.routes) || !parsed.company) {
      return false
    }
    const migrated = migrateState(parsed)
    const { state: caughtUp, landings } = catchUp(migrated)
    set({ state: caughtUp, landings: landings.slice(-4) })
    persist(caughtUp)
    return true
  },
}))

export function getCompanyValuation(state: GameState): number {
  return computeValuation(state)
}
