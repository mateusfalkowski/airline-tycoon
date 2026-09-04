import type { Airport, SeatClass } from '../types'
import { clamp } from './economy'

export function computeRouteDemand(origin: Airport, dest: Airport, distanceKm: number): Record<SeatClass, number> {
  const base = Math.sqrt(origin.weight * dest.weight)
  const midHaulFactor = clamp(distanceKm / 3000, 0.1, 1)
  const longHaulFactor = clamp(distanceKm / 6000, 0, 1)

  return {
    economy: Math.round(base * 3.2),
    business: Math.round(base * 0.5 * midHaulFactor),
    first: Math.round(base * 0.15 * longHaulFactor),
  }
}
