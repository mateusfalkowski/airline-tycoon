import type { Airport, Route } from '../types'
import { distanceKm } from '../engine/geo'

export const AIRPORTS: Airport[] = [
  { code: 'GRU', name: 'Guarulhos Intl', city: 'São Paulo', country: 'Brasil', lat: -23.4356, lon: -46.4731, weight: 90 },
  { code: 'GIG', name: 'Galeão Intl', city: 'Rio de Janeiro', country: 'Brasil', lat: -22.8100, lon: -43.2506, weight: 70 },
  { code: 'BSB', name: 'Brasília Intl', city: 'Brasília', country: 'Brasil', lat: -15.8697, lon: -47.9208, weight: 55 },
  { code: 'CNF', name: 'Confins Intl', city: 'Belo Horizonte', country: 'Brasil', lat: -19.6336, lon: -43.9686, weight: 45 },
  { code: 'POA', name: 'Salgado Filho', city: 'Porto Alegre', country: 'Brasil', lat: -29.9944, lon: -51.1714, weight: 40 },
  { code: 'CWB', name: 'Afonso Pena', city: 'Curitiba', country: 'Brasil', lat: -25.5285, lon: -49.1758, weight: 45 },
  { code: 'SSA', name: 'Deputado Luís Eduardo Magalhães', city: 'Salvador', country: 'Brasil', lat: -12.9086, lon: -38.3225, weight: 40 },
  { code: 'REC', name: 'Guararapes', city: 'Recife', country: 'Brasil', lat: -8.1264, lon: -34.9236, weight: 40 },
  { code: 'FOR', name: 'Pinto Martins Intl', city: 'Fortaleza', country: 'Brasil', lat: -3.7763, lon: -38.5326, weight: 40 },
  { code: 'BEL', name: 'Val de Cans Intl', city: 'Belém', country: 'Brasil', lat: -1.3792, lon: -48.4761, weight: 35 },
  { code: 'MAO', name: 'Eduardo Gomes Intl', city: 'Manaus', country: 'Brasil', lat: -3.0386, lon: -60.0497, weight: 50 },
  { code: 'PVH', name: 'Gov. Jorge Teixeira Intl', city: 'Porto Velho', country: 'Brasil', lat: -8.7093, lon: -63.9024, weight: 30 },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami', country: 'EUA', lat: 25.7959, lon: -80.2870, weight: 85 },
  { code: 'JFK', name: 'John F. Kennedy Intl', city: 'Nova York', country: 'EUA', lat: 40.6413, lon: -73.7781, weight: 100 },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'EUA', lat: 33.9416, lon: -118.4085, weight: 95 },
  { code: 'ORD', name: "O'Hare Intl", city: 'Chicago', country: 'EUA', lat: 41.9742, lon: -87.9073, weight: 90 },
  { code: 'MEX', name: 'Cidade do México Intl', city: 'Cidade do México', country: 'México', lat: 19.4363, lon: -99.0721, weight: 85 },
  { code: 'PTY', name: 'Tocumen Intl', city: 'Cidade do Panamá', country: 'Panamá', lat: 9.0714, lon: -79.3835, weight: 65 },
  { code: 'BOG', name: 'El Dorado Intl', city: 'Bogotá', country: 'Colômbia', lat: 4.7016, lon: -74.1469, weight: 55 },
  { code: 'CCS', name: 'Simón Bolívar Intl', city: 'Caracas', country: 'Venezuela', lat: 10.6013, lon: -66.9911, weight: 45 },
  { code: 'UIO', name: 'Mariscal Sucre Intl', city: 'Quito', country: 'Equador', lat: -0.1292, lon: -78.3575, weight: 40 },
  { code: 'LIM', name: 'Jorge Chávez Intl', city: 'Lima', country: 'Peru', lat: -12.0219, lon: -77.1143, weight: 55 },
  { code: 'SCL', name: 'Arturo Merino Benítez', city: 'Santiago', country: 'Chile', lat: -33.3930, lon: -70.7858, weight: 55 },
  { code: 'EZE', name: 'Ministro Pistarini', city: 'Buenos Aires', country: 'Argentina', lat: -34.8222, lon: -58.5358, weight: 65 },
  { code: 'MVD', name: 'Carrasco Intl', city: 'Montevidéu', country: 'Uruguai', lat: -34.8384, lon: -56.0308, weight: 35 },
  { code: 'YYZ', name: 'Pearson Intl', city: 'Toronto', country: 'Canadá', lat: 43.6777, lon: -79.6248, weight: 75 },
  { code: 'IAH', name: 'George Bush Intercontinental', city: 'Houston', country: 'EUA', lat: 29.9902, lon: -95.3368, weight: 65 },
  { code: 'HNL', name: 'Daniel K. Inouye Intl', city: 'Honolulu', country: 'EUA', lat: 21.3245, lon: -157.9251, weight: 55 },
  { code: 'LIS', name: 'Humberto Delgado', city: 'Lisboa', country: 'Portugal', lat: 38.7813, lon: -9.1359, weight: 55 },
  { code: 'LPA', name: 'Gran Canaria', city: 'Las Palmas', country: 'Espanha', lat: 27.9319, lon: -15.3866, weight: 45 },
  { code: 'SID', name: 'Amílcar Cabral Intl', city: 'Ilha do Sal', country: 'Cabo Verde', lat: 16.7414, lon: -22.9494, weight: 30 },
  { code: 'DKR', name: 'Blaise Diagne Intl', city: 'Dakar', country: 'Senegal', lat: 14.6708, lon: -17.0731, weight: 40 },
  { code: 'MAD', name: 'Adolfo Suárez Barajas', city: 'Madrid', country: 'Espanha', lat: 40.4983, lon: -3.5676, weight: 80 },
  { code: 'LHR', name: 'Heathrow', city: 'Londres', country: 'Reino Unido', lat: 51.4700, lon: -0.4543, weight: 100 },
  { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'França', lat: 49.0097, lon: 2.5479, weight: 95 },
  { code: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'Alemanha', lat: 50.0379, lon: 8.5622, weight: 90 },
  { code: 'AMS', name: 'Schiphol', city: 'Amsterdã', country: 'Países Baixos', lat: 52.3105, lon: 4.7683, weight: 85 },
  { code: 'IST', name: 'Istanbul Airport', city: 'Istambul', country: 'Turquia', lat: 41.2753, lon: 28.7519, weight: 90 },
  { code: 'CAI', name: 'Cairo Intl', city: 'Cairo', country: 'Egito', lat: 30.1219, lon: 31.4056, weight: 65 },
  { code: 'DOH', name: 'Hamad Intl', city: 'Doha', country: 'Catar', lat: 25.2731, lon: 51.6081, weight: 85 },
  { code: 'DXB', name: 'Dubai Intl', city: 'Dubai', country: 'EAU', lat: 25.2532, lon: 55.3657, weight: 95 },
  { code: 'JNB', name: 'OR Tambo', city: 'Joanesburgo', country: 'África do Sul', lat: -26.1392, lon: 28.2460, weight: 60 },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj Intl', city: 'Mumbai', country: 'Índia', lat: 19.0887, lon: 72.8679, weight: 75 },
  { code: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'Tailândia', lat: 13.6900, lon: 100.7501, weight: 80 },
  { code: 'HKG', name: 'Hong Kong Intl', city: 'Hong Kong', country: 'Hong Kong', lat: 22.3080, lon: 113.9185, weight: 90 },
  { code: 'NRT', name: 'Narita Intl', city: 'Tóquio', country: 'Japão', lat: 35.7720, lon: 140.3929, weight: 90 },
  { code: 'SIN', name: 'Changi', city: 'Singapura', country: 'Singapura', lat: 1.3644, lon: 103.9915, weight: 85 },
  { code: 'SYD', name: 'Kingsford Smith', city: 'Sydney', country: 'Austrália', lat: -33.9399, lon: 151.1753, weight: 75 },
]

