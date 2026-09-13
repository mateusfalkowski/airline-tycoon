import type { CO2State } from '../types'
import { clamp } from './economy'

/** How often the spot price moves. Prices are $ per tonne of CO2; held amounts are tonnes. */
export const CO2_PRICE_INTERVAL_MS = 20 * 60 * 1000
export const CO2_MIN_PRICE = 15
export const CO2_MAX_PRICE = 65
export const CO2_START_PRICE = 30
export const CO2_CAPACITY = 400
const HISTORY_LIMIT = 96

/** kg of CO2 released per kg of jet fuel burned — the standard ICAO/IPCC emission factor. */
export const CO2_PER_FUEL_TONNE = 3.16

export function createInitialCO2(now: number): CO2State {
  const history: { t: number; price: number }[] = []
  let price = CO2_START_PRICE
  for (let i = 12; i >= 1; i--) {
    history.push({ t: now - i * CO2_PRICE_INTERVAL_MS, price })
    price = walkCO2Price(price)
  }
  history.push({ t: now, price })

  return {
    stored: 0,
    capacity: CO2_CAPACITY,
    avgCost: price,
    price,
    history,
    lastPriceTick: now,
  }
}

export function walkCO2Price(price: number): number {
  const drift = (CO2_START_PRICE - price) * 0.05
  const shock = price * (Math.random() - 0.5) * 0.12
  return clamp(price + drift + shock, CO2_MIN_PRICE, CO2_MAX_PRICE)
}

/** Applies every price step that should have happened since `lastPriceTick`. */
export function advanceCO2Market(co2: CO2State, now: number): CO2State {
  const steps = Math.floor((now - co2.lastPriceTick) / CO2_PRICE_INTERVAL_MS)
  if (steps <= 0) return co2

  let price = co2.price
  const history = [...co2.history]
  for (let i = 1; i <= steps; i++) {
    price = walkCO2Price(price)
    history.push({ t: co2.lastPriceTick + i * CO2_PRICE_INTERVAL_MS, price })
  }

  return {
    ...co2,
    price,
    history: history.slice(-HISTORY_LIMIT),
    lastPriceTick: co2.lastPriceTick + steps * CO2_PRICE_INTERVAL_MS,
  }
}

/** Adds `tonnes` of quota bought at the current spot price, blending the average cost. */
export function buyCO2(co2: CO2State, tonnes: number): { co2: CO2State; cost: number } {
  const room = Math.max(0, co2.capacity - co2.stored)
  const amount = clamp(tonnes, 0, room)
  const cost = amount * co2.price
  const stored = co2.stored + amount
  const avgCost = stored > 0 ? (co2.stored * co2.avgCost + amount * co2.price) / stored : co2.price
  return { co2: { ...co2, stored, avgCost }, cost }
}

/** Draws `tonnes` of quota for a flight's emissions — from stock first, the rest at spot price. */
export function drawCO2(co2: CO2State, tonnes: number): { co2: CO2State; cost: number } {
  const fromStock = Math.min(tonnes, co2.stored)
  const fromSpot = tonnes - fromStock
  const cost = fromStock * co2.avgCost + fromSpot * co2.price
  return { co2: { ...co2, stored: co2.stored - fromStock }, cost }
}
