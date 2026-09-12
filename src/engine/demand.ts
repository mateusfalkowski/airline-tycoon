import type { Airport, SeatClass } from '../types'
import { clamp } from './economy'

const MS_PER_DAY = 86_400_000
const DAYS_PER_YEAR = 365.25
const SEASON_SWING = 0.18

/** Global demand swing across the year — peaks around the New Year travel season, troughs six months later. */
export function seasonalMultiplier(now: number): number {
  const date = new Date(now)
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear = (now - startOfYear) / MS_PER_DAY
  const angle = (dayOfYear / DAYS_PER_YEAR) * 2 * Math.PI
  return 1 + SEASON_SWING * Math.cos(angle)
}

export function computeRouteDemand(
  origin: Airport,
  dest: Airport,
  distanceKm: number,
  now: number,
): Record<SeatClass, number> {
  const base = Math.sqrt(origin.weight * dest.weight)
  const midHaulFactor = clamp(distanceKm / 3000, 0.1, 1)
  const longHaulFactor = clamp(distanceKm / 6000, 0, 1)
  const season = seasonalMultiplier(now)

  return {
    economy: Math.round(base * 3.2 * season),
    business: Math.round(base * 0.5 * midHaulFactor * season),
    first: Math.round(base * 0.15 * longHaulFactor * season),
  }
}
