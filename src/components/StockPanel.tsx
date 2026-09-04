import { useState } from 'react'
import type { GameState } from '../types'
import { useGameStore } from '../store/gameStore'
import { marketShares, computeValuation } from '../engine/stockMarket'
import { formatMoney, formatShares } from '../format'
import { StockChart } from './StockChart'
import { Field } from './Field'

export function StockPanel({ state }: { state: GameState }) {
  const doIpo = useGameStore((s) => s.doIpo)
  const doSellShares = useGameStore((s) => s.doSellShares)
  const doBuyBackShares = useGameStore((s) => s.doBuyBackShares)

  const [floatPct, setFloatPct] = useState(25)
  const [tradeShares, setTradeShares] = useState(10_000)

  const { stock } = state
  const ownershipPct = (stock.playerShares / stock.totalShares) * 100
  const valuation = computeValuation(state)
  const bots = marketShares(stock)

  return (
    <div>
      <h3>Bolsa de valores</h3>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 16 }}>
        <Metric label="Preço da ação" value={`$${stock.sharePrice.toFixed(2)}`} />
        <Metric label="Valuation" value={formatMoney(Math.round(valuation))} />
        <Metric label="Sua participação" value={`${ownershipPct.toFixed(1)}%`} />
        <Metric label="Ações com investidores" value={formatShares(bots)} />
      </div>

      <StockChart history={stock.history} ipoDone={stock.ipoDone} />

      <div style={{ marginTop: 20, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {!stock.ipoDone ? (
          <div>
            <p style={{ color: 'var(--text-dim)', maxWidth: 360 }}>
              Abra o capital da empresa (IPO): venda uma fatia das ações para investidores (bots, por enquanto) e
              levante caixa imediato.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <Field label="Fatia das ações a vender">
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    style={{ width: 70 }}
                    min={1}
                    max={90}
                    value={floatPct}
                    onChange={(e) => setFloatPct(Number(e.target.value))}
                  />
                  <span style={{ color: 'var(--text-dim)' }}>%</span>
                </div>
              </Field>
              <button className="primary" onClick={() => doIpo(floatPct)}>
                Abrir capital
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-dim)', maxWidth: 420 }}>
              Venda mais ações para levantar caixa (dilui sua participação) ou recompre ações do mercado para
              recuperar controle.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Quantidade de ações">
                <input
                  type="number"
                  style={{ width: 110 }}
                  min={0}
                  step={1000}
                  value={tradeShares}
                  onChange={(e) => setTradeShares(Number(e.target.value))}
                />
              </Field>
              <button disabled={tradeShares > stock.playerShares} onClick={() => doSellShares(tradeShares)}>
                Vender ações
              </button>
              <button
                disabled={tradeShares > bots || tradeShares * stock.sharePrice > state.cash}
                onClick={() => doBuyBackShares(tradeShares)}
              >
                Recomprar ações
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-h)' }}>{value}</div>
    </div>
  )
}
