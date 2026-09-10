import type { FinanceEvent, GameState } from '../types'
import { formatMoney } from '../format'

function category(label: string): string {
  if (label.startsWith('Voo ')) return 'Voo'
  if (label.startsWith('Custos fixos')) return 'Custo fixo'
  if (label.startsWith('Comprou') && label.includes(' kg')) return 'Combustível'
  if (label.startsWith('Comprou') || label.startsWith('Ampliou')) return 'Frota'
  if (label.startsWith('Revisão') || label.startsWith('Manutenção')) return 'Manutenção'
  if (label.includes('gerente')) return 'Gerência'
  if (label.includes('capital') || label.includes('mercado colocou') || label.startsWith('IPO')) return 'Bolsa'
  if (label.includes('fundada')) return 'Fundação'
  return '—'
}

export function LedgerPanel({ state }: { state: GameState }) {
  const events = state.ledger
  const income = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
  const outgo = events.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0)

  return (
    <div>
      <h3>Extrato</h3>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
        <Metric label={`Entradas (${events.length} lançamentos)`} value={formatMoney(Math.round(income))} tone="var(--green)" />
        <Metric label="Saídas" value={formatMoney(Math.round(outgo))} tone="var(--red)" />
        <Metric
          label="Saldo do período"
          value={`${income + outgo >= 0 ? '+' : ''}${formatMoney(Math.round(income + outgo))}`}
          tone={income + outgo >= 0 ? 'var(--green)' : 'var(--red)'}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Categoria</th>
              <th>Evento</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event: FinanceEvent) => (
              <tr key={event.id}>
                <td style={{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {new Date(event.t).toLocaleTimeString('pt-BR')}
                </td>
                <td>
                  <span className="badge">{category(event.label)}</span>
                </td>
                <td>{event.label}</td>
                <td
                  style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                  className={event.amount > 0 ? 'money-pos' : event.amount < 0 ? 'money-neg' : undefined}
                >
                  {event.amount !== 0 ? formatMoney(event.amount) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: 17, color: tone }}>{value}</div>
    </div>
  )
}
