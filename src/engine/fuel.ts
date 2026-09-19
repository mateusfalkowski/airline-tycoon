import type { FuelState } from '../types'
import { clamp } from './economy'

/** How often the spot price moves. Prices are $ per tonne (1000 kg); depot amounts are tonnes. */
export const FUEL_PRICE_INTERVAL_MS = 15 * 60 * 1000
export const FUEL_MIN_PRICE = 450
export const FUEL_MAX_PRICE = 1600
export const FUEL_START_PRICE = 800
const HISTORY_LIMIT = 96

export const DEPOT_TIERS: { capacity: number; cost: number }[] = [
  { capacity: 300, cost: 0 },
  { capacity: 800, cost: 900_000 },
  { capacity: 2_000, cost: 2_400_000 },
  { capacity: 5_000, cost: 6_000_000 },
  { capacity: 12_000, cost: 14_000_000 },
]

export function nextDepotUpgrade(capacity: number): { capacity: number; cost: number } | null {
  return DEPOT_TIERS.find((tier) => tier.capacity > capacity) ?? null
}

/** Sustainable Aviation Fuel: costs more at the pump, burns cleaner. A standing choice, not a
 *  one-off purchase — every buy while it's on pays the premium, every flight while it's on
 *  emits less. */
export const SAF_PRICE_PREMIUM = 1.5
export const SAF_EMISSIONS_CUT = 0.6
export const SAF_ACTIVATION_REPUTATION_BONUS = 5

export function createInitialFuel(now: number): FuelState {
  const history: { t: number; price: number }[] = []
  let price = FUEL_START_PRICE
  // Seed ~12 steps of history so the chart isn't empty on day one.
  for (let i = 12; i >= 1; i--) {
    history.push({ t: now - i * FUEL_PRICE_INTERVAL_MS, price })
    price = walkFuelPrice(price)
  }
  history.push({ t: now, price })

  return {
    stored: 0,
    capacity: DEPOT_TIERS[0].capacity,
    avgCost: price,
    price,
    history,
    lastPriceTick: now,
  }
}

export function walkFuelPrice(price: number): number {
  const drift = (FUEL_START_PRICE - price) * 0.05
  const shock = price * (Math.random() - 0.5) * 0.14
  return clamp(price + drift + shock, FUEL_MIN_PRICE, FUEL_MAX_PRICE)
}

/** Applies every price step that should have happened since `lastPriceTick`. */
export function advanceFuelMarket(fuel: FuelState, now: number): FuelState {
  const steps = Math.floor((now - fuel.lastPriceTick) / FUEL_PRICE_INTERVAL_MS)
  if (steps <= 0) return fuel

  let price = fuel.price
  const history = [...fuel.history]
  for (let i = 1; i <= steps; i++) {
    price = walkFuelPrice(price)
    history.push({ t: fuel.lastPriceTick + i * FUEL_PRICE_INTERVAL_MS, price })
  }

  return {
    ...fuel,
    price,
    history: history.slice(-HISTORY_LIMIT),
    lastPriceTick: fuel.lastPriceTick + steps * FUEL_PRICE_INTERVAL_MS,
  }
}

/** Adds `litres` bought at the current spot price into the depot, blending the average cost.
 *  `priceMult` applies the SAF premium when buying sustainable fuel. */
export function buyFuel(fuel: FuelState, litres: number, priceMult = 1): { fuel: FuelState; cost: number } {
  const room = Math.max(0, fuel.capacity - fuel.stored)
  const amount = clamp(litres, 0, room)
  const effectivePrice = fuel.price * priceMult
  const cost = amount * effectivePrice
  const stored = fuel.stored + amount
  const avgCost = stored > 0 ? (fuel.stored * fuel.avgCost + amount * effectivePrice) / stored : effectivePrice
  return { fuel: { ...fuel, stored, avgCost }, cost }
}

/** Draws `litres` for a flight — from the depot first, the rest at spot price. */
export function drawFuel(fuel: FuelState, litres: number): { fuel: FuelState; cost: number } {
  const fromDepot = Math.min(litres, fuel.stored)
  const fromSpot = litres - fromDepot
  const cost = fromDepot * fuel.avgCost + fromSpot * fuel.price
  return { fuel: { ...fuel, stored: fuel.stored - fromDepot }, cost }
}

/** Local fuel price, as a multiple of the home spot price — taxes, subsidies and how far fuel
 *  has to travel vary a lot by country in reality. Only matters away from base: the depot only
 *  exists at the hub, so a flight departing from the other end of the route can't draw on it and
 *  buys locally instead, at whatever this country charges. Unlisted countries pay the base rate. */
export const FUEL_COUNTRY_MULTIPLIER: Record<string, number> = {
  Brasil: 1.05,
  EUA: 0.95,
  México: 1.0,
  Colômbia: 1.05,
  Chile: 1.0,
  Argentina: 1.15,
  Portugal: 1.1,
  Espanha: 1.05,
  'Reino Unido': 1.15,
  França: 1.1,
  Alemanha: 1.1,
  'Países Baixos': 1.05,
  EAU: 0.75,
  'África do Sul': 1.1,
  Japão: 1.2,
  Singapura: 0.85,
  Austrália: 1.15,
  Panamá: 0.9,
  Peru: 1.05,
  Uruguai: 1.0,
  Canadá: 1.0,
  'Cabo Verde': 1.25,
  Senegal: 1.2,
  Turquia: 1.05,
  Egito: 1.0,
  Catar: 0.7,
  Índia: 1.1,
  Tailândia: 1.0,
  'Hong Kong': 0.9,
  Venezuela: 0.6,
  Equador: 0.95,
}

export function fuelCountryMultiplier(country: string): number {
  return FUEL_COUNTRY_MULTIPLIER[country] ?? 1
}
