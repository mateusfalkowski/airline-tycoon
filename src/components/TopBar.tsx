import { useRef, useState } from 'react'
import type { GameState } from '../types'
import { formatMoney } from '../format'
import { useGameStore } from '../store/gameStore'

interface Props {
  state: GameState
}

export function TopBar({ state }: Props) {
  const resetGame = useGameStore((s) => s.resetGame)
  const importSave = useGameStore((s) => s.importSave)
  const [confirming, setConfirming] = useState(false)
  const [importError, setImportError] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    const json = JSON.stringify(state, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 10)
    const slug =
      state.company.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'save'
    const a = document.createElement('a')
    a.href = url
    a.download = `airline-tycoon-${slug}-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        padding: '14px 20px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'linear-gradient(180deg, var(--panel-raised), var(--panel))',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>✈️</span>
        <div>
          <div style={{ color: 'var(--text-h)', fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
            {state.company.name}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>hub {state.company.hubCode}</div>
        </div>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
        <Stat label="Caixa" value={formatMoney(state.cash)} />
        <Stat label="Reputação" value={`${Math.round(state.company.reputation)}/100`} />
        <Stat label="Ação" value={`$${state.stock.sharePrice.toFixed(2)}`} />
        <Stat label="Frota" value={`${state.fleet.length}`} />

        <button style={{ fontSize: 12 }} onClick={handleExport}>
          Exportar save
        </button>
        <button style={{ fontSize: 12 }} onClick={() => fileInputRef.current?.click()}>
          Importar save
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => setImportError(!importSave(String(reader.result ?? '')))
            reader.readAsText(file)
          }}
        />
        {importError && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>Save inválido</span>}

        {confirming ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--red)' }}>Apagar progresso?</span>
            <button style={{ fontSize: 12, borderColor: 'var(--red)' }} onClick={() => resetGame()}>
              Sim, reiniciar
            </button>
            <button style={{ fontSize: 12 }} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button style={{ fontSize: 12 }} onClick={() => setConfirming(true)}>
            Reiniciar jogo
          </button>
        )}
      </div>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, color: 'var(--text-h)', fontSize: 14.5 }}>{value}</div>
    </div>
  )
}
