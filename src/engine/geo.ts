import type { Airport } from '../types'

const EARTH_RADIUS_KM = 6371

export function distanceKm(a: Airport, b: Airport): number {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI
}

/** Point a fraction `f` (0..1) of the way along the great circle from `a` to `b`. */
export function interpolateGreatCircle(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  f: number,
): { lat: number; lon: number } {
  const phi1 = toRad(a.lat)
  const lam1 = toRad(a.lon)
  const phi2 = toRad(b.lat)
  const lam2 = toRad(b.lon)

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((phi2 - phi1) / 2) ** 2 +
          Math.cos(phi1) * Math.cos(phi2) * Math.sin((lam2 - lam1) / 2) ** 2,
      ),
    )
  if (d === 0) return { lat: a.lat, lon: a.lon }

  const A = Math.sin((1 - f) * d) / Math.sin(d)
  const B = Math.sin(f * d) / Math.sin(d)
  const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2)
  const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2)
  const z = A * Math.sin(phi1) + B * Math.sin(phi2)

  return {
    lat: toDeg(Math.atan2(z, Math.hypot(x, y))),
    lon: toDeg(Math.atan2(y, x)),
  }
}
