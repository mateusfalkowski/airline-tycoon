import { useState } from 'react'
import type { AircraftCategory } from '../types'

const CATEGORY_WORD: Record<AircraftCategory, string> = {
  regional: 'Regional',
  narrowbody: 'Corredor único',
  widebody: 'Longo curso',
}

/**
 * Aircraft image for the market card. Shows `public/aircraft/<modelId>.png` if you've
 * added one (see public/aircraft/README.md). Until then, a neutral placeholder — drop
 * in your own images (ones you have the right to publish) and they appear automatically.
 */
export function AircraftImage({
  modelId,
  category,
  width = 200,
}: {
  modelId: string
  category: AircraftCategory
  width?: number
}) {
  const [usePng, setUsePng] = useState(true)
  const src = `${import.meta.env.BASE_URL}aircraft/${modelId}.png`
  const height = Math.round(width * 0.42)

  if (usePng) {
    return (
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        onError={() => setUsePng(false)}
        style={{ objectFit: 'contain', height, width: '100%', maxWidth: width }}
      />
    )
  }

  return (
    <div
      aria-hidden
      style={{
        width: '100%',
        maxWidth: width,
        height,
        borderRadius: 'var(--radius-sm)',
        border: '1px dashed var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--text-dim)',
        fontSize: 12,
      }}
    >
      <span style={{ fontSize: 20, opacity: 0.7 }}>✈️</span>
      {CATEGORY_WORD[category]}
    </div>
  )
}
