import type { GameState, StockState } from '../types'
import { findAircraftModel } from '../data/aircraft'

export const INITIAL_TOTAL_SHARES = 1_000_000
export const BOT_TICK_INTERVAL_MS = 60_000

/** What it costs to take the company public. */
export const STOCK_LISTING_FEE = 50_000_000
/** Fraction of the company floated the moment it lists. */
export const IPO_INITIAL_FLOAT = 0.25
/** The market keeps buying the player's shares until this fraction is floated. */
export const MAX_FLOAT = 0.7

export function createInitialStock(sharePrice: number): StockState {
  return {
    totalShares: INITIAL_TOTAL_SHARES,
    playerShares: INITIAL_TOTAL_SHARES,
    sharePrice,
    ipoDone: false,
    history: [{ t: Date.now(), price: sharePrice }],
    lastBotTick: Date.now(),
  }
}

export function fleetValue(state: GameState): number {
  return state.fleet.reduce((sum, ac) => {
    const model = findAircraftModel(ac.modelId)
    return sum + (model ? model.price * 0.85 : 0)
  }, 0)
}

export function computeValuation(state: GameState): number {
  return state.cash + fleetValue(state) + state.company.reputation * 50_000
}

export function marketShares(stock: StockState): number {
  return stock.totalShares - stock.playerShares
}

export interface BotTickResult {
  stock: StockState
  cashGained: number
  note?: string
}

export function runBotTick(state: GameState): BotTickResult {
  const { stock } = state
  const now = Date.now()
  if (!stock.ipoDone || now - stock.lastBotTick < BOT_TICK_INTERVAL_MS) {
    return { stock, cashGained: 0 }
  }

  const valuation = computeValuation(state)
  const fairSharePrice = valuation / stock.totalShares
  const drift = (fairSharePrice - stock.sharePrice) * 0.05
  const volatility = stock.sharePrice * (Math.random() - 0.5) * 0.06
  const nextPrice = Math.max(0.01, stock.sharePrice + drift + volatility)
  const history = [...stock.history, { t: now, price: nextPrice }].slice(-200)

  // The market self-regulates: it keeps placing the player's remaining shares up to MAX_FLOAT.
  const minPlayerShares = Math.round(stock.totalShares * (1 - MAX_FLOAT))
  const placeable = Math.max(0, stock.playerShares - minPlayerShares)
  const placed = Math.min(placeable, Math.round(stock.totalShares * (0.004 + Math.random() * 0.012)))
  const cashGained = Math.round(placed * nextPrice)

  const stockNext: StockState = {
    ...stock,
    sharePrice: nextPrice,
    playerShares: stock.playerShares - placed,
    history,
    lastBotTick: now,
  }

  const note =
    placed > 0
      ? `O mercado colocou ${placed.toLocaleString('pt-BR')} ações · +$${cashGained.toLocaleString('en-US')}`
      : undefined

  return { stock: stockNext, cashGained, note }
}

/** Lists the company: an initial tranche floats at the opening price; the rest floats over time. */
export function listCompany(state: GameState): { stock: StockState; cashGained: number } {
  const now = Date.now()
  const floatShares = Math.round(state.stock.totalShares * IPO_INITIAL_FLOAT)
  const cashGained = Math.round(floatShares * state.stock.sharePrice)

  return {
    stock: {
      ...state.stock,
      ipoDone: true,
      playerShares: state.stock.totalShares - floatShares,
      history: [...state.stock.history, { t: now, price: state.stock.sharePrice }],
      lastBotTick: now,
    },
    cashGained,
  }
}
