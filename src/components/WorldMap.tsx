import { useMemo, useState } from 'react'
import type { GameState } from '../types'
import { AIRPORTS, findAirport } from '../data/airports'
import { findAircraftModel } from '../data/aircraft'
import { interpolateGreatCircle } from '../engine/geo'
import { formatCountdown } from '../format'

const W = 720
const H = 360

// NASA "Blue Marble" land/ocean/ice composite — public domain, equirectangular, via Wikimedia's CDN.
const SATELLITE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Land_ocean_ice_2048.jpg/1280px-Land_ocean_ice_2048.jpg'

function project(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]
}

// Very rough continent outlines ([lon, lat] rings) — context only; airports are placed exactly.
const CONTINENTS: [number, number][][] = [
  [
    [-168, 65], [-140, 70], [-95, 72], [-60, 60], [-52, 47], [-65, 45], [-80, 25],
    [-97, 18], [-105, 23], [-117, 32], [-125, 40], [-125, 48], [-135, 58], [-168, 65],
  ],
  [
    [-80, 9], [-60, 8], [-50, 0], [-35, -6], [-40, -23], [-58, -35], [-72, -52],
    [-74, -44], [-70, -18], [-81, -4], [-80, 9],
  ],
  [
    [-10, 36], [-9, 44], [2, 51], [6, 58], [12, 55], [30, 60], [40, 47], [28, 40],
    [15, 38], [-10, 36],
  ],
  [
    [-17, 21], [-5, 35], [11, 37], [33, 32], [43, 12], [51, 12], [40, -4], [35, -20],
    [20, -35], [12, -6], [8, 4], [-8, 5], [-17, 21],
  ],
  [
    [40, 47], [60, 68], [100, 75], [145, 70], [170, 66], [160, 54], [140, 44],
    [128, 35], [122, 24], [105, 9], [95, 6], [80, 8], [72, 20], [58, 25], [45, 40], [40, 47],
  ],
  [
    [113, -22], [130, -12], [142, -11], [153, -28], [147, -38], [130, -32], [115, -35], [113, -22],
  ],
]

