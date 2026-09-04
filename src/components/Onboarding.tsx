import { useState } from 'react'
import { AIRPORTS } from '../data/airports'
import { useGameStore } from '../store/gameStore'

export function Onboarding() {
  const createCompany = useGameStore((s) => s.createCompany)
  const [name, setName] = useState('')
  const [hub, setHub] = useState(AIRPORTS[0].code)

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ fontSize: 40, marginBottom: 4 }}>✈️</div>
        <h1 style={{ fontSize: 26 }}>Airline Tycoon</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
          Funde sua companhia aérea, monte sua frota e conquiste os céus.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Nome da companhia</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Falkowski Airlines"
              maxLength={40}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Aeroporto sede (hub)</span>
            <select value={hub} onChange={(e) => setHub(e.target.value)}>
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
            style={{ marginTop: 8, padding: '11px 16px' }}
          >
            Fundar companhia
          </button>
        </div>
      </div>
    </div>
  )
}
