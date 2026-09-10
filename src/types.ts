export interface Airport {
  code: string
  name: string
  city: string
  country: string
  lat: number
  lon: number
  weight: number
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

export type SeatClass = 'economy' | 'business' | 'first'

export type SeatConfig = Record<SeatClass, number>

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
  seatConfig: SeatConfig
  flight?: ActiveFlight
  autoManaged?: boolean
  /** Airframe wear, 0 (new) to 1 (worn out). */
  wear: number
  /** Flight-hours flown since the last scheduled inspection. */
  hoursSinceCheck: number
  /** Total flight-hours flown. */
  totalHours: number
}

export interface Route {
  id: string
  originCode: string
  destCode: string
  aircraftId: string
  prices: Record<SeatClass, number>
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

export interface FuelState {
  /** Litres currently in the depot. */
  stored: number
  /** Depot capacity in litres. */
  capacity: number
  /** Weighted-average $/L cost of the fuel currently stored. */
  avgCost: number
  /** Current spot price, $/L. */
  price: number
  /** Recent spot prices for the chart. */
  history: PricePoint[]
  /** Timestamp of the last hourly price move. */
  lastPriceTick: number
}

export type TutorialStep = 'buy_aircraft' | 'create_route' | 'dispatch_flight' | 'stock_intro' | 'done'

export interface GameState {
  version: number
  company: Company
  cash: number
  fuelPrice: number
  fuel: FuelState
  fleet: OwnedAircraft[]
  routes: Route[]
  stock: StockState
  ledger: FinanceEvent[]
  lastSeen: number
  tutorial: TutorialStep
  flightsCompleted: number
}