export function findAirport(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code)
}

export interface RouteLegs {
  leg1Km: number
  leg2Km: number
  totalKm: number
}

/** Distances for a route, split into legs when it has a stopover. `leg2Km` is 0 without one. */
export function routeLegsKm(originCode: string, destCode: string, viaCode?: string): RouteLegs | null {
  const origin = findAirport(originCode)
  const dest = findAirport(destCode)
  if (!origin || !dest) return null
  if (!viaCode) {
    const d = distanceKm(origin, dest)
    return { leg1Km: d, leg2Km: 0, totalKm: d }
  }
  const via = findAirport(viaCode)
  if (!via) return null
  const leg1Km = distanceKm(origin, via)
  const leg2Km = distanceKm(via, dest)
  return { leg1Km, leg2Km, totalKm: leg1Km + leg2Km }
}

/** Whether an aircraft with this range can get from origin to dest at all — directly, or with
 *  a single stopover at some other airport where both legs fit within range. */
export function isRouteReachable(originCode: string, destCode: string, rangeKm: number): boolean {
  const origin = findAirport(originCode)
  const dest = findAirport(destCode)
  if (!origin || !dest) return false
  if (distanceKm(origin, dest) <= rangeKm) return true
  return AIRPORTS.some((via) => {
    if (via.code === originCode || via.code === destCode) return false
    return distanceKm(origin, via) <= rangeKm && distanceKm(via, dest) <= rangeKm
  })
}

/** Busier airports only have so many gates to go around — smaller ones are generous enough that
 *  this rarely binds, but a mega-hub built entirely through one big airport eventually will. */
export function airportSlotCapacity(weight: number): number {
  return Math.max(6, Math.round(weight / 10))
}

/** How many of the player's routes already touch this airport, as origin, destination or stopover. */
export function slotsUsed(routes: Route[], airportCode: string): number {
  return routes.filter((r) => r.originCode === airportCode || r.destCode === airportCode || r.viaCode === airportCode)
    .length
}

/** Whether one more route could still touch this airport without exceeding its slot capacity. */
export function hasFreeSlot(routes: Route[], airportCode: string): boolean {
  const airport = findAirport(airportCode)
  if (!airport) return false
  return slotsUsed(routes, airportCode) < airportSlotCapacity(airport.weight)
}
