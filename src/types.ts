export interface Airport {
  code: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
}

export type AircraftCategory = 'regional' | 'narrowbody' | 'widebody'

export interface AircraftModel {
  id: string
  name: string
  category: AircraftCategory
  manufacturer: string
  price: number
  rangeKm: number
  cruiseSpeedKmh: number
  seats: number
  fuelBurnPerHour: number
  maintenancePerHour: number
}

export type FlightStatus = 'idle' | 'flying'

export interface ActiveFlight {
  routeId: string
  departedAt: number
  arrivesAt: number
}

export interface OwnedAircraft {
  id: string
  modelId: string
  status: FlightStatus
  flight?: ActiveFlight
}

export interface Route {
  id: string
  originCode: string
  destCode: string
  aircraftId: string
  ticketPrice: number
  distanceKm: number
  flightTimeHours: number
}

export interface PricePoint {
  t: number
  price: number
}

export interface StockState {
  totalShares: number
  playerShares: number
  sharePrice: number
  ipoDone: boolean
  history: PricePoint[]
  lastBotTick: number
}

export interface FinanceEvent {
  id: string
  t: number
  label: string
  amount: number
}

export interface Company {
  name: string
  hubCode: string
  foundedAt: number
  reputation: number
}

export interface GameState {
  version: number
  company: Company
  cash: number
  fuelPrice: number
  fleet: OwnedAircraft[]
  routes: Route[]
  stock: StockState
  ledger: FinanceEvent[]
  lastSeen: number
}
