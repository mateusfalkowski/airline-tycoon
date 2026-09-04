import type { AircraftModel } from '../types'

export const TAXI_OVERHEAD_HOURS = 0.3
export const BASE_FUEL_PRICE = 0.7

export function flightTimeHours(distanceKm: number, cruiseSpeedKmh: number): number {
  return distanceKm / cruiseSpeedKmh + TAXI_OVERHEAD_HOURS
}

export function fairPrice(distanceKm: number): number {
  return 25 + 0.09 * distanceKm
}

export interface FlightResult {
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
  ticketPrice: number,
  reputation: number,
  fuelPrice: number,
): FlightResult {
  const hours = flightTimeHours(distanceKm, model.cruiseSpeedKmh)
  const priceRatio = ticketPrice / fairPrice(distanceKm)
  const reputationFactor = 0.6 + (reputation / 100) * 0.4
  const noise = 0.92 + Math.random() * 0.16

  const loadFactor = clamp(
    reputationFactor * (1.15 - 0.5 * (priceRatio - 1)) * noise,
    0.1,
    0.98,
  )

  const passengers = Math.round(model.seats * loadFactor)
  const revenue = passengers * ticketPrice
  const fuelCost = model.fuelBurnPerHour * hours * fuelPrice
  const maintenanceCost = model.maintenancePerHour * hours
  const profit = revenue - fuelCost - maintenanceCost
  const reputationDelta = (loadFactor - 0.5) * 0.6

  return { passengers, loadFactor, revenue, fuelCost, maintenanceCost, profit, reputationDelta }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