export function WorldMap({ state, now }: { state: GameState; now: number }) {
  const [query, setQuery] = useState('')
  const [selectedAircraft, setSelectedAircraft] = useState<string | null>(null)
  const [hoverAirport, setHoverAirport] = useState<string | null>(null)
  const [satOk, setSatOk] = useState(true)

  const q = query.trim().toLowerCase()
  const matches = (code: string): boolean => {
    if (!q) return true
    const a = findAirport(code)
    if (!a) return false
    return (
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.country.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    )
  }

  const flights = useMemo(() => {
    return state.fleet
      .filter((ac) => ac.status === 'flying' && ac.flight)
      .map((ac) => {
        const route = state.routes.find((r) => r.id === ac.flight!.routeId)
        const origin = route ? findAirport(route.originCode) : undefined
        const dest = route ? findAirport(route.destCode) : undefined
        if (!route || !origin || !dest) return null
        const f = Math.min(1, Math.max(0, (now - ac.flight!.departedAt) / (ac.flight!.arrivesAt - ac.flight!.departedAt)))
        const p = interpolateGreatCircle(origin, dest, f)
        const ahead = interpolateGreatCircle(origin, dest, Math.min(1, f + 0.02))
        const [x, y] = project(p.lat, p.lon)
        const [ax, ay] = project(ahead.lat, ahead.lon)
        const heading = (Math.atan2(ay - y, ax - x) * 180) / Math.PI
        const arc = Array.from({ length: 33 }, (_, i) => {
          const g = interpolateGreatCircle(origin, dest, i / 32)
          return project(g.lat, g.lon).join(',')
        }).join(' ')
        return { ac, route, origin, dest, f, x, y, heading, arc, model: findAircraftModel(ac.modelId) }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
  }, [state.fleet, state.routes, now])

  const selected = flights.find((fl) => fl.ac.id === selectedAircraft)
  const hub = state.company.hubCode

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Mapa</h3>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {flights.length} {flights.length === 1 ? 'voo em andamento' : 'voos em andamento'}
        </span>
        <input
          style={{ marginLeft: 'auto', width: 220, maxWidth: '100%' }}
          placeholder="Buscar aeroporto, cidade ou país"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div
        style={{
          position: 'relative',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--panel)',
          overflow: 'hidden',
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', background: '#0a1424' }}>
          {satOk ? (
            <image
              href={SATELLITE}
              x={0}
              y={0}
              width={W}
              height={H}
              preserveAspectRatio="none"
              onError={() => setSatOk(false)}
              style={{ opacity: 0.9 }}
            />
          ) : (
            CONTINENTS.map((ring, i) => (
              <polygon
                key={i}
                points={ring.map(([lon, lat]) => project(lat, lon).join(',')).join(' ')}
                fill="var(--panel-alt)"
                stroke="var(--border-soft)"
                strokeWidth="0.75"
              />
            ))
          )}

          {/* graticule */}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const [x] = project(0, lon)
            return <line key={`v${lon}`} x1={x} y1={0} x2={x} y2={H} stroke="#fff" strokeOpacity="0.08" strokeWidth="0.5" />
          })}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const [, y] = project(lat, 0)
            return <line key={`h${lat}`} x1={0} y1={y} x2={W} y2={y} stroke="#fff" strokeOpacity="0.08" strokeWidth="0.5" />
          })}

          {/* active route arcs */}
          {flights.map((fl) => (
            <polyline
              key={`arc-${fl.ac.id}`}
              points={fl.arc}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity={selectedAircraft && selectedAircraft !== fl.ac.id ? 0.25 : 0.6}
            />
          ))}

          {/* airports */}
          {AIRPORTS.map((a) => {
            const [x, y] = project(a.lat, a.lon)
            const on = matches(a.code)
            const isHub = a.code === hub
            return (
              <g
                key={a.code}
                onMouseEnter={() => setHoverAirport(a.code)}
                onMouseLeave={() => setHoverAirport((c) => (c === a.code ? null : c))}
                style={{ cursor: 'default' }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isHub ? 3.6 : 2.6}
                  fill={isHub ? '#ffd24a' : '#eaf1fb'}
                  stroke="#0a1424"
                  strokeWidth="1"
                  opacity={on ? 1 : 0.22}
                />
                {isHub && <circle cx={x} cy={y} r={6.5} fill="none" stroke="#ffd24a" strokeWidth="1" opacity={on ? 0.8 : 0.2} />}
                {(on && q) || hoverAirport === a.code ? (
                  <text x={x + 5} y={y + 3} fontSize="8.5" fill="#fff" stroke="#0a1424" strokeWidth="2.4" paintOrder="stroke">
                    {a.code}
                  </text>
                ) : null}
              </g>
            )
          })}

          {/* aircraft */}
          {flights.map((fl) => (
            <g
              key={`ac-${fl.ac.id}`}
              transform={`translate(${fl.x} ${fl.y}) rotate(${fl.heading})`}
              onClick={() => setSelectedAircraft(fl.ac.id)}
              style={{ cursor: 'pointer' }}
            >
              <circle r="9" fill="transparent" />
              <path
                d="M8 0 L-5 -4 L-2 0 L-5 4 Z"
                fill={selectedAircraft === fl.ac.id ? 'var(--accent)' : 'var(--text-h)'}
                stroke="var(--bg)"
                strokeWidth="0.5"
              />
            </g>
          ))}
        </svg>

        {selected && (
          <div
            style={{
              position: 'absolute',
              right: 10,
              top: 10,
              width: 220,
              maxWidth: 'calc(100% - 20px)',
              background: 'var(--panel-raised)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              fontSize: 12.5,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong style={{ color: 'var(--text-h)' }}>{selected.model?.name ?? selected.ac.modelId}</strong>
              <button style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => setSelectedAircraft(null)}>
                ✕
              </button>
            </div>
            <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>
              {selected.origin.code} → {selected.dest.code} · {selected.route.distanceKm.toLocaleString('pt-BR')} km
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(selected.f * 100)}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
              <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>
                {Math.round(selected.f * 100)}% · chega em {formatCountdown(selected.ac.flight!.arrivesAt - now)}
              </div>
            </div>
            <div style={{ color: 'var(--text-dim)', marginTop: 6 }}>
              Desgaste {Math.round(selected.ac.wear * 100)}%
              {selected.ac.autoManaged ? ' · operação automática' : ''}
            </div>
          </div>
        )}
      </div>

      {flights.length === 0 && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 10 }}>
          Nenhum avião no ar. Despache um voo na aba Rotas para vê-lo cruzando o mapa.
        </p>
      )}
    </div>
  )
}
