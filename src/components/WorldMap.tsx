import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { GameState, SeatClass } from '../types'
import { AIRPORTS, findAirport, routeLegsKm, isRouteReachable, hasFreeSlot } from '../data/airports'
import { findAircraftModel } from '../data/aircraft'
import { distanceKm, interpolateGreatCircle } from '../engine/geo'
import { computeRouteDemand, seasonalMultiplier } from '../engine/demand'
import {
  fairPriceForClass,
  flightTimeHours,
  planFlight,
  estimateLoadFactor,
  STOPOVER_FEE,
  STOPOVER_GROUND_HOURS,
  trainingMultiplier,
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
  const dragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    moved: boolean
    captured: boolean
  } | null>(null)
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
    // Deliberately don't capture the pointer yet — only once a real drag starts (see
    // handlePointerMove). Capturing unconditionally here risked swallowing the plain
    // click that follows a no-movement press in some browsers.
    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: view.x,
      startY: view.y,
      moved: false,
      captured: false,
    }
  }

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    const rect = svgRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    // Drag-vs-click is judged in real screen pixels — a click always has a little incidental
    // wobble, and this must be forgiving enough not to eat it.
    if (!d.moved && (Math.abs(e.clientX - d.startClientX) > 6 || Math.abs(e.clientY - d.startClientY) > 6)) {
      d.moved = true
    }
    if (!d.moved) return
    if (!d.captured) {
      e.currentTarget.setPointerCapture(d.pointerId)
      d.captured = true
    }
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
  const [pickVia, setPickVia] = useState<string | null>(null)
  const [prices, setPrices] = useState<Record<SeatClass, number>>({ economy: 0, business: 0, first: 0 })

  const hub = state.company.hubCode
  const q = query.trim().toLowerCase()
  const seasonPct = Math.round((seasonalMultiplier(now) - 1) * 100)

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
    setPickVia(null)
  }

  const originAp = pickOrigin ? findAirport(pickOrigin) : undefined
  const inRange = (code: string): boolean => {
    if (!builderModel || !originAp) return true
    const a = findAirport(code)
    return !!a && distanceKm(originAp, a) <= builderModel.rangeKm
  }
  const needsVia = building && !!pickDest && !inRange(pickDest)
  const destReachable = (code: string): boolean => {
    if (!hasFreeSlot(state.routes, code)) return false
    if (!builderModel || !originAp) return true
    return inRange(code) || isRouteReachable(originAp.code, code, builderModel.rangeKm)
  }
  const viaEligible = (code: string): boolean => {
    if (!builderModel || !originAp || !pickDest) return false
    if (code === pickOrigin || code === pickDest) return false
    if (!hasFreeSlot(state.routes, code)) return false
    const destAp = findAirport(pickDest)
    const viaAp = findAirport(code)
    if (!destAp || !viaAp) return false
    return distanceKm(originAp, viaAp) <= builderModel.rangeKm && distanceKm(viaAp, destAp) <= builderModel.rangeKm
  }

  const onAirportClick = (code: string) => {
    if (suppressClickRef.current) return
    if (!building) return
    if (!pickOrigin) {
      if (!hasFreeSlot(state.routes, code)) return
      setPickOrigin(code)
      return
    }
    if (!pickDest) {
      if (code === pickOrigin || !destReachable(code)) return
      const dst = findAirport(code)!
      const dist = distanceKm(originAp!, dst)
      const init = {} as Record<SeatClass, number>
      for (const cls of SEAT_CLASSES) init[cls] = Math.round(fairPriceForClass(dist, cls))
      setPrices(init)
      setPickDest(code)
      setPickVia(null)
      return
    }
    if (needsVia && viaEligible(code)) {
      setPickVia(code)
    }
  }

  const flights = useMemo(() => {
    return state.fleet
      .filter((ac) => ac.status === 'flying' && ac.flight)
      .map((ac) => {
        const route = state.routes.find((r) => r.id === ac.flight!.routeId)
        // Aircraft alternate direction each dispatch — the flight itself carries which way this
        // one goes; only a flight in progress from before that field existed falls back to the
        // route's own origin/dest.
        const origin = route ? findAirport(ac.flight!.originCode ?? route.originCode) : undefined
        const dest = route ? findAirport(ac.flight!.destCode ?? route.destCode) : undefined
        const via = route?.viaCode ? findAirport(route.viaCode) : undefined
        if (!route || !origin || !dest) return null
        const model = findAircraftModel(ac.modelId)

        const overall = Math.min(
          1,
          Math.max(0, (now - ac.flight!.departedAt) / (ac.flight!.arrivesAt - ac.flight!.departedAt)),
        )

        let legA = origin
        let legB = dest
        let f = overall
        let arc: string

        if (via && model) {
          const leg1Hours = flightTimeHours(distanceKm(origin, via), model.cruiseSpeedKmh)
          const leg2Hours = flightTimeHours(distanceKm(via, dest), model.cruiseSpeedKmh)
          const elapsedHours = overall * ac.flight!.hours
          if (elapsedHours <= leg1Hours) {
            legB = via
            f = leg1Hours > 0 ? elapsedHours / leg1Hours : 1
          } else if (elapsedHours <= leg1Hours + STOPOVER_GROUND_HOURS) {
            legA = via
            legB = via
            f = 0
          } else {
            legA = via
            f = leg2Hours > 0 ? (elapsedHours - leg1Hours - STOPOVER_GROUND_HOURS) / leg2Hours : 1
          }
          const leg1Arc = Array.from({ length: 17 }, (_, i) => {
            const g = interpolateGreatCircle(origin, via, i / 16)
            return project(g.lat, g.lon).join(',')
          })
          const leg2Arc = Array.from({ length: 17 }, (_, i) => {
            const g = interpolateGreatCircle(via, dest, i / 16)
            return project(g.lat, g.lon).join(',')
          })
          arc = [...leg1Arc, ...leg2Arc].join(' ')
        } else {
          arc = Array.from({ length: 33 }, (_, i) => {
            const g = interpolateGreatCircle(origin, dest, i / 32)
            return project(g.lat, g.lon).join(',')
          }).join(' ')
        }

        const p = interpolateGreatCircle(legA, legB, f)
        const ahead = interpolateGreatCircle(legA, legB, Math.min(1, f + 0.02))
        const [x, y] = project(p.lat, p.lon)
        const [ax, ay] = project(ahead.lat, ahead.lon)
        const heading = (Math.atan2(ay - y, ax - x) * 180) / Math.PI
        return { ac, route, origin, dest, via, f: overall, x, y, heading, arc, model }
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
  }, [state.fleet, state.routes, now])

  const selected = !building ? flights.find((fl) => fl.ac.id === selectedAircraft) : undefined

  // Builder preview arc + numbers.
  const preview = useMemo(() => {
    if (!building || !originAp || !pickDest || !builderModel || (needsVia && !pickVia)) return null
    const dst = findAirport(pickDest)!
    const via = pickVia ? findAirport(pickVia) : undefined
    const legs = routeLegsKm(pickOrigin!, pickDest, pickVia ?? undefined)
    if (!legs) return null
    const plan = planFlight(builderModel, legs.leg1Km, legs.leg2Km, trainingMultiplier(state.training.fuel))
    const dist = Math.round(plan.distanceKm)

    const arc = via
      ? [
          ...Array.from({ length: 17 }, (_, i) => {
            const g = interpolateGreatCircle(originAp, via, i / 16)
            return project(g.lat, g.lon).join(',')
          }),
          ...Array.from({ length: 17 }, (_, i) => {
            const g = interpolateGreatCircle(via, dst, i / 16)
            return project(g.lat, g.lon).join(',')
          }),
        ].join(' ')
      : Array.from({ length: 33 }, (_, i) => {
          const g = interpolateGreatCircle(originAp, dst, i / 32)
          return project(g.lat, g.lon).join(',')
        }).join(' ')

    const demand = computeRouteDemand(originAp, dst, dist, now)
    const activeClasses = SEAT_CLASSES.filter((c) => (builderAircraft?.seatConfig[c] ?? 0) > 0)
    const revenue = activeClasses.reduce((sum, c) => {
      const load = estimateLoadFactor(dist, c, prices[c], state.company.reputation)
      const pax = Math.min(builderAircraft!.seatConfig[c], Math.round(demand[c] * load))
      return sum + pax * prices[c]
    }, 0)
    const stopoverFee = pickVia ? STOPOVER_FEE[builderModel.category] : 0
    const cost = plan.tonnes * state.fuel.price + builderModel.maintenancePerHour * plan.hours + stopoverFee
    return { dst, dist, arc, demand, hours: plan.hours, activeClasses, revenue, cost, profit: revenue - cost }
  }, [
    building,
    originAp,
    pickOrigin,
    pickDest,
    pickVia,
    needsVia,
    builderModel,
    builderAircraft,
    prices,
    state.company.reputation,
    state.fuel.price,
    state.training.fuel,
  ])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Mapa</h3>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          {flights.length} {flights.length === 1 ? 'voo em andamento' : 'voos em andamento'}
        </span>

        {Math.abs(seasonPct) >= 3 && (
          <span
            className="badge"
            style={seasonPct > 0 ? { color: 'var(--green)', borderColor: 'var(--green)' } : { color: 'var(--red)', borderColor: 'var(--red)' }}
            title="Demanda de passageiros varia ao longo do ano"
          >
            {seasonPct > 0 ? '📈' : '📉'} Temporada {seasonPct > 0 ? 'alta' : 'baixa'} ({seasonPct > 0 ? '+' : ''}
            {seasonPct}%)
          </span>
        )}

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
            const isVia = building && pickVia === a.code
            const isHovered = hoverAirport === a.code
            const disabled =
              (building && !pickOrigin && !hasFreeSlot(state.routes, a.code)) ||
              (building && !!pickOrigin && !pickDest && a.code !== pickOrigin && !destReachable(a.code)) ||
              (building && !!pickDest && needsVia && a.code !== pickOrigin && a.code !== pickDest && !viaEligible(a.code))
            // Most airports sit out as a quiet dot — only the ones actually in play (hub, a
            // builder pick, a search match, or hovered) earn the full pin. 48 airports' worth of
            // pins on screen at once was too busy.
            const highlighted = isHub || isOrigin || isDest || isVia || isHovered || (on && !!q)
            let fill = isHub ? '#ffd24a' : '#eaf1fb'
            if (isOrigin) fill = '#7fe0a8'
            if (isDest) fill = '#4cc6fb'
            if (isVia) fill = '#c78cf0'
            const big = isHub || isOrigin || isDest || isVia
            return (
              <g
                key={a.code}
                transform={`translate(${x} ${y}) scale(${1 / view.zoom})`}
                onMouseEnter={() => setHoverAirport(a.code)}
                onMouseLeave={() => setHoverAirport((c) => (c === a.code ? null : c))}
                onClick={() => onAirportClick(a.code)}
                style={{ cursor: building && !disabled ? 'pointer' : 'default' }}
              >
                {/* Generous invisible hit area — much bigger than the marker itself so it's easy to click. */}
                <circle cx={0} cy={-9} r={13} fill="transparent" />
                {highlighted ? (
                  <g transform={big ? 'scale(1.25)' : undefined} opacity={disabled ? 0.15 : 1}>
                    <path
                      d="M0 0 L-5.5 -11.5 A6.5 6.5 0 1 1 5.5 -11.5 Z"
                      fill={fill}
                      stroke="#0a1424"
                      strokeWidth="0.8"
                    />
                    <circle cx={0} cy={-11.5} r={2.6} fill="#0a1424" />
                  </g>
                ) : (
                  <circle cx={0} cy={0} r={2.1} fill="#eaf1fb" opacity={disabled ? 0.12 : 0.4} />
                )}
                {(isOrigin || isDest || isVia) && (
                  <circle cx={0} cy={-11.5} r={9} fill="none" stroke={fill} strokeWidth="1.5" />
                )}
                {isHub && !isOrigin && !isDest && (
                  <circle cx={0} cy={-11.5} r={8.5} fill="none" stroke="#ffd24a" strokeWidth="1" opacity={0.8} />
                )}
                {highlighted && (
                  <text x={9} y={-9} fontSize="8.5" fill="#fff" stroke="#0a1424" strokeWidth="2.4" paintOrder="stroke">
                    {a.code}
                  </text>
                )}
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
              width: 250,
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
              {selected.origin.code} → {selected.via ? `${selected.via.code} → ` : ''}
              {selected.dest.code} · {selected.route.distanceKm.toLocaleString('pt-BR')} km
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ height: 6, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(selected.f * 100)}%`, height: '100%', background: 'var(--accent)' }} />
              </div>
              <div style={{ color: 'var(--text-dim)', marginTop: 4 }}>
                {Math.round(selected.f * 100)}% · chega em {formatCountdown(selected.ac.flight!.arrivesAt - now)}
              </div>
            </div>

            {selected.ac.flight && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid var(--border-soft)',
                  display: 'flex',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                {selected.ac.flight.passengers !== undefined ? (
                  <>
                    <span className="stat-chip">
                      {selected.ac.flight.passengers} pax · {Math.round(selected.ac.flight.loadFactor! * 100)}% ocupação
                    </span>
                    <span
                      className="stat-chip"
                      style={{ color: selected.ac.flight.profit! >= 0 ? 'var(--green)' : 'var(--red)' }}
                    >
                      {selected.ac.flight.profit! >= 0 ? '+' : ''}
                      {formatMoney(selected.ac.flight.profit!)} nesse voo
                    </span>
                    {!!selected.ac.flight.localFuelCountries?.length && (
                      <span className="stat-chip" style={{ color: 'var(--text-dim)' }}>
                        combustível local ({selected.ac.flight.localFuelCountries.join(', ')})
                      </span>
                    )}
                    {!!selected.ac.flight.cargoRevenue && (
                      <span className="stat-chip" style={{ color: 'var(--text-dim)' }}>
                        +{formatMoney(selected.ac.flight.cargoRevenue)} carga
                      </span>
                    )}
                  </>
                ) : (
                  <span className="stat-chip" style={{ color: 'var(--text-dim)' }}>
                    voo iniciado antes desta atualização — sem esses dados
                  </span>
                )}
              </div>
            )}

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
              {SEAT_CLASSES.filter((cls) => selected.ac.seatConfig[cls] > 0).map((cls) => (
                <div key={cls} className="stat-chip" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{CLASS_LABEL[cls]}</span>
                  <strong style={{ color: 'var(--text-h)' }}>{formatMoney(selected.route.prices[cls])}</strong>
                </div>
              ))}
            </div>

            <div style={{ color: 'var(--text-dim)', marginTop: 8 }}>
              Desgaste {Math.round(selected.ac.wear * 100)}%
              {selected.ac.autoManaged ? ' · operação automática' : ''}
            </div>
          </div>
        )}
      </div>

      {building && needsVia && !pickVia && (
        <div
          style={{
            marginTop: 12,
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--panel)',
            padding: 14,
            color: 'var(--text-dim)',
            fontSize: 13,
          }}
        >
          <strong style={{ color: 'var(--text-h)' }}>
            {pickOrigin} → {pickDest}
          </strong>{' '}
          fica fora do alcance direto da aeronave — clique em outro aeroporto no mapa para usá-lo como escala.
          Os que não servem (perna longa demais de um dos lados) ficam apagados.
        </div>
      )}

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
              {pickOrigin} → {pickVia ? `${pickVia} → ` : ''}
              {pickDest}
            </strong>{' '}
            · {preview.dist.toLocaleString('pt-BR')} km · {formatDuration(preview.hours)} de voo
            {pickVia ? ' (com escala)' : ''}
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

          {pickOrigin && !hasFreeSlot(state.routes, pickOrigin) && (
            <div className="stat-chip" style={{ color: 'var(--red)' }}>
              {pickOrigin} sem vagas de pouso disponíveis
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="primary"
              disabled={!pickOrigin || !hasFreeSlot(state.routes, pickOrigin)}
              onClick={() => {
                createRoute(pickOrigin!, pickDest!, builderAircraft.id, prices, pickVia ?? undefined)
                resetBuilder()
              }}
            >
              Criar rota
            </button>
            <button
              onClick={() => {
                setPickDest(null)
                setPickVia(null)
              }}
            >
              Trocar destino
            </button>
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
