import { AIRCRAFT_MODELS } from '../data/aircraft'
import { useGameStore } from '../store/gameStore'
import { formatMoney } from '../format'
import type { GameState } from '../types'

const CATEGORY_LABEL: Record<string, string> = {
  regional: 'Regional',
  narrowbody: 'Corredor único',
  widebody: 'Longo curso',
}

export function MarketPanel({ state }: { state: GameState }) {
  const buyAircraft = useGameStore((s) => s.buyAircraft)

  return (
    <div>
      <h3>Mercado de aeronaves</h3>
      <table>
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Categoria</th>
            <th>Alcance</th>
            <th>Assentos</th>
            <th>Preço</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {AIRCRAFT_MODELS.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{CATEGORY_LABEL[m.category]}</td>
              <td>{m.rangeKm.toLocaleString('pt-BR')} km</td>
              <td>{m.seats}</td>
              <td>{formatMoney(m.price)}</td>
              <td>
                <button disabled={state.cash < m.price} onClick={() => buyAircraft(m.id)}>
                  Comprar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
