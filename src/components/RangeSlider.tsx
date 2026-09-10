function clampPct(p: number): number {
  return Math.min(100, Math.max(0, p))
}

export function RangeSlider({
  value,
  min,
  max,
  step = 1,
  marker,
  markerLabel,
  onChange,
  formatEnd,
}: {
  value: number
  min: number
  max: number
  step?: number
  marker?: number
  markerLabel?: string
  onChange: (value: number) => void
  formatEnd?: (value: number) => string
}) {
  const span = max - min || 1
  const fillPct = clampPct(((value - min) / span) * 100)
  const markerPct = marker != null ? clampPct(((marker - min) / span) * 100) : null
  const end = formatEnd ?? ((v: number) => String(v))

  return (
    <div style={{ position: 'relative', paddingTop: markerPct != null ? 15 : 0 }}>
      {markerPct != null && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${markerPct}%`,
            transform: 'translateX(-50%)',
            fontSize: 9,
            color: 'var(--text-dim)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          ▾ {markerLabel ?? ''}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          background: `linear-gradient(to right, var(--accent) ${fillPct}%, var(--border) ${fillPct}%)`,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>
        <span>{end(min)}</span>
        <span>{end(max)}</span>
      </div>
    </div>
  )
}
