import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children}
    </label>
  )
}
