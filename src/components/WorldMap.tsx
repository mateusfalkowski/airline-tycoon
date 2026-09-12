import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { GameState, SeatClass } from '../types'
import { AIRPORTS, findAirport } from '../data/airports'
import { findAircraftModel } from '../data/aircraft'
import { distanceKm, interpolateGreatCircle } from '../engine/geo'
import { computeRouteDemand } from '../engine/demand'
import {
  fairPriceForClass,
  flightTimeHours,
  fuelTonnes,
  estimateLoadFactor,
  SEAT_CLASSES,
} from '../engine/economy'
import { useGameStore } from '../store/gameStore'
import { formatCountdown, formatDuration, formatMoney, formatShares } from '../format'
import { NumberInput } from './NumberInput'

const W = 720
const H = 360
const MIN_ZOOM = 1
const MAX_ZOOM = 10

interface MapView {
  zoom: number
  x: number
  y: number
}

function clampView(v: MapView): MapView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom))
  const minX = W - W * zoom
  const minY = H - H * zoom
  return { zoom, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) }
}

// NASA "Blue Marble: Next Generation" composite — public domain, equirectangular, 5400x2700
// (high enough res to stay sharp at max map zoom, ~2.5MB).
const SATELLITE = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg'

const CLASS_LABEL: Record<SeatClass, string> = {
  economy: 'Econômica',
  business: 'Executiva',
  first: 'Primeira',
}

