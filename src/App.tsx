import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { Onboarding } from './components/Onboarding'
import { TopBar } from './components/TopBar'
import { MarketPanel } from './components/MarketPanel'
import { RoutesPanel } from './components/RoutesPanel'
import { StockPanel } from './components/StockPanel'
import { FuelPanel } from './components/FuelPanel'
import { MaintenancePanel } from './components/MaintenancePanel'
import { LedgerPanel } from './components/LedgerPanel'
import { WorldMap } from './components/WorldMap'
import { CompanyPanel } from './components/CompanyPanel'
import { TutorialBanner } from './components/TutorialBanner'
import { LandingToasts } from './components/LandingToasts'
import { CHECK_INTERVAL_HOURS } from './engine/economy'
import type { TutorialStep } from './types'

const TABS = ['Mapa', 'Rotas', 'Mercado', 'Combustível', 'Manutenção', 'Companhia', 'Bolsa', 'Extrato'] as const
type Tab = (typeof TABS)[number]

const TAB_ICON: Record<Tab, string> = {
  Mapa: '🗺️',
  Rotas: '🛫',
  Mercado: '🛩️',
  Combustível: '⛽',
  Manutenção: '🔧',
  Companhia: '🏢',
  Bolsa: '📈',
  Extrato: '🧾',
}

const TUTORIAL_TAB: Partial<Record<TutorialStep, Tab>> = {
  buy_aircraft: 'Mercado',
  create_route: 'Rotas',
  dispatch_flight: 'Rotas',
}

function App() {
  const state = useGameStore((s) => s.state)
  const init = useGameStore((s) => s.init)
  const doTick = useGameStore((s) => s.doTick)
  const [tab, setTab] = useState<Tab>('Mapa')
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

  const inspectionsDue = state.fleet.filter((a) => a.hoursSinceCheck >= CHECK_INTERVAL_HOURS).length
  const fuelLow = state.fuel.stored <= 0 && state.routes.length > 0
  const alerts: { text: string; tab: Tab }[] = []
  if (inspectionsDue > 0)
    alerts.push({
      text: `${inspectionsDue} ${inspectionsDue === 1 ? 'aeronave precisa' : 'aeronaves precisam'} de revisão`,
      tab: 'Manutenção',
    })
  if (fuelLow) alerts.push({ text: 'Depósito de combustível vazio — voos comprando no preço spot', tab: 'Combustível' })

  return (
    <div>
      <TopBar state={state} />

      {!lockedTab &&
        alerts.map((a) => (
          <button
            key={a.text}
            onClick={() => setTab(a.tab)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              border: 'none',
              borderBottom: '1px solid var(--border-soft)',
              borderRadius: 0,
              background: 'color-mix(in srgb, var(--red) 14%, var(--panel))',
              color: 'var(--text-h)',
              padding: '8px 20px',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            ⚠ {a.text} — abrir {a.tab}
          </button>
        ))}

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
          {activeTab === 'Mapa' && <WorldMap state={state} now={now} />}
          {activeTab === 'Rotas' && <RoutesPanel state={state} now={now} tutorial={state.tutorial} />}
          {activeTab === 'Mercado' && <MarketPanel state={state} tutorial={state.tutorial} />}
          {activeTab === 'Combustível' && <FuelPanel state={state} now={now} />}
          {activeTab === 'Manutenção' && <MaintenancePanel state={state} now={now} />}
          {activeTab === 'Companhia' && <CompanyPanel state={state} now={now} />}
          {activeTab === 'Bolsa' && <StockPanel state={state} />}
          {activeTab === 'Extrato' && <LedgerPanel state={state} />}
        </div>
      </main>

      <LandingToasts />
    </div>
  )
}

export default App
