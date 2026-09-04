import type { GameState } from '../types'
import { formatMoney } from '../format'

export function LedgerPanel({ state }: { state: GameState }) {
  return (
    <div>
      <h3>Extrato</h3>
      <table>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Evento</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {state.ledger.map((event) => (
            <tr key={event.id}>
              <td style={{ color: 'var(--text-dim)' }}>{new Date(event.t).toLocaleTimeString('pt-BR')}</td>
              <td>{event.label}</td>
              <td className={event.amount > 0 ? 'money-pos' : event.amount < 0 ? 'money-neg' : undefined}>
                {event.amount !== 0 ? formatMoney(event.amount) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
