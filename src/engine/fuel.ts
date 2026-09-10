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

/** Adds `litres` bought at the current spot price into the depot, blending the average cost. */
export function buyFuel(fuel: FuelState, litres: number): { fuel: FuelState; cost: number } {
  const room = Math.max(0, fuel.capacity - fuel.stored)
  const amount = clamp(litres, 0, room)
  const cost = amount * fuel.price
  const stored = fuel.stored + amount
  const avgCost = stored > 0 ? (fuel.stored * fuel.avgCost + amount * fuel.price) / stored : fuel.price
  return { fuel: { ...fuel, stored, avgCost }, cost }
}

/** Draws `litres` for a flight — from the depot first, the rest at spot price. */
export function drawFuel(fuel: FuelState, litres: number): { fuel: FuelState; cost: number } {
  const fromDepot = Math.min(litres, fuel.stored)
  const fromSpot = litres - fromDepot
  const cost = fromDepot * fuel.avgCost + fromSpot * fuel.price
  return { fuel: { ...fuel, stored: fuel.stored - fromDepot }, cost }
}
