import type { AircraftCategory } from '../types'

/** Simple side-view silhouettes, one per category. Uses currentColor so they follow the theme. */
export function AircraftArt({ category, width = 132 }: { category: AircraftCategory; width?: number }) {
  const height = Math.round(width * (46 / 132))
  return (
    <svg
      viewBox="0 0 132 46"
      width={width}
      height={height}
      role="img"
      aria-label={`Ilustração ${category}`}
      style={{ color: 'var(--text-dim)', flexShrink: 0 }}
    >
      {category === 'regional' && (
        <g fill="currentColor">
          {/* fuselage */}
          <path d="M8 24 q0 -5 10 -6 l82 0 q14 0 18 6 q-4 6 -18 6 l-82 0 q-10 -1 -10 -6 z" />
          {/* high straight wing */}
          <rect x="46" y="8" width="40" height="4" rx="1.5" />
          <path d="M64 12 l3 0 l-1 8 l-1 0 z" opacity="0.55" />
          {/* T-tail */}
          <path d="M100 24 l14 -14 l4 0 l-8 14 z" />
          <rect x="108" y="7" width="16" height="3.5" rx="1.5" />
          {/* prop discs */}
          <ellipse cx="52" cy="14" rx="1.6" ry="7" opacity="0.5" />
          <ellipse cx="80" cy="14" rx="1.6" ry="7" opacity="0.5" />
          {/* gear hint */}
          <rect x="40" y="30" width="3" height="4" />
          <rect x="70" y="30" width="3" height="4" />
        </g>
      )}
      {category === 'narrowbody' && (
        <g fill="currentColor">
          <path d="M4 24 q2 -6 14 -7 l88 -1 q18 0 22 8 q-4 8 -22 8 l-88 -1 q-12 -1 -14 -7 z" />
          {/* swept low wing */}
          <path d="M52 26 l40 12 l8 0 l-30 -14 z" />
          {/* swept fin */}
          <path d="M100 22 l18 -16 l5 0 l-9 16 z" />
          {/* engine pod */}
          <ellipse cx="70" cy="30" rx="7" ry="4" />
          {/* windows strip */}
          <rect x="26" y="21" width="60" height="1.6" rx="0.8" opacity="0.45" />
        </g>
      )}
      {category === 'widebody' && (
        <g fill="currentColor">
          <path d="M2 23 q2 -7 16 -8 l94 -1 q22 0 26 9 q-4 9 -26 9 l-94 -1 q-14 -1 -16 -7 z" />
          {/* big swept wing */}
          <path d="M50 27 l46 15 l10 0 l-34 -18 z" />
          {/* winglet */}
          <path d="M94 41 l4 -5 l2 1 l-2 5 z" />
          {/* tall swept fin */}
          <path d="M104 20 l22 -18 l6 0 l-11 18 z" />
          {/* two engines */}
          <ellipse cx="60" cy="31" rx="8" ry="4.5" />
          <ellipse cx="80" cy="34" rx="7" ry="4" />
          {/* windows */}
          <rect x="24" y="19.5" width="74" height="1.8" rx="0.9" opacity="0.4" />
        </g>
      )}
    </svg>
  )
}
