import type { GameState } from '../types'

const STORAGE_KEY = 'airline-tycoon-save-v1'

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as GameState
  } catch {
    return null
  }
}

export function saveGame(state: GameState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function wipeSave(): void {
  localStorage.removeItem(STORAGE_KEY)
}
