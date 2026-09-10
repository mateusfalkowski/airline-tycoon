import type { GameState } from '../types'
import { useGameStore } from '../store/gameStore'
import { findAircraftModel } from '../data/aircraft'
import { formatCountdown, formatMoney } from '../format'
import { CHECK_INTERVAL_HOURS, maintenanceHours, inspectionCost, lightMaintenanceCost } from '../engine/economy'

function wearColor(wear: number): string {
  if (wear < 0.4) return 'var(--green)'
  if (wear < 0.7) return 'var(--gold)'
  return 'var(--red)'
}

export function MaintenancePanel({ state, now }: { state: GameState; now: number }) {
  const serviceAircraft = useGameStore((s) => s.serviceAircraft)
  const lightMaintenance = useGameStore((s) => s.lightMaintenance)

  if (state.fleet.length === 0) {
    return <p style={{ color: 'var(--text-dim)' }}>Sem aeronaves para manter.</p>
  }

  return (
    <div>
      <h3>Manutenção</h3>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: -8, marginBottom: 14 }}>
        O desgaste sobe a cada hora de voo e encarece a manutenção. A cada {CHECK_INTERVAL_HOURS}h de voo a
        aeronave precisa de revisão e não decola até ser revisada. A manutenção deixa o avião parado algumas
        horas — mais tempo para jatos maiores.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {state.fleet.map((aircraft) => {
          const model = findAircraftModel(aircraft.modelId)
          const idle = aircraft.status === 'idle'
          const inShop = aircraft.status === 'maintenance'
          const checkPct = Math.min(100, (aircraft.hoursSinceCheck / CHECK_INTERVAL_HOURS) * 100)
          const overdue = aircraft.hoursSinceCheck >= CHECK_INTERVAL_HOURS
          const soon = !overdue && checkPct >= 75
          const checkCost = model ? inspectionCost(model.price, aircraft.wear) : 0
          const lightCost = model ? lightMaintenanceCost(model.price, aircraft.wear) : 0
          const lightHrs = model ? maintenanceHours(model.category, 'light') : 0
          const checkHrs = model ? maintenanceHours(model.category, 'inspection') : 0

          return (
            <div
              key={aircraft.id}
              style={{
                background: 'var(--panel-alt)',
                border: `1px solid ${overdue ? 'var(--red)' : 'var(--border-soft)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ color: 'var(--text-h)', fontSize: 14.5 }}>{model?.name ?? aircraft.modelId}</strong>
                <span
                  className="badge"
                  style={
                    inShop
                      ? { color: 'var(--accent)', borderColor: 'var(--accent)' }
                      : overdue
                        ? { color: 'var(--red)', borderColor: 'var(--red)' }
                        : soon
                          ? { color: 'var(--gold)', borderColor: 'var(--gold)' }
                          : undefined
                  }
                >
                  {inShop
                    ? `${aircraft.maintenanceKind === 'inspection' ? 'Em revisão' : 'Em manutenção'} · pronta em ${formatCountdown((aircraft.maintenanceUntil ?? now) - now)}`
                    : aircraft.status === 'flying'
                      ? 'Voando'
                      : overdue
                        ? 'Revisão pendente'
                        : soon
                          ? 'Revisão em breve'
                          : 'OK'}
                </span>
              </div>

              <Bar label={`Desgaste ${Math.round(aircraft.wear * 100)}%`} pct={aircraft.wear * 100} color={wearColor(aircraft.wear)} />
              <Bar
                label={`Horas desde a revisão: ${aircraft.hoursSinceCheck.toFixed(1)}h / ${CHECK_INTERVAL_HOURS}h`}
                pct={checkPct}
                color={overdue ? 'var(--red)' : 'var(--accent)'}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Total voado: {aircraft.totalHours.toFixed(1)}h</div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  disabled={!idle || aircraft.wear < 0.02 || state.cash < lightCost}
                  onClick={() => lightMaintenance(aircraft.id)}
                >
                  Manutenção leve · {formatMoney(lightCost)} · {lightHrs}h
                </button>
                <button
                  className={overdue ? 'primary' : undefined}
                  disabled={!idle || state.cash < checkCost}
                  title={!idle ? 'A aeronave precisa estar em solo' : undefined}
                  onClick={() => serviceAircraft(aircraft.id)}
                >
                  Fazer revisão · {formatMoney(checkCost)} · {checkHrs}h
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}
