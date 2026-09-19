import type { AircraftCategory, AircraftModel, SeatClass, SeatConfig, TrainingCategory } from '../types'

export const TAXI_OVERHEAD_HOURS = 0.3

/** Converts a duration in hours to real milliseconds (flights and maintenance both take real time). */
export function realFlightMs(hours: number): number {
  return hours * 60 * 60 * 1000
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

/** Fixed upkeep (parking, insurance, base crew) per real hour, as a fraction of the aircraft's value.
 *  Charged whether the aircraft flies or sits — idle fleet bleeds cash. Deliberately excludes
 *  maintenance, which is already paid for separately (per-flight wear cost, plus inspections). */
export const FIXED_COST_RATE = 0.00001

export function fixedCostPerHour(modelPrice: number): number {
  return modelPrice * FIXED_COST_RATE
}

/** Leasing: skip the purchase price for a higher ongoing cost — cheaper to start, pricier over
 *  the long run, and there's no airframe to sell at the end since you never owned it. */
export const LEASE_RATE = 0.00003

export function leaseCostPerHour(modelPrice: number): number {
  return modelPrice * LEASE_RATE
}

/** Lessors underwrite the airline, not just the airframe — a new operator can't just walk in and
 *  lease a widebody with no track record. Buying is already gated by cash (a new airline can't
 *  afford a $130M A380 outright); this is leasing's equivalent gate, earned through flights
 *  completed and reputation instead of capital. */
export interface LeaseRequirement {
  minFlights: number
  minReputation: number
}

export function leaseRequirement(category: AircraftCategory): LeaseRequirement {
  const table: Record<AircraftCategory, LeaseRequirement> = {
    regional: { minFlights: 0, minReputation: 0 },
    narrowbody: { minFlights: 15, minReputation: 55 },
    widebody: { minFlights: 60, minReputation: 70 },
  }
  return table[category]
}

export function canLeaseAircraft(category: AircraftCategory, flightsCompleted: number, reputation: number): boolean {
  const req = leaseRequirement(category)
  return flightsCompleted >= req.minFlights && reputation >= req.minReputation
}

/** What a used aircraft fetches: starts at 70% of list, dropping with hours flown and wear. */
export function resaleValue(modelPrice: number, totalHours: number, wear: number): number {
  const hoursFactor = 1 - Math.min(0.45, totalHours / 3000)
  const wearFactor = 1 - wear * 0.3
  return Math.round(modelPrice * 0.7 * hoursFactor * wearFactor)
}

/** Marketing campaigns: a cash sink that buys reputation, with diminishing returns near the top. */
export const CAMPAIGNS = [
  { id: 'local', name: 'Local', cost: 200_000, gain: 6 },
  { id: 'nacional', name: 'Nacional', cost: 900_000, gain: 16 },
  { id: 'global', name: 'Global', cost: 3_000_000, gain: 34 },
] as const

export const CAMPAIGN_COOLDOWN_MS = 60 * 60 * 1000

/** Actual reputation points a campaign adds, given where reputation already is. */
export function campaignGain(baseGain: number, currentReputation: number): number {
  return Math.round(clamp((baseGain * (100 - currentReputation)) / 50, 0, baseGain))
}

/** Staff bonus: a cash sink that buys morale, same diminishing-returns shape as a campaign.
 *  Cost scales with fleet size — a bigger team costs more to treat. */
export const STAFF_BONUS_COST_PER_AIRCRAFT = 40_000
export const STAFF_BONUS_MIN_COST = 60_000
export const STAFF_BONUS_BASE_GAIN = 14
export const STAFF_BONUS_COOLDOWN_MS = 60 * 60 * 1000

export function staffBonusCost(fleetSize: number): number {
  return Math.max(STAFF_BONUS_MIN_COST, STAFF_BONUS_COST_PER_AIRCRAFT * fleetSize)
}

export function staffBonusGain(currentMorale: number): number {
  return Math.round(clamp((STAFF_BONUS_BASE_GAIN * (100 - currentMorale)) / 50, 0, STAFF_BONUS_BASE_GAIN))
}

/** Training: a late-game cash sink with a small, permanent, per-category effect. Each level costs
 *  more than the last, so maxing out every category is a long-term goal, not a quick buy. */
export const TRAINING_CATEGORIES: TrainingCategory[] = ['fuel', 'maintenance', 'emissions', 'crew']
export const TRAINING_LABEL: Record<TrainingCategory, string> = {
  fuel: 'Eficiência de combustível',
  maintenance: 'Redução de desgaste',
  emissions: 'Redução de emissões',
  crew: 'Eficiência da tripulação',
}
export const TRAINING_MAX_LEVEL = 5
export const TRAINING_BASE_COST = 400_000
export const TRAINING_COST_GROWTH = 1.7
/** Fuel/maintenance/emissions: % reduction per level. Crew: percentage points of load factor per level. */
export const TRAINING_EFFECT_PER_LEVEL = 0.03
export const CREW_BONUS_PER_LEVEL = 0.015

export function trainingCost(currentLevel: number): number {
  return Math.round(TRAINING_BASE_COST * TRAINING_COST_GROWTH ** currentLevel)
}

/** Multiplier for fuel burn, wear accrual or CO2-per-tonne — 1 at level 0, down to 0.85 at max level. */
export function trainingMultiplier(level: number): number {
  return 1 - level * TRAINING_EFFECT_PER_LEVEL
}

/** Loans: borrow against company value, pay ~1%/day interest on the outstanding balance. */
export const LOAN_DAILY_RATE = 0.01
export const LOAN_VALUATION_LIMIT = 0.6

export function maxLoan(valuation: number, debt: number): number {
  return Math.max(0, Math.floor(valuation * LOAN_VALUATION_LIMIT) - debt)
}

/** Revenue team: auto-tunes every route's prices toward demand, for a cut of gross revenue. */
export const REVENUE_TEAM_HIRE_FEE = 500_000
export const REVENUE_TEAM_UNLOCK_FLIGHTS = 30
export const REVENUE_TEAM_CUT = 0.025
export const REVENUE_TUNE_INTERVAL_MS = 45 * 1000

/** One conservative step of demand-based re-pricing for a single class. */
export function retunePrice(
  currentPrice: number,
  distanceKm: number,
  cls: SeatClass,
  seats: number,
  demand: number,
  reputation: number,
): number {
  const fair = fairPriceForClass(distanceKm, cls)
  const load = estimateLoadFactor(distanceKm, cls, currentPrice, reputation)
  const wouldSell = demand * load
  let next = currentPrice
  if (wouldSell > seats * 1.05) next = currentPrice * 1.035 // selling out with demand to spare — push yield
  else if (load < 0.72) next = currentPrice * 0.97 // flying light — fill seats
  return Math.round(clamp(next, fair * 0.5, fair * 2.4))
}

/** Aircraft wear & scheduled inspections. */
export const WEAR_PER_HOUR = 0.011

/** Flight hours between mandatory inspections — the A-check analog. Real A-check intervals run
 *  roughly 250-750 flight hours depending on type (e.g. ~250h on a 737 Classic, ~750h on an A320);
 *  smaller airframes with shorter, more frequent hops tend to sit at the low end. */
export function checkIntervalHours(category: AircraftCategory): number {
  const table: Record<AircraftCategory, number> = {
    regional: 250,
    narrowbody: 450,
    widebody: 600,
  }
  return table[category]
}

/** How long an aircraft is grounded for maintenance (real hours) — bigger jets take longer.
 *  Anchored to real turnarounds: "light" tracks a daily/line check (~1-2h downtime overnight);
 *  "inspection" tracks an A-check (real-world ranges: 6-24h narrowbody, up to 72h widebody,
 *  shorter for smaller airframes), compressed enough to stay playable but keeping the same
 *  widening gap between categories that real A-checks have. */
export function maintenanceHours(category: AircraftCategory, kind: 'light' | 'inspection'): number {
  const table = {
    regional: { light: 1, inspection: 6 },
    narrowbody: { light: 2, inspection: 14 },
    widebody: { light: 4, inspection: 32 },
  }
  return table[category][kind]
}

/** Cost of a full scheduled inspection: resets the hours counter and clears most wear. */
export function inspectionCost(modelPrice: number, wear: number): number {
  return Math.round(modelPrice * 0.012 + wear * 400_000)
}

/** Cost of light maintenance: trims wear without resetting the inspection clock. */
export function lightMaintenanceCost(modelPrice: number, wear: number): number {
  return Math.round(modelPrice * 0.004 + wear * 150_000)
}

/** Belly cargo: a parallel revenue stream that doesn't compete with passengers for seats.
 *  Capacity scales with aircraft size; how much of it sells scales with how busy both airports
 *  are, same signal passenger demand uses. No separate cargo market to manage — it just adds to
 *  every flight's settlement. */
export const CARGO_CAPACITY_TONNES: Record<AircraftCategory, number> = {
  regional: 1.5,
  narrowbody: 6,
  widebody: 20,
}

export function cargoRatePerKg(distanceKm: number): number {
  return 0.4 + 0.00025 * distanceKm
}

export function cargoRevenueForFlight(
  category: AircraftCategory,
  originWeight: number,
  destWeight: number,
  distanceKm: number,
): number {
  const capacity = CARGO_CAPACITY_TONNES[category]
  const fillFactor = clamp(Math.sqrt(originWeight * destWeight) / 100, 0.2, 1)
  const tonnesCarried = capacity * fillFactor
  return tonnesCarried * 1000 * cargoRatePerKg(distanceKm)
}

/** Per-route loyalty: repeat customers on a route you keep flying gradually fill it better.
 *  Builds slowly with every dispatch, caps out, and resets only if the route itself is deleted
 *  and recreated. */
export const ROUTE_LOYALTY_MAX = 50
export const ROUTE_LOYALTY_PER_FLIGHT = 1
export const ROUTE_LOYALTY_BONUS_PER_POINT = 0.002

export function nextRouteLoyalty(currentLoyalty: number): number {
  return Math.min(ROUTE_LOYALTY_MAX, currentLoyalty + ROUTE_LOYALTY_PER_FLIGHT)
}

export const SEAT_CLASSES: SeatClass[] = ['economy', 'business', 'first']

export const SEAT_UNIT: Record<SeatClass, number> = { economy: 1, business: 2, first: 4 }

export const CABIN_UPFIT_COST: Record<SeatClass, number> = { economy: 0, business: 50_000, first: 150_000 }

export const CLASS_FARE_MULT: Record<SeatClass, number> = { economy: 1, business: 2.2, first: 4 }

export function flightTimeHours(distanceKm: number, cruiseSpeedKmh: number): number {
  return distanceKm / cruiseSpeedKmh + TAXI_OVERHEAD_HOURS
}

/** Stopovers: an extra landing and takeoff, priced like real airport handling fees — bigger jets pay more. */
export const STOPOVER_FEE: Record<AircraftCategory, number> = {
  regional: 1_500,
  narrowbody: 4_000,
  widebody: 9_000,
}

/** Ground time at the stopover — deplaning, refuel, reboarding. */
export const STOPOVER_GROUND_HOURS = 1

export interface FlightPlan {
  /** Total distance actually flown — both legs, when there's a stopover. */
  distanceKm: number
  /** Total elapsed hours, including stopover ground time. */
  hours: number
  /** Total fuel burned, in tonnes — each leg pays its own takeoff/climb overhead. */
  tonnes: number
  /** Fuel burned on the first leg alone — bought wherever that leg departs from. */
  leg1Tonnes: number
  /** Fuel burned on the second leg alone (0 without a stopover) — always bought at the
   *  stopover, since the depot only exists at the route's own two ends. */
  leg2Tonnes: number
}

/** Plans a flight from leg distances. Pass `leg2Km = 0` for a direct route with no stopover.
 *  `fuelMult` applies fuel-efficiency training (1 = none, lower = more efficient). */
export function planFlight(model: AircraftModel, leg1Km: number, leg2Km: number, fuelMult = 1): FlightPlan {
  const leg1Tonnes = fuelTonnes(model, leg1Km) * fuelMult
  if (leg2Km <= 0) {
    return {
      distanceKm: leg1Km,
      hours: flightTimeHours(leg1Km, model.cruiseSpeedKmh),
      tonnes: leg1Tonnes,
      leg1Tonnes,
      leg2Tonnes: 0,
    }
  }
  const leg2Tonnes = fuelTonnes(model, leg2Km) * fuelMult
  return {
    distanceKm: leg1Km + leg2Km,
    hours:
      flightTimeHours(leg1Km, model.cruiseSpeedKmh) +
      flightTimeHours(leg2Km, model.cruiseSpeedKmh) +
      STOPOVER_GROUND_HOURS,
    tonnes: leg1Tonnes + leg2Tonnes,
    leg1Tonnes,
    leg2Tonnes,
  }
}

/** Extra "distance" charged for the fuel-heavy taxi, takeoff and climb of every flight. */
export const TAKEOFF_KM_EQUIV = 250

/** Fuel a flight burns, in tonnes (1000 kg) — cruise plus the takeoff/climb overhead. */
export function fuelTonnes(model: AircraftModel, distanceKm: number): number {
  return (model.fuelBurnPerKm * (distanceKm + TAKEOFF_KM_EQUIV)) / 1000
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

/** Share of the seat-unit budget given to business/first by default — bigger jets skew more premium. */
const RECOMMENDED_CABIN_SHARE: Record<AircraftCategory, { business: number; first: number }> = {
  regional: { business: 0.1, first: 0 },
  narrowbody: { business: 0.2, first: 0.05 },
  widebody: { business: 0.28, first: 0.12 },
}

/** A sensible default cabin mix for a model, before any route (and its own demand mix) is known. */
export function recommendedCabin(model: AircraftModel): SeatConfig {
  const budget = model.seats
  const share = RECOMMENDED_CABIN_SHARE[model.category]
  const business = Math.floor((budget * share.business) / SEAT_UNIT.business)
  const first = Math.floor((budget * share.first) / SEAT_UNIT.first)
  const economy = budget - business * SEAT_UNIT.business - first * SEAT_UNIT.first
  return { economy, business, first }
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
  plan: FlightPlan,
  seatConfig: SeatConfig,
  prices: Record<SeatClass, number>,
  demand: Record<SeatClass, number>,
  reputation: number,
  fuelPrice: number,
  maintenanceMultiplier = 1,
  crewBonus = 0,
): FlightResult {
  const { distanceKm, hours, tonnes } = plan
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
      reputationFactor * (1.15 - 0.5 * (priceRatio - 1)) * noise + crewBonus,
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
  const fuelCost = tonnes * fuelPrice
  const maintenanceCost = model.maintenancePerHour * hours * maintenanceMultiplier
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
