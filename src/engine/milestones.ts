import type { GameState } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { findAirport } from '../data/airports'
import { computeValuation } from './stockMarket'

export interface Milestone {
  id: string
  label: string
  check: (state: GameState) => boolean
}

export const MILESTONES: Milestone[] = [
  { id: 'first_flight', label: 'Primeiro voo despachado', check: (s) => s.flightsCompleted >= 1 },
  { id: 'flights_10', label: '10 voos concluídos', check: (s) => s.flightsCompleted >= 10 },
  { id: 'flights_50', label: '50 voos concluídos', check: (s) => s.flightsCompleted >= 50 },
  { id: 'flights_100', label: '100 voos concluídos', check: (s) => s.flightsCompleted >= 100 },
  { id: 'flights_500', label: '500 voos concluídos', check: (s) => s.flightsCompleted >= 500 },
  { id: 'fleet_5', label: 'Frota de 5 aeronaves', check: (s) => s.fleet.length >= 5 },
  { id: 'fleet_10', label: 'Frota de 10 aeronaves', check: (s) => s.fleet.length >= 10 },
  { id: 'routes_5', label: '5 rotas simultâneas', check: (s) => s.routes.length >= 5 },
  {
    id: 'widebody',
    label: 'Operou uma aeronave widebody',
    check: (s) => s.fleet.some((a) => findAircraftModel(a.modelId)?.category === 'widebody'),
  },
  {
    id: 'international',
    label: 'Abriu uma rota internacional',
    check: (s) =>
      s.routes.some((r) => {
        const origin = findAirport(r.originCode)
        const dest = findAirport(r.destCode)
        if (!origin || !dest) return false
        return origin.country !== dest.country
      }),
  },
  { id: 'reputation_max', label: 'Reputação máxima', check: (s) => s.company.reputation >= 100 },
  { id: 'manager', label: 'Contratou um gerente de operações', check: (s) => s.fleet.some((a) => a.autoManaged) },
  { id: 'revenue_team', label: 'Contratou a equipe de revenue', check: (s) => s.revenueTeam },
  { id: 'ipo', label: 'Abriu capital na bolsa', check: (s) => s.stock.ipoDone },
  { id: 'valuation_50m', label: 'Valuation de $50 milhões', check: (s) => computeValuation(s) >= 50_000_000 },
  { id: 'valuation_100m', label: 'Valuation de $100 milhões', check: (s) => computeValuation(s) >= 100_000_000 },
  { id: 'valuation_250m', label: 'Valuation de $250 milhões', check: (s) => computeValuation(s) >= 250_000_000 },
  { id: 'valuation_1b', label: 'Valuation de $1 bilhão', check: (s) => computeValuation(s) >= 1_000_000_000 },
]

/** Folds any newly-satisfied milestones into state.achievedMilestones. Never un-achieves one. */
export function updateMilestones(state: GameState): GameState {
  const already = state.achievedMilestones ?? []
  const next = [...already]
  let changed = false
  for (const m of MILESTONES) {
    if (!already.includes(m.id) && m.check(state)) {
      next.push(m.id)
      changed = true
    }
  }
  return changed ? { ...state, achievedMilestones: next } : state
}
