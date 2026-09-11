import type { GameState, OwnedAircraft } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { computeValuation } from './stockMarket'
import { clamp, realFlightMs } from './economy'

/** Random events fire rarely (hours apart) and resolve almost immediately — a short shock or bonus, not a lasting condition. */
export const EVENT_MIN_INTERVAL_MS = 4 * 60 * 60 * 1000
export const EVENT_MAX_INTERVAL_MS = 10 * 60 * 60 * 1000
const AOG_DURATION_HOURS = 0.25

export function rollNextEventAt(now: number): number {
  return now + EVENT_MIN_INTERVAL_MS + Math.random() * (EVENT_MAX_INTERVAL_MS - EVENT_MIN_INTERVAL_MS)
}

export interface RandomEventOutcome {
  label: string
  cashDelta: number
  reputationDelta: number
  /** Present only for an 'aog' event — the fleet with one aircraft freshly grounded. */
  fleet?: OwnedAircraft[]
}

type EventKind = 'fuel_spike' | 'strike_delay' | 'incident' | 'aog' | 'demand_boom' | 'good_pr' | 'route_subsidy'

/** A random slice of current valuation, bounded so it stays meaningful early and sane late. */
function valuationShare(state: GameState, minPct: number, maxPct: number, floor: number, cap: number): number {
  const v = Math.max(0, computeValuation(state))
  const pct = minPct + Math.random() * (maxPct - minPct)
  return clamp(v * pct, floor, cap)
}

/** Rolls one random event. Returns null only if nothing could apply (shouldn't happen in practice). */
export function rollRandomEvent(state: GameState, now: number): RandomEventOutcome | null {
  const idleFleet = state.fleet.filter((a) => a.status === 'idle')

  const pool: EventKind[] = ['fuel_spike', 'strike_delay', 'incident', 'demand_boom', 'good_pr', 'route_subsidy']
  if (idleFleet.length > 0) pool.push('aog')
  const kind = pool[Math.floor(Math.random() * pool.length)]

  switch (kind) {
    case 'fuel_spike': {
      const cost = valuationShare(state, 0.003, 0.01, 5_000, 3_000_000)
      return {
        label: 'Pico de combustível: abastecimento emergencial saiu mais caro',
        cashDelta: -cost,
        reputationDelta: 0,
      }
    }
    case 'strike_delay': {
      const cost = valuationShare(state, 0.003, 0.008, 4_000, 2_000_000)
      return {
        label: 'Greve pontual gerou custos de compensação a passageiros',
        cashDelta: -cost,
        reputationDelta: -2,
      }
    }
    case 'incident': {
      return {
        label: 'Incidente operacional gerou repercussão negativa',
        cashDelta: 0,
        reputationDelta: -(8 + Math.random() * 10),
      }
    }
    case 'demand_boom': {
      const gain = valuationShare(state, 0.004, 0.012, 5_000, 4_000_000)
      return {
        label: 'Evento local disparou a procura por passagens — voos saíram lotados',
        cashDelta: gain,
        reputationDelta: 0,
      }
    }
    case 'good_pr': {
      return {
        label: 'Cobertura de imprensa espontânea elevou a reputação',
        cashDelta: 0,
        reputationDelta: 6 + Math.random() * 8,
      }
    }
    case 'route_subsidy': {
      const gain = valuationShare(state, 0.003, 0.01, 4_000, 3_000_000)
      return {
        label: 'Subsídio de rota regional creditado',
        cashDelta: gain,
        reputationDelta: 0,
      }
    }
    case 'aog': {
      const target = idleFleet[Math.floor(Math.random() * idleFleet.length)]
      const model = findAircraftModel(target.modelId)
      const groundedUntil = now + realFlightMs(AOG_DURATION_HOURS)
      const fleet = state.fleet.map((a) =>
        a.id === target.id
          ? { ...a, status: 'maintenance' as const, maintenanceKind: 'aog' as const, maintenanceUntil: groundedUntil }
          : a,
      )
      return {
        label: `Falha técnica tirou ${model?.name ?? 'uma aeronave'} de operação temporariamente`,
        cashDelta: 0,
        reputationDelta: 0,
        fleet,
      }
    }
  }
  return null
}
