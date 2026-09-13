import { useState } from 'react'
import type { GameState } from '../types'
import { useGameStore, getCompanyValuation } from '../store/gameStore'
import { computeWorth } from '../engine/stockMarket'
import { formatCountdown, formatMoney, formatShares } from '../format'
import { NumberInput } from './NumberInput'
import {
  CAMPAIGNS,
  campaignGain,
  REVENUE_TEAM_HIRE_FEE,
  REVENUE_TEAM_UNLOCK_FLIGHTS,
  LOAN_DAILY_RATE,
  maxLoan,
  staffBonusCost,
  staffBonusGain,
  TRAINING_CATEGORIES,
  TRAINING_LABEL,
  TRAINING_MAX_LEVEL,
  TRAINING_EFFECT_PER_LEVEL,
  CREW_BONUS_PER_LEVEL,
  trainingCost,
} from '../engine/economy'
import type { TrainingCategory } from '../types'
import { MILESTONES } from '../engine/milestones'

const TRAINING_DESCRIPTION: Record<TrainingCategory, string> = {
  fuel: 'Reduz o combustível queimado por voo.',
  maintenance: 'Reduz o desgaste acumulado por hora voada.',
  emissions: 'Reduz o CO2 emitido por tonelada de combustível.',
  crew: 'Aumenta a ocupação média dos voos.',
}

function trainingEffectLabel(category: TrainingCategory, level: number): string {
  if (level === 0) return 'Nenhum efeito ainda'
  if (category === 'crew') return `+${(level * CREW_BONUS_PER_LEVEL * 100).toFixed(1)}pp de ocupação`
  return `-${Math.round(level * TRAINING_EFFECT_PER_LEVEL * 100)}% agora`
}

