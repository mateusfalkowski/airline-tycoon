import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { Onboarding } from './components/Onboarding'
import { TopBar } from './components/TopBar'
import { MarketPanel } from './components/MarketPanel'
import { RoutesPanel } from './components/RoutesPanel'
import { StockPanel } from './components/StockPanel'
import { LedgerPanel } from './components/LedgerPanel'
import { TutorialBanner } from './components/TutorialBanner'
import type { TutorialStep } from './types'

const TABS = ['Rotas', 'Mercado', 'Bolsa', 'Extrato'] as const
type Tab = (typeof TABS)[number]

const TAB_ICON: Record<Tab, string> = {
  Rotas: '🛫',
  Mercado: '🛩️',
  Bolsa: '📈',
  Extrato: '🧾',
}

const TUTORIAL_TAB: Partial<Record<TutorialStep, Tab>> = {
  buy_aircraft: 'Mercado',
  create_route: 'Rotas',
  dispatch_flight: 'Rotas',
  stock_intro: 'Bolsa',
}

function App() {
  const state = useGameStore((s) => s.state)
  const init = useGameStore((s) => s.init)
  const doTick = useGameStore((s) => s.doTick)
  const [tab, setTab] = useState<Tab>('Rotas')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
      doTick()
    }, 1000)
    return () => clearInterval(id)
  }, [doTick])

  const lockedTab = state ? TUTORIAL_TAB[state.tutorial] : undefined

  useEffect(() => {
    if (lockedTab) setTab(lockedTab)
  }, [lockedTab])

  if (!state) {
    return <Onboarding />
  }

  const activeTab = lockedTab ?? tab

  return (
    <div>
      <TopBar state={state} />

      <nav
        style={{
          display: 'flex',
          gap: 8,
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-soft)',
          flexWrap: 'wrap',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            disabled={Boolean(lockedTab) && t !== lockedTab}
            onClick={() => setTab(t)}
            style={{
              borderRadius: 999,
              padding: '8px 16px',
              fontWeight: 600,
              background: activeTab === t ? 'var(--accent)' : 'var(--panel-alt)',
              color: activeTab === t ? '#06202f' : 'var(--text)',
              borderColor: activeTab === t ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {TAB_ICON[t]} {t}
          </button>
        ))}
      </nav>

      {state.tutorial !== 'done' && <TutorialBanner step={state.tutorial} />}

      <main style={{ padding: 20, maxWidth: 1000, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div className="card">
          {activeTab === 'Rotas' && <RoutesPanel state={state} now={now} tutorial={state.tutorial} />}
          {activeTab === 'Mercado' && <MarketPanel state={state} tutorial={state.tutorial} />}
          {activeTab === 'Bolsa' && <StockPanel state={state} />}
          {activeTab === 'Extrato' && <LedgerPanel state={state} />}
        </div>
      </main>
    </div>
  )
}

export default App
