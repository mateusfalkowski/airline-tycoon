import type { GameState } from '../types'
import { useGameStore } from '../store/gameStore'
import { marketShares, computeValuation, STOCK_LISTING_FEE, MAX_FLOAT } from '../engine/stockMarket'
import { formatMoney, formatShares } from '../format'
import { StockChart } from './StockChart'

export function StockPanel({ state }: { state: GameState }) {
  const listCompany = useGameStore((s) => s.listCompany)
  const { stock } = state
  const valuation = computeValuation(state)

  if (!stock.ipoDone) {
    return (
      <div>
        <h3>Bolsa de valores</h3>
        <p style={{ color: 'var(--text-dim)', maxWidth: 480 }}>
          Abrir o capital custa <strong style={{ color: 'var(--text-h)' }}>{formatMoney(STOCK_LISTING_FEE)}</strong>.
          A partir daí o mercado coloca suas ações à venda sozinho e a companhia recebe conforme elas são
          compradas — você não decide quando vender, o mercado se auto-regula.
        </p>
        <div style={{ margin: '14px 0', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Metric label="Valuation atual" value={formatMoney(Math.round(valuation))} />
          <Metric label="Preço de abertura estimado" value={`$${stock.sharePrice.toFixed(2)}`} />
        </div>
        <button
          className="primary"
          disabled={state.cash < STOCK_LISTING_FEE}
          title={state.cash < STOCK_LISTING_FEE ? 'Caixa insuficiente' : undefined}
          onClick={listCompany}
        >
          Abrir capital · {formatMoney(STOCK_LISTING_FEE)}
        </button>
      </div>
    )
  }

  const ownershipPct = (stock.playerShares / stock.totalShares) * 100
  const floatedPct = (marketShares(stock) / stock.totalShares) * 100

  return (
    <div>
      <h3>Bolsa de valores</h3>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 16 }}>
        <Metric label="Preço da ação" value={`$${stock.sharePrice.toFixed(2)}`} />
        <Metric label="Valuation" value={formatMoney(Math.round(valuation))} />
        <Metric label="Sua participação" value={`${ownershipPct.toFixed(1)}%`} />
        <Metric label="No mercado" value={`${formatShares(marketShares(stock))} (${floatedPct.toFixed(0)}%)`} />
      </div>

      <StockChart history={stock.history} ipoDone={stock.ipoDone} />

      <p style={{ color: 'var(--text-dim)', fontSize: 12.5, marginTop: 16, maxWidth: 520 }}>
        O mercado regula sozinho a venda das suas ações, colocando lotes à venda ao longo do tempo até cerca de{' '}
        {Math.round(MAX_FLOAT * 100)}% da companhia. Cada lote comprado entra como caixa para a empresa. Quanto
        melhor a saúde da companhia, maior o preço — e mais você recebe.
      </p>
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
