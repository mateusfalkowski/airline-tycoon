import type { GameState, StockState } from '../types'
import { findAircraftModel } from '../data/aircraft'
import { clamp } from './economy'

export const INITIAL_TOTAL_SHARES = 1_000_000
export const BOT_TICK_INTERVAL_MS = 60_000

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
  note?: string
}

export function runBotTick(state: GameState): BotTickResult {
  const { stock } = state
  const now = Date.now()
  if (!stock.ipoDone || now - stock.lastBotTick < BOT_TICK_INTERVAL_MS) {
    return { stock }
  }

  const valuation = computeValuation(state)
  const fairSharePrice = valuation / stock.totalShares
  const drift = (fairSharePrice - stock.sharePrice) * 0.05
  const volatility = stock.sharePrice * (Math.random() - 0.5) * 0.06
  const nextPrice = Math.max(0.01, stock.sharePrice + drift + volatility)

  const history = [...stock.history, { t: now, price: nextPrice }].slice(-200)
  const traded = Math.round(marketShares(stock) * (0.01 + Math.random() * 0.04))
  const direction = nextPrice >= stock.sharePrice ? 'compraram' : 'venderam'

  return {
    stock: { ...stock, sharePrice: nextPrice, history, lastBotTick: now },
    note: traded > 0 ? `Investidores ${direction} ${traded.toLocaleString('pt-BR')} ações` : undefined,
  }
}

export function ipo(state: GameState, floatPercent: number): { stock: StockState; cashGained: number } {
  const pct = clamp(floatPercent, 1, 90) / 100
  const floatShares = Math.round(state.stock.totalShares * pct)
  const cashGained = Math.round(floatShares * state.stock.sharePrice)
  const now = Date.now()

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

export function sellShares(state: GameState, shares: number): { stock: StockState; cashGained: number } {
  const amount = clamp(shares, 0, state.stock.playerShares)
  const cashGained = Math.round(amount * state.stock.sharePrice)

  return {
    stock: { ...state.stock, playerShares: state.stock.playerShares - amount },
    cashGained,
  }
}

export function buyBackShares(state: GameState, shares: number): { stock: StockState; cashSpent: number } {
  const available = marketShares(state.stock)
  const amount = clamp(shares, 0, Math.min(available, Math.floor(state.cash / state.stock.sharePrice)))
  const cashSpent = Math.round(amount * state.stock.sharePrice)

  return {
    stock: { ...state.stock, playerShares: state.stock.playerShares + amount },
    cashSpent,
  }
}
