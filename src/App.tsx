import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { Onboarding } from './components/Onboarding'
import { TopBar } from './components/TopBar'
import { MarketPanel } from './components/MarketPanel'
import { RoutesPanel } from './components/RoutesPanel'
import { StockPanel } from './components/StockPanel'
import { LedgerPanel } from './components/LedgerPanel'

const TABS = ['Rotas', 'Mercado', 'Bolsa', 'Extrato'] as const
type Tab = (typeof TABS)[number]

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

  if (!state) {
    return <Onboarding />
  }

  return (
    <div>
      <TopBar state={state} />

      <nav style={{ display: 'flex', gap: 4, padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? 'var(--accent-dim)' : 'transparent',
              borderColor: tab === t ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      <main style={{ padding: 20, maxWidth: 960, width: '100%', margin: '0 auto' }}>
        {tab === 'Rotas' && <RoutesPanel state={state} now={now} />}
        {tab === 'Mercado' && <MarketPanel state={state} />}
        {tab === 'Bolsa' && <StockPanel state={state} />}
        {tab === 'Extrato' && <LedgerPanel state={state} />}
      </main>
    </div>
  )
}

export default App
