import type { TutorialStep } from '../types'
import { useGameStore } from '../store/gameStore'

const STEPS: { step: TutorialStep; title: string; body: string }[] = [
  {
    step: 'buy_aircraft',
    title: 'Passo 1 de 4 — Compre sua primeira aeronave',
    body: 'Toda companhia começa sem frota. Escolha uma aeronave no Mercado para começar a operar.',
  },
  {
    step: 'create_route',
    title: 'Passo 2 de 4 — Defina uma rota',
    body: 'Clique em "Definir rota" na sua aeronave e escolha origem, destino e o preço da passagem.',
  },
  {
    step: 'dispatch_flight',
    title: 'Passo 3 de 4 — Despache o voo',
    body: 'Com a rota criada, clique em "Despachar" para colocar a aeronave no ar. O voo chega em tempo real.',
  },
  {
    step: 'stock_intro',
    title: 'Passo 4 de 4 — Conheça a bolsa de valores',
    body: 'Aqui você pode abrir o capital da empresa (IPO) e vender ações para investidores — no começo, bots que reagem à saúde da sua companhia. Quando quiser, clique em "Concluir" para seguir jogando livremente.',
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
        margin: '16px 20px 0',
        padding: '14px 16px',
        borderRadius: 8,
        border: '1px solid var(--accent)',
        background: 'var(--accent-dim)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
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
