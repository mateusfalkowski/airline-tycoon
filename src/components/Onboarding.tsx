import { useState } from 'react'
import { AIRPORTS } from '../data/airports'
import { useGameStore } from '../store/gameStore'

export function Onboarding() {
  const createCompany = useGameStore((s) => s.createCompany)
  const [name, setName] = useState('')
  const [hub, setHub] = useState(AIRPORTS[0].code)

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 28 }}>✈️ Airline Tycoon</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
        Funde sua companhia aérea, monte sua frota e conquiste os céus.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          Nome da companhia
          <input
            style={{ width: '100%', marginTop: 4 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Falkowski Airlines"
            maxLength={40}
          />
        </label>

        <label>
          Aeroporto sede (hub)
          <select style={{ width: '100%', marginTop: 4 }} value={hub} onChange={(e) => setHub(e.target.value)}>
            {AIRPORTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.city}, {a.country}
              </option>
            ))}
          </select>
        </label>

        <button
          className="primary"
          disabled={name.trim().length < 2}
          onClick={() => createCompany(name.trim(), hub)}
          style={{ marginTop: 8 }}
        >
          Fundar companhia
        </button>
      </div>
    </div>
  )
}
