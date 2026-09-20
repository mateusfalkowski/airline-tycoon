import type { GameState, OwnedAircraft } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { computeValuation, fleetValue } from './stockMarket'
import { clamp, realFlightMs, INSURANCE_CASH_RELIEF, INSURANCE_DOWNTIME_RELIEF } from './economy'

/** Random events fire rarely (hours apart) and resolve almost immediately — a short shock or bonus, not a lasting condition. */
export const EVENT_MIN_INTERVAL_MS = 4 * 60 * 60 * 1000
export const EVENT_MAX_INTERVAL_MS = 10 * 60 * 60 * 1000
const AOG_DURATION_HOURS = 0.25
const WEATHER_DURATION_HOURS = 0.5

export function rollNextEventAt(now: number): number {
  return now + EVENT_MIN_INTERVAL_MS + Math.random() * (EVENT_MAX_INTERVAL_MS - EVENT_MIN_INTERVAL_MS)
}

export interface RandomEventOutcome {
  label: string
  cashDelta: number
  reputationDelta: number
  moraleDelta: number
  /** Present only for an 'aog' or 'weather' event — the fleet with one aircraft freshly grounded. */
  fleet?: OwnedAircraft[]
}

type EventKind =
  | 'fuel_spike'
  | 'strike_delay'
  | 'incident'
  | 'aog'
  | 'weather'
  | 'demand_boom'
  | 'good_pr'
  | 'route_subsidy'

/** A random slice of current valuation, bounded so it stays meaningful early and sane late. */
function valuationShare(state: GameState, minPct: number, maxPct: number, floor: number, cap: number): number {
  const v = Math.max(0, computeValuation(state))
  const pct = minPct + Math.random() * (maxPct - minPct)
  return clamp(v * pct, floor, cap)
}

/** A random slice of fleet value — unlike valuationShare, ignores cash on hand, so a fresh
 *  company sitting on its starting capital (with a tiny fleet so far) isn't taxed as if that
 *  unspent cash were operational scale. Used for costs that should scale with what you actually
 *  fly, not what's in the bank. */
function fleetShare(state: GameState, minPct: number, maxPct: number, floor: number, cap: number): number {
  const v = Math.max(0, fleetValue(state))
  const pct = minPct + Math.random() * (maxPct - minPct)
  return clamp(v * pct, floor, cap)
}

/** Rolls one random event. Returns null only if nothing could apply (shouldn't happen in practice).
 *  `insured` softens the downside — less cash lost, shorter groundings — but never touches
 *  reputation or morale hits, or the upside events; a policy doesn't fix your name. */
export function rollRandomEvent(state: GameState, now: number, insured: boolean): RandomEventOutcome | null {
  const idleFleet = state.fleet.filter((a) => a.status === 'idle')
  const cashMult = insured ? 1 - INSURANCE_CASH_RELIEF : 1
  const downtimeMult = insured ? 1 - INSURANCE_DOWNTIME_RELIEF : 1

  const pool: EventKind[] = ['fuel_spike', 'strike_delay', 'incident', 'demand_boom', 'good_pr', 'route_subsidy']
  if (idleFleet.length > 0) pool.push('aog', 'weather')
  // Low staff morale makes a strike more likely to be the one that fires — none at the starting
  // 70 morale or above (a new company shouldn't already be strike-prone), up to +5 extra entries
  // as it drops toward 0, so managing morale actually lowers the odds.
  const strikeWeight = Math.max(0, Math.round((70 - state.staffMorale) / 15))
  for (let i = 0; i < strikeWeight; i++) pool.push('strike_delay')
  const kind = pool[Math.floor(Math.random() * pool.length)]

  switch (kind) {
    case 'fuel_spike': {
      const cost = fleetShare(state, 0.003, 0.01, 5_000, 3_000_000) * cashMult
      return {
        label: `Pico de combustível: abastecimento emergencial saiu mais caro${insured ? ' (seguro cobriu parte)' : ''}`,
        cashDelta: -cost,
        reputationDelta: 0,
        moraleDelta: 0,
      }
    }
    case 'strike_delay': {
      const cost = fleetShare(state, 0.003, 0.008, 4_000, 2_000_000) * cashMult
      return {
        label: `Greve pontual gerou custos de compensação a passageiros${insured ? ' (seguro cobriu parte)' : ''}`,
        cashDelta: -cost,
        reputationDelta: -2,
        moraleDelta: -(6 + Math.random() * 8),
      }
    }
    case 'incident': {
      return {
        label: 'Incidente operacional gerou repercussão negativa',
        cashDelta: 0,
        reputationDelta: -(8 + Math.random() * 10),
        moraleDelta: -(4 + Math.random() * 6),
      }
    }
    case 'demand_boom': {
      const gain = valuationShare(state, 0.004, 0.012, 5_000, 4_000_000)
      return {
        label: 'Evento local disparou a procura por passagens — voos saíram lotados',
        cashDelta: gain,
        reputationDelta: 0,
        moraleDelta: 0,
      }
    }
    case 'good_pr': {
      return {
        label: 'Cobertura de imprensa espontânea elevou a reputação',
        cashDelta: 0,
        reputationDelta: 6 + Math.random() * 8,
        moraleDelta: 4 + Math.random() * 6,
      }
    }
    case 'route_subsidy': {
      const gain = valuationShare(state, 0.003, 0.01, 4_000, 3_000_000)
      return {
        label: 'Subsídio de rota regional creditado',
        cashDelta: gain,
        reputationDelta: 0,
        moraleDelta: 0,
      }
    }
    case 'aog': {
      const target = idleFleet[Math.floor(Math.random() * idleFleet.length)]
      const model = findAircraftModel(target.modelId)
      const groundedUntil = now + realFlightMs(AOG_DURATION_HOURS * downtimeMult)
      const fleet = state.fleet.map((a) =>
        a.id === target.id
          ? { ...a, status: 'maintenance' as const, maintenanceKind: 'aog' as const, maintenanceUntil: groundedUntil }
          : a,
      )
      return {
        label: `Falha técnica tirou ${model?.name ?? 'uma aeronave'} de operação temporariamente${insured ? ' (seguro agilizou o reparo)' : ''}`,
        cashDelta: 0,
        reputationDelta: 0,
        moraleDelta: 0,
        fleet,
      }
    }
    case 'weather': {
      const target = idleFleet[Math.floor(Math.random() * idleFleet.length)]
      const model = findAircraftModel(target.modelId)
      const fee = fleetShare(state, 0.001, 0.003, 1_000, 600_000) * cashMult
      const groundedUntil = now + realFlightMs(WEATHER_DURATION_HOURS * downtimeMult)
      const fleet = state.fleet.map((a) =>
        a.id === target.id
          ? { ...a, status: 'maintenance' as const, maintenanceKind: 'weather' as const, maintenanceUntil: groundedUntil }
          : a,
      )
      return {
        label: `Tempestade atrasou ${model?.name ?? 'uma aeronave'} — taxa de degelo cobrada antes da liberação${insured ? ' (seguro cobriu parte)' : ''}`,
        cashDelta: -fee,
        reputationDelta: 0,
        moraleDelta: 0,
        fleet,
      }
    }
  }
  return null
}
