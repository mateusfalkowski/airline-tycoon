import type { AircraftModel, SeatClass, SeatConfig } from '../types'

export const TAXI_OVERHEAD_HOURS = 0.3
export const BASE_FUEL_PRICE = 0.7

/** A flight takes its full real-world duration — use the operations manager to run
 *  routes while you're away. */
export function realFlightMs(flightTimeHours: number): number {
  return flightTimeHours * 60 * 60 * 1000
}

/** Operations manager (auto-dispatch) economics. */
export const MANAGER_HIRE_FEE = 180_000
export const MANAGER_FLAT_FEE = 1_000
export const MANAGER_REVENUE_CUT = 0.04
export const MANAGER_UNLOCK_FLIGHTS = 12

/** How many aircraft you may put on auto-dispatch, given completed flights. */
export function managerCap(flightsCompleted: number): number {
  return 1 + Math.floor(flightsCompleted / 20)
}

/** Per-flight cost of an auto-dispatched flight, taken out of that flight's profit. */
export function managerFee(revenue: number): number {
  return MANAGER_FLAT_FEE + MANAGER_REVENUE_CUT * revenue
}

export const SEAT_CLASSES: SeatClass[] = ['economy', 'business', 'first']

export const SEAT_UNIT: Record<SeatClass, number> = { economy: 1, business: 2, first: 4 }

export const CABIN_UPFIT_COST: Record<SeatClass, number> = { economy: 0, business: 50_000, first: 150_000 }

export const CLASS_FARE_MULT: Record<SeatClass, number> = { economy: 1, business: 2.2, first: 4 }

export function flightTimeHours(distanceKm: number, cruiseSpeedKmh: number): number {
  return distanceKm / cruiseSpeedKmh + TAXI_OVERHEAD_HOURS
}

export function fairPrice(distanceKm: number): number {
  return 25 + 0.09 * distanceKm
}

export function fairPriceForClass(distanceKm: number, cls: SeatClass): number {
  return fairPrice(distanceKm) * CLASS_FARE_MULT[cls]
}

/** Expected load factor for a class at a given price (no random noise) — used for UI previews. */
export function estimateLoadFactor(distanceKm: number, cls: SeatClass, price: number, reputation: number): number {
  const priceRatio = price / fairPriceForClass(distanceKm, cls)
  const reputationFactor = 0.6 + (reputation / 100) * 0.4
  return clamp(reputationFactor * (1.15 - 0.5 * (priceRatio - 1)), 0.05, 0.98)
}

export function seatUnitsUsed(config: SeatConfig): number {
  return SEAT_CLASSES.reduce((sum, cls) => sum + config[cls] * SEAT_UNIT[cls], 0)
}

export function cabinUpfitCost(config: SeatConfig): number {
  return SEAT_CLASSES.reduce((sum, cls) => sum + config[cls] * CABIN_UPFIT_COST[cls], 0)
}

export function totalSeatCount(config: SeatConfig): number {
  return SEAT_CLASSES.reduce((sum, cls) => sum + config[cls], 0)
}

export interface ClassResult {
  passengers: number
  loadFactor: number
  revenue: number
}

export interface FlightResult {
  classes: Record<SeatClass, ClassResult>
  passengers: number
  loadFactor: number
  revenue: number
  fuelCost: number
  maintenanceCost: number
  profit: number
  reputationDelta: number
}

export function simulateFlight(
  model: AircraftModel,
  distanceKm: number,
  seatConfig: SeatConfig,
  prices: Record<SeatClass, number>,
  demand: Record<SeatClass, number>,
  reputation: number,
  fuelPrice: number,
): FlightResult {
  const hours = flightTimeHours(distanceKm, model.cruiseSpeedKmh)
  const reputationFactor = 0.6 + (reputation / 100) * 0.4
  const noise = 0.92 + Math.random() * 0.16

  const classes = {} as Record<SeatClass, ClassResult>
  let totalPassengers = 0
  let totalRevenue = 0

  for (const cls of SEAT_CLASSES) {
    const seats = seatConfig[cls]
    if (seats <= 0) {
      classes[cls] = { passengers: 0, loadFactor: 0, revenue: 0 }
      continue
    }

    const priceRatio = prices[cls] / fairPriceForClass(distanceKm, cls)
    const loadFactor = clamp(
      reputationFactor * (1.15 - 0.5 * (priceRatio - 1)) * noise,
      0.05,
      0.98,
    )
    const passengers = Math.min(seats, Math.round(demand[cls] * loadFactor))
    const revenue = passengers * prices[cls]

    classes[cls] = { passengers, loadFactor, revenue }
    totalPassengers += passengers
    totalRevenue += revenue
  }

  const seatsTotal = totalSeatCount(seatConfig)
  const overallLoadFactor = seatsTotal > 0 ? totalPassengers / seatsTotal : 0
  const fuelCost = model.fuelBurnPerHour * hours * fuelPrice
  const maintenanceCost = model.maintenancePerHour * hours
  const profit = totalRevenue - fuelCost - maintenanceCost
  const reputationDelta = (overallLoadFactor - 0.5) * 0.6

  return {
    classes,
    passengers: totalPassengers,
    loadFactor: overallLoadFactor,
    revenue: totalRevenue,
    fuelCost,
    maintenanceCost,
    profit,
    reputationDelta,
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
