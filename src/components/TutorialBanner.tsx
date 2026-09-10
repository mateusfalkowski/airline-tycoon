import type { TutorialStep } from '../types'
import { useGameStore } from '../store/gameStore'

const STEPS: { step: TutorialStep; title: string; body: string }[] = [
  {
    step: 'buy_aircraft',
    title: 'Passo 1 de 3 — Compre sua primeira aeronave',
    body: 'Toda companhia começa sem frota. Escolha uma aeronave no Mercado para começar a operar.',
  },
  {
    step: 'create_route',
    title: 'Passo 2 de 3 — Defina uma rota',
    body: 'Clique em "Definir rota" na sua aeronave e escolha origem, destino e o preço da passagem.',
  },
  {
    step: 'dispatch_flight',
    title: 'Passo 3 de 3 — Despache o voo',
    body: 'Com a rota criada, clique em "Despachar". O voo leva o tempo real da rota — contrate um gerente de operações mais tarde para os aviões voarem sozinhos.',
  },
]

export function TutorialBanner({ step }: { step: TutorialStep }) {
  const finishTutorial = useGameStore((s) => s.finishTutorial)
  const current = STEPS.find((s) => s.step === step)
  if (!current) return null

  const index = STEPS.findIndex((s) => s.step === step)

  return (
    <div
      style={{
        maxWidth: 1000,
        width: 'calc(100% - 40px)',
        margin: '18px auto 0',
        padding: '14px 18px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--accent)',
        background: 'var(--accent-dim)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        boxSizing: 'border-box',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text-h)', marginBottom: 4 }}>{current.title}</div>
        <div style={{ color: 'var(--text)', fontSize: 13.5 }}>{current.body}</div>
      </div>
      {index === STEPS.length - 1 ? (
        <button className="primary" onClick={finishTutorial} style={{ flexShrink: 0 }}>
          Concluir tutorial
        </button>
      ) : (
        <button onClick={finishTutorial} style={{ flexShrink: 0, fontSize: 12.5 }}>
          Pular tutorial
        </button>
      )}
    </div>
  )
}