function project(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * W, ((90 - lat) / 180) * H]
}

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
  const createRoute = useGameStore((s) => s.createRoute)

  const [query, setQuery] = useState('')
  const [selectedAircraft, setSelectedAircraft] = useState<string | null>(null)
  const [hoverAirport, setHoverAirport] = useState<string | null>(null)
  const [satOk, setSatOk] = useState(true)

  const [view, setView] = useState<MapView>({ zoom: 1, x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number; moved: boolean } | null>(
    null,
  )
  const suppressClickRef = useRef(false)

  const zoomAt = (cx: number, cy: number, factor: number) => {
    setView((v) => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
      const worldX = (cx - v.x) / v.zoom
      const worldY = (cy - v.y) / v.zoom
      return clampView({ zoom: nextZoom, x: cx - worldX * nextZoom, y: cy - worldY * nextZoom })
    })
  }

  const handleWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = ((e.clientX - rect.left) / rect.width) * W
    const cy = ((e.clientY - rect.top) / rect.height) * H
    zoomAt(cx, cy, e.deltaY < 0 ? 1.25 : 0.8)
  }

  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: view.x, startY: view.y, moved: false }
  }

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    const rect = svgRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    // Drag-vs-click is judged in real screen pixels — a click always has a little incidental
    // wobble, and this must be forgiving enough not to eat it.
    if (Math.abs(e.clientX - d.startClientX) > 6 || Math.abs(e.clientY - d.startClientY) > 6) d.moved = true
    const dx = ((e.clientX - d.startClientX) / rect.width) * W
    const dy = ((e.clientY - d.startClientY) / rect.height) * H
    setView((v) => clampView({ ...v, x: d.startX + dx, y: d.startY + dy }))
  }

  const handlePointerUp = () => {
    const d = dragRef.current
    dragRef.current = null
    if (d?.moved) {
      suppressClickRef.current = true
      setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
  }

  const [builderId, setBuilderId] = useState<string>('')
  const [pickOrigin, setPickOrigin] = useState<string | null>(null)
  const [pickDest, setPickDest] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<SeatClass, number>>({ economy: 0, business: 0, first: 0 })

  const hub = state.company.hubCode
  const q = query.trim().toLowerCase()

  const idleNoRoute = state.fleet.filter(
    (a) => a.status === 'idle' && !state.routes.some((r) => r.aircraftId === a.id),
  )
  const builderAircraft = state.fleet.find((a) => a.id === builderId)
  const builderModel = builderAircraft ? findAircraftModel(builderAircraft.modelId) : undefined
  const building = Boolean(builderAircraft && builderModel)

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

  const resetBuilder = () => {
    setBuilderId('')
    setPickOrigin(null)
    setPickDest(null)
  }

  const originAp = pickOrigin ? findAirport(pickOrigin) : undefined
  const inRange = (code: string): boolean => {
    if (!builderModel || !originAp) return true
    const a = findAirport(code)
    return !!a && distanceKm(originAp, a) <= builderModel.rangeKm
  }

  const onAirportClick = (code: string) => {
    if (suppressClickRef.current) return
    if (!building) return
    if (!pickOrigin) {
      setPickOrigin(code)
      return
    }
    if (!pickDest) {
      if (code === pickOrigin || !inRange(code)) return
      const dst = findAirport(code)!
      const dist = distanceKm(originAp!, dst)
      const init = {} as Record<SeatClass, number>
      for (const cls of SEAT_CLASSES) init[cls] = Math.round(fairPriceForClass(dist, cls))
      setPrices(init)
      setPickDest(code)
    }
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

  const selected = !building ? flights.find((fl) => fl.ac.id === selectedAircraft) : undefined

  // Builder preview arc + numbers.
  const preview = useMemo(() => {
    if (!building || !originAp || !pickDest || !builderModel) return null
    const dst = findAirport(pickDest)!
    const dist = Math.round(distanceKm(originAp, dst))
    const arc = Array.from({ length: 33 }, (_, i) => {
      const g = interpolateGreatCircle(originAp, dst, i / 32)
      return project(g.lat, g.lon).join(',')
    }).join(' ')
    const demand = computeRouteDemand(originAp, dst, dist)
    const hours = flightTimeHours(dist, builderModel.cruiseSpeedKmh)
    const activeClasses = SEAT_CLASSES.filter((c) => (builderAircraft?.seatConfig[c] ?? 0) > 0)
    const revenue = activeClasses.reduce((sum, c) => {
      const load = estimateLoadFactor(dist, c, prices[c], state.company.reputation)
      const pax = Math.min(builderAircraft!.seatConfig[c], Math.round(demand[c] * load))
      return sum + pax * prices[c]
    }, 0)
    const cost = fuelTonnes(builderModel, dist) * state.fuel.price + builderModel.maintenancePerHour * hours
    return { dst, dist, arc, demand, hours, activeClasses, revenue, cost, profit: revenue - cost }
  }, [building, originAp, pickDest, builderModel, builderAircraft, prices, state.company.reputation, state.fuel.price])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Mapa</h3>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {flights.length} {flights.length === 1 ? 'voo em andamento' : 'voos em andamento'}
        </span>

        {building ? (
          <button style={{ fontSize: 12 }} onClick={resetBuilder}>
            Cancelar nova rota
          </button>
        ) : idleNoRoute.length > 0 ? (
          <select
            value=""
            onChange={(e) => {
              setBuilderId(e.target.value)
              setPickOrigin(hub)
              setPickDest(null)
              setSelectedAircraft(null)
            }}
          >
            <option value="">➕ Criar rota para…</option>
            {idleNoRoute.map((a) => {
              const m = findAircraftModel(a.modelId)
              return (
                <option key={a.id} value={a.id}>
                  {m?.name ?? a.modelId}
                </option>
              )
            })}
          </select>
        ) : null}

        <input
          style={{ marginLeft: 'auto', width: 220, maxWidth: '100%' }}
          placeholder="Buscar aeroporto, cidade ou país"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {building && (
        <div className="stat-chip" style={{ marginBottom: 8 }}>
          {builderModel?.name} · alcance {builderModel?.rangeKm.toLocaleString('pt-BR')} km —{' '}
          {!pickOrigin
            ? 'clique no aeroporto de origem'
            : !pickDest
              ? `origem ${pickOrigin} · clique no destino (dentro do alcance)`
              : `${pickOrigin} → ${pickDest}`}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--panel)',
          overflow: 'hidden',
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', display: 'block', background: '#0a1424', touchAction: 'none', cursor: 'grab' }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
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
                vectorEffect="non-scaling-stroke"
              />
            ))
          )}

          {[-120, -60, 0, 60, 120].map((lon) => {
            const [x] = project(0, lon)
            return (
              <line
                key={`v${lon}`}
                x1={x}
                y1={0}
                x2={x}
                y2={H}
                stroke="#fff"
                strokeOpacity="0.08"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const [, y] = project(lat, 0)
            return (
              <line
                key={`h${lat}`}
                x1={0}
                y1={y}
                x2={W}
                y2={y}
                stroke="#fff"
                strokeOpacity="0.08"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {flights.map((fl) => (
            <polyline
              key={`arc-${fl.ac.id}`}
              points={fl.arc}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              opacity={building ? 0.15 : selectedAircraft && selectedAircraft !== fl.ac.id ? 0.25 : 0.55}
            />
          ))}

          {preview && (
            <polyline
              points={preview.arc}
              fill="none"
              stroke="#7fe0a8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {AIRPORTS.map((a) => {
            const [x, y] = project(a.lat, a.lon)
            const on = matches(a.code)
            const isHub = a.code === hub
            const isOrigin = building && pickOrigin === a.code
            const isDest = building && pickDest === a.code
            const disabled = building && !!pickOrigin && !pickDest && a.code !== pickOrigin && !inRange(a.code)
            let fill = isHub ? '#ffd24a' : '#eaf1fb'
            if (isOrigin) fill = '#7fe0a8'
            if (isDest) fill = '#4cc6fb'
            return (
              <g
                key={a.code}
                transform={`translate(${x} ${y}) scale(${1 / view.zoom})`}
                onMouseEnter={() => setHoverAirport(a.code)}
                onMouseLeave={() => setHoverAirport((c) => (c === a.code ? null : c))}
                onClick={() => onAirportClick(a.code)}
                style={{ cursor: building && !disabled ? 'pointer' : 'default' }}
              >
                <circle
                  cx={0}
                  cy={0}
                  r={isHub || isOrigin || isDest ? 4 : 2.6}
                  fill={fill}
                  stroke="#0a1424"
                  strokeWidth="1"
                  opacity={disabled ? 0.15 : on ? 1 : 0.22}
                />
                {(isOrigin || isDest) && <circle cx={0} cy={0} r={7} fill="none" stroke={fill} strokeWidth="1.5" />}
                {isHub && !isOrigin && !isDest && (
                  <circle cx={0} cy={0} r={6.5} fill="none" stroke="#ffd24a" strokeWidth="1" opacity={on ? 0.8 : 0.2} />
                )}
                {(on && q) || hoverAirport === a.code || isOrigin || isDest ? (
                  <text x={5} y={3} fontSize="8.5" fill="#fff" stroke="#0a1424" strokeWidth="2.4" paintOrder="stroke">
                    {a.code}
                  </text>
                ) : null}
              </g>
            )
          })}

          {!building &&
            flights.map((fl) => (
              <g
                key={`ac-${fl.ac.id}`}
                transform={`translate(${fl.x} ${fl.y}) rotate(${fl.heading}) scale(${1 / view.zoom})`}
                onClick={() => {
                  if (suppressClickRef.current) return
                  setSelectedAircraft(fl.ac.id)
                }}
                style={{ cursor: 'pointer' }}
              >
                <circle r="16" fill="transparent" />
                <path
                  d="M10 0 L3 -1.2 L-2 -9 L0 -1.5 L-6 -1 L-8 -4 L-7.5 -0.8 L-9 0 L-7.5 0.8 L-8 4 L-6 1 L0 1.5 L-2 9 L3 1.2 Z"
                  fill={selectedAircraft === fl.ac.id ? 'var(--accent)' : 'var(--text-h)'}
                  stroke="var(--bg)"
                  strokeWidth="0.5"
                  strokeLinejoin="round"
                />
              </g>
            ))}
        </g>
        </svg>

        <div
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <button
            type="button"
            style={{ fontSize: 14, padding: '2px 10px', lineHeight: 1.4 }}
            onClick={() => zoomAt(W / 2, H / 2, 1.5)}
            title="Aproximar"
          >
            +
          </button>
          <button
            type="button"
            style={{ fontSize: 14, padding: '2px 10px', lineHeight: 1.4 }}
            onClick={() => zoomAt(W / 2, H / 2, 1 / 1.5)}
            title="Afastar"
          >
            −
          </button>
          {view.zoom > 1 && (
            <button
              type="button"
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
              title="Restaurar visão"
            >
              ⟲
            </button>
          )}
        </div>

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

      {preview && builderAircraft && (
        <div
          style={{
            marginTop: 12,
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--panel)',
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div className="stat-chip">
            <strong>
              {pickOrigin} → {pickDest}
            </strong>{' '}
            · {preview.dist.toLocaleString('pt-BR')} km · {formatDuration(preview.hours)} de voo
          </div>
          <div className="stat-chip">
            Demanda diária:{' '}
            {preview.activeClasses.map((c) => `${CLASS_LABEL[c]} ${formatShares(preview.demand[c])}`).join(' · ')}
          </div>

          {preview.activeClasses.map((c) => {
            const suggested = Math.round(fairPriceForClass(preview.dist, c))
            return (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, width: 84, color: 'var(--text-dim)' }}>{CLASS_LABEL[c]}</span>
                <span style={{ color: 'var(--text-dim)' }}>$</span>
                <NumberInput
                  style={{ width: 80 }}
                  min={1}
                  value={prices[c]}
                  onChange={(v) => setPrices((p) => ({ ...p, [c]: v }))}
                />
                <button
                  type="button"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  disabled={prices[c] === suggested}
                  onClick={() => setPrices((p) => ({ ...p, [c]: suggested }))}
                >
                  Padrão ${suggested}
                </button>
              </div>
            )
          })}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5 }}>
            <span className="stat-chip">
              Receita est./voo <strong>{formatMoney(Math.round(preview.revenue))}</strong>
            </span>
            <span className="stat-chip">
              Lucro est./voo{' '}
              <strong style={{ color: preview.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {preview.profit >= 0 ? '+' : ''}
                {formatMoney(Math.round(preview.profit))}
              </strong>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="primary"
              onClick={() => {
                createRoute(pickOrigin!, pickDest!, builderAircraft.id, prices)
                resetBuilder()
              }}
            >
              Criar rota
            </button>
            <button onClick={() => setPickDest(null)}>Trocar destino</button>
          </div>
        </div>
      )}

      {!building && flights.length === 0 && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 10 }}>
          Nenhum avião no ar. Crie uma rota aqui pelo mapa ou despache um voo na aba Rotas.
        </p>
      )}
    </div>
  )
}