export function CompanyPanel({ state, now }: { state: GameState; now: number }) {
  const runCampaign = useGameStore((s) => s.runCampaign)
  const giveStaffBonus = useGameStore((s) => s.giveStaffBonus)
  const investTraining = useGameStore((s) => s.investTraining)
  const toggleRevenueTeam = useGameStore((s) => s.toggleRevenueTeam)
  const takeLoan = useGameStore((s) => s.takeLoan)
  const repayLoan = useGameStore((s) => s.repayLoan)
  const [borrowAmt, setBorrowAmt] = useState(0)
  const [repayAmt, setRepayAmt] = useState(0)
  const rep = state.company.reputation
  const cooldown = (state.company.campaignReadyAt ?? 0) - now
  const onCooldown = cooldown > 0
  const morale = state.staffMorale
  const staffCooldown = (state.company.staffBonusReadyAt ?? 0) - now
  const staffOnCooldown = staffCooldown > 0
  const staffGain = staffBonusGain(morale)
  const staffCost = staffBonusCost(state.fleet.length)

  const credit = maxLoan(getCompanyValuation(state), state.debt)
  const maxRepay = Math.min(state.debt, Math.floor(state.cash))
  const interestPerDay = Math.round(state.debt * LOAN_DAILY_RATE)
  const achievedIds = new Set(state.achievedMilestones)

  return (
    <div>
      <h3>Companhia</h3>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 18 }}>
        <Metric label="Sede" value={`${state.company.hubCode}`} />
        <Metric label="Frota" value={`${state.fleet.length}`} />
        <Metric label="Rotas" value={`${state.routes.length}`} />
        <Metric label="Voos concluídos" value={`${state.flightsCompleted}`} />
        <Metric label="Prestígio" value={formatShares(computeWorth(state))} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>Reputação {Math.round(rep)}/100</div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', maxWidth: 420 }}>
          <div style={{ width: `${rep}%`, height: '100%', background: 'var(--gold)' }} />
        </div>
      </div>

      <h3 style={{ fontSize: 15 }}>
        Marcos{' '}
        <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 12.5 }}>
          ({achievedIds.size}/{MILESTONES.length})
        </span>
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {MILESTONES.map((m) => {
          const done = achievedIds.has(m.id)
          return (
            <span
              key={m.id}
              className="badge"
              style={
                done
                  ? { color: 'var(--gold)', borderColor: 'var(--gold)', background: 'rgba(251, 191, 36, 0.12)' }
                  : undefined
              }
            >
              {done ? '✓ ' : ''}
              {m.label}
            </span>
          )
        })}
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

      <h3 style={{ fontSize: 15, marginTop: 24 }}>Moral da equipe</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: -6, maxWidth: 520 }}>
        Cai com incidentes e greves, sobe com PR espontâneo ou com um bônus pago do próprio bolso. Moral baixa
        deixa uma greve mais provável entre os eventos aleatórios — é um ciclo que se realimenta se ignorado.
        {staffOnCooldown && (
          <>
            {' '}
            <strong style={{ color: 'var(--text-h)' }}>Próximo bônus em {formatCountdown(staffCooldown)}.</strong>
          </>
        )}
      </p>

      <div style={{ marginBottom: 10 }}>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--border)', overflow: 'hidden', maxWidth: 420 }}>
          <div
            style={{
              width: `${morale}%`,
              height: '100%',
              background: morale < 40 ? 'var(--red)' : morale < 70 ? 'var(--gold)' : 'var(--green)',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="badge" style={morale < 40 ? { color: 'var(--red)', borderColor: 'var(--red)' } : undefined}>
          {Math.round(morale)}/100{morale < 40 ? ' · risco de greve elevado' : ''}
        </span>
        <button
          className="primary"
          style={{ fontSize: 12 }}
          disabled={staffOnCooldown || state.cash < staffCost || staffGain === 0}
          title={staffOnCooldown ? 'Aguarde o intervalo' : state.cash < staffCost ? 'Caixa insuficiente' : undefined}
          onClick={giveStaffBonus}
        >
          Bônus para a equipe · {formatMoney(staffCost)} (+{staffGain} moral)
        </button>
      </div>

      <h3 style={{ fontSize: 15, marginTop: 24 }}>Treinamento</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: -6, maxWidth: 520 }}>
        Investimentos permanentes na operação, categoria por categoria. Cada nível custa mais que o anterior —
        é um sumidouro de caixa para quando já sobra dinheiro.
      </p>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {TRAINING_CATEGORIES.map((category) => {
          const level = state.training[category]
          const maxed = level >= TRAINING_MAX_LEVEL
          const cost = trainingCost(level)
          return (
            <div
              key={category}
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
              <strong style={{ color: 'var(--text-h)' }}>{TRAINING_LABEL[category]}</strong>
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{TRAINING_DESCRIPTION[category]}</span>
              <span className="stat-chip">
                Nível <strong>{level}/{TRAINING_MAX_LEVEL}</strong>
              </span>
              <span className="stat-chip">
                Efeito atual <strong style={{ color: 'var(--green)' }}>{trainingEffectLabel(category, level)}</strong>
              </span>
              <button
                className="primary"
                disabled={maxed || state.cash < cost}
                title={maxed ? 'Nível máximo' : state.cash < cost ? 'Caixa insuficiente' : undefined}
                onClick={() => investTraining(category)}
              >
                {maxed ? 'Nível máximo' : `Investir · ${formatMoney(cost)}`}
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

      <h3 style={{ fontSize: 15, marginTop: 24 }}>Financiamento</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: -6, maxWidth: 520 }}>
        Um empréstimo antecipa caixa para comprar frota antes da hora, mas cobra{' '}
        <strong style={{ color: 'var(--text-h)' }}>1% ao dia de juros</strong> sobre o saldo devedor, debitado
        do caixa de forma contínua. O limite é{' '}
        <strong style={{ color: 'var(--text-h)' }}>60% da avaliação da companhia</strong>. Amortize assim que
        sobrar caixa — a dívida não some sozinha.
      </p>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 14 }}>
        <Metric label="Dívida atual" value={formatMoney(state.debt)} />
        <Metric label="Crédito disponível" value={formatMoney(credit)} />
        <Metric label="Juros por dia" value={formatMoney(interestPerDay)} />
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              letterSpacing: '0.04em',
            }}
          >
            Tomar emprestado
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <NumberInput style={{ width: 140 }} min={0} value={borrowAmt} onChange={setBorrowAmt} />
            <button style={{ fontSize: 12 }} disabled={credit <= 0} onClick={() => setBorrowAmt(credit)}>
              Máx
            </button>
            <button
              className="primary"
              disabled={credit <= 0 || borrowAmt <= 0}
              title={credit <= 0 ? 'Sem crédito disponível' : undefined}
              onClick={() => {
                takeLoan(borrowAmt)
                setBorrowAmt(0)
              }}
            >
              Pegar {borrowAmt > 0 ? formatMoney(Math.min(borrowAmt, credit)) : ''}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
              letterSpacing: '0.04em',
            }}
          >
            Amortizar
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <NumberInput style={{ width: 140 }} min={0} value={repayAmt} onChange={setRepayAmt} />
            <button style={{ fontSize: 12 }} disabled={maxRepay <= 0} onClick={() => setRepayAmt(maxRepay)}>
              Máx
            </button>
            <button
              className="primary"
              disabled={maxRepay <= 0 || repayAmt <= 0}
              title={
                state.debt <= 0
                  ? 'Sem dívida'
                  : state.cash <= 0
                    ? 'Caixa insuficiente'
                    : undefined
              }
              onClick={() => {
                repayLoan(repayAmt)
                setRepayAmt(0)
              }}
            >
              Pagar {repayAmt > 0 ? formatMoney(Math.min(repayAmt, maxRepay)) : ''}
            </button>
          </div>
        </div>
      </div>
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
