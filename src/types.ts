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
  /** Fuel burn in kg per km flown. */
  fuelBurnPerKm: number
  maintenancePerHour: number
}

export type SeatClass = 'economy' | 'business' | 'first'

export type SeatConfig = Record<SeatClass, number>

export type FlightStatus = 'idle' | 'flying' | 'maintenance'

export type MaintenanceKind = 'light' | 'inspection' | 'aog' | 'weather'

export interface ActiveFlight {
  routeId: string
  /** Which way along the route this specific flight goes — may be either end first, since
   *  aircraft alternate direction each dispatch. Absent for flights already in progress when
   *  this field was introduced; falls back to the route's own origin/dest for those. */
  originCode?: string
  destCode?: string
  departedAt: number
  arrivesAt: number
  /** Flight-hours — applied to wear/inspection counters when the flight arrives. */
  hours: number
  /** Settled at dispatch — shown when you tap the aircraft mid-flight.
   *  Absent for flights already in progress when this field was introduced. */
  passengers?: number
  loadFactor?: number
  profit?: number
  /** Belly cargo revenue folded into `profit` — broken out here just for display. */
  cargoRevenue?: number
  /** Distinct countries this flight bought fuel in away from the home depot — the departure
   *  airport when it isn't the route's home side, and always the stopover, if there is one. */
  localFuelCountries?: string[]
}

export interface OwnedAircraft {
  id: string
  modelId: string
  status: FlightStatus
  seatConfig: SeatConfig
  flight?: ActiveFlight
  /** Which end of its route this aircraft is currently based at — flips on every dispatch, so
   *  it actually flies out and back instead of repeating the same leg. Missing means 'origin'. */
  homeSide?: 'origin' | 'dest'
  autoManaged?: boolean
  /** Leased rather than bought outright — cheaper up front, an ongoing lease cost instead, and
   *  nothing to sell when you're done with it. */
  leased?: boolean
  /** Airframe wear, 0 (new) to 1 (worn out). */
  wear: number
  /** Flight-hours flown since the last scheduled inspection. */
  hoursSinceCheck: number
  /** Total flight-hours flown. */
  totalHours: number
  /** While status === 'maintenance': what's being done and when it finishes. */
  maintenanceKind?: MaintenanceKind
  maintenanceUntil?: number
  /** Queued while flying — applied automatically the moment it lands, instead of going idle,
   *  so you don't have to come back and click again after it's back on the ground. */
  scheduledMaintenance?: 'light' | 'inspection'
}

export interface Route {
  id: string
  originCode: string
  destCode: string
  /** Optional stopover airport — lets a route reach beyond the aircraft's direct range,
   *  as long as each leg (origin→via, via→dest) is within range on its own. */
  viaCode?: string
  aircraftId: string
  prices: Record<SeatClass, number>
  /** Total distance actually flown — both legs, when there's a stopover. */
  distanceKm: number
  /** Total elapsed hours — both legs plus stopover ground time, when there's a stopover. */
  flightTimeHours: number
  /** Repeat-customer loyalty built up on this specific route, 0-50 — nudges its load factor up.
   *  Absent means 0; resets if the route is deleted and recreated. */
  loyalty?: number
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
  /** Earliest time a new marketing campaign can be run. */
  campaignReadyAt?: number
  /** Earliest time another staff bonus can be paid out. */
  staffBonusReadyAt?: number
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

export interface CO2State {
  /** Emission quota held, in tonnes of CO2. */
  stored: number
  /** Quota storage capacity, in tonnes. */
  capacity: number
  /** Weighted-average $/tonne cost of the quota currently held. */
  avgCost: number
  /** Current spot price, $/tonne. */
  price: number
  /** Recent spot prices for the chart. */
  history: PricePoint[]
  /** Timestamp of the last price move. */
  lastPriceTick: number
}

export type TutorialStep = 'buy_aircraft' | 'create_route' | 'dispatch_flight' | 'done'

export type TrainingCategory = 'fuel' | 'maintenance' | 'emissions' | 'crew'

export type TrainingLevels = Record<TrainingCategory, number>

export interface GameState {
  version: number
  company: Company
  cash: number
  fuel: FuelState
  co2: CO2State
  fleet: OwnedAircraft[]
  routes: Route[]
  stock: StockState
  ledger: FinanceEvent[]
  lastSeen: number
  tutorial: TutorialStep
  flightsCompleted: number
  lastFixedLogAt: number
  /** Revenue team hired — auto-tunes ticket prices toward demand for a cut of revenue. */
  revenueTeam: boolean
  lastRevenueTuneAt: number
  /** Outstanding loan principal; interest accrues on it continuously. */
  debt: number
  /** IDs of milestones already reached — sticky, kept even if the underlying stat later drops. */
  achievedMilestones: string[]
  /** When the next random event is scheduled to roll. */
  nextEventAt: number
  /** Staff morale, 0-100. Low morale raises the odds of a strike event. */
  staffMorale: number
  /** Permanent per-category boosts, bought with cash. Levels 0-5 each. */
  training: TrainingLevels
  /** Sustainable Aviation Fuel — costs more per tonne bought, cuts emissions per flight. */
  safEnabled: boolean
}
