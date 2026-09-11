import type { GameState } from '../types'
import { useGameStore } from '../store/gameStore'
import { formatCountdown, formatMoney } from '../format'
import {
  CAMPAIGNS,
  campaignGain,
  REVENUE_TEAM_HIRE_FEE,
  REVENUE_TEAM_UNLOCK_FLIGHTS,
} from '../engine/economy'

export function CompanyPanel({ state, now }: { state: GameState; now: number }) {
  const runCampaign = useGameStore((s) => s.runCampaign)
  const toggleRevenueTeam = useGameStore((s) => s.toggleRevenueTeam)
  const rep = state.company.reputation
  const cooldown = (state.company.campaignReadyAt ?? 0) - now
  const onCooldown = cooldown > 0

  return (
    <div>
      <h3>Companhia</h3>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 18 }}>
        <Metric label="Sede" value={`${state.company.hubCode}`} />
        <Metric label="Frota" value={`${state.fleet.length}`} />
        <Metric label="Rotas" value={`${state.routes.length}`} />
        <Metric label="Voos concluídos" value={`${state.flightsCompleted}`} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Reputação {Math.round(rep)}/100</div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', maxWidth: 420 }}>
          <div style={{ width: `${rep}%`, height: '100%', background: 'var(--gold)' }} />
        </div>
      </div>

      <h3 style={{ fontSize: 15 }}>Marketing</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: -6, maxWidth: 480 }}>
        Uma campanha eleva a reputação na hora, o que aumenta a ocupação de todos os voos. Rende menos quanto
        mais alta já estiver a reputação, e há um intervalo de 1h entre campanhas.
        {onCooldown && (
          <>
            {' '}
            <strong style={{ color: 'var(--text-h)' }}>Próxima em {formatCountdown(cooldown)}.</strong>
          </>
        )}
      </p>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {CAMPAIGNS.map((c) => {
          const gain = campaignGain(c.gain, rep)
          return (
            <div
              key={c.id}
              style={{
                background: 'var(--panel-alt)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-sm)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <strong style={{ color: 'var(--text-h)' }}>Campanha {c.name}</strong>
              <span className="stat-chip">
                Custo <strong>{formatMoney(c.cost)}</strong>
              </span>
              <span className="stat-chip">
                Ganho agora <strong style={{ color: 'var(--gold)' }}>+{gain} reputação</strong>
              </span>
              <button
                className="primary"
                disabled={onCooldown || state.cash < c.cost || gain === 0}
                title={
                  onCooldown ? 'Aguarde o intervalo' : state.cash < c.cost ? 'Caixa insuficiente' : undefined
                }
                onClick={() => runCampaign(c.id)}
              >
                Lançar campanha
              </button>
            </div>
          )
        })}
      </div>

      <h3 style={{ fontSize: 15, marginTop: 24 }}>Equipe de revenue</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: -6, maxWidth: 520 }}>
        Uma equipe de revenue reajusta sozinha os preços de <em>todas</em> as rotas conforme a demanda: sobe
        onde vende esgotado, baixa onde voa vazio. Cobra <strong style={{ color: 'var(--text-h)' }}>2,5% da
        receita de cada voo</strong> e é conservadora — quem sabe precificar à mão ainda ganha mais. Disponível
        após {REVENUE_TEAM_UNLOCK_FLIGHTS} voos concluídos.
      </p>
      {state.revenueTeam ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            Ativa · reajustando preços
          </span>
          <button style={{ fontSize: 12 }} onClick={toggleRevenueTeam}>
            Dispensar equipe
          </button>
        </div>
      ) : state.flightsCompleted < REVENUE_TEAM_UNLOCK_FLIGHTS ? (
        <button disabled style={{ fontSize: 12 }}>
          Requer {REVENUE_TEAM_UNLOCK_FLIGHTS} voos ({state.flightsCompleted}/{REVENUE_TEAM_UNLOCK_FLIGHTS})
        </button>
      ) : (
        <button
          className="primary"
          style={{ fontSize: 12 }}
          disabled={state.cash < REVENUE_TEAM_HIRE_FEE}
          title={state.cash < REVENUE_TEAM_HIRE_FEE ? 'Caixa insuficiente' : undefined}
          onClick={toggleRevenueTeam}
        >
          Contratar equipe de revenue · {formatMoney(REVENUE_TEAM_HIRE_FEE)}
        </button>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--text-h)' }}>{value}</div>
    </div>
  )
}
