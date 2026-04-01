import { useMemo, useState, type MouseEvent } from 'react'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'
import type { SpawnEventRule } from '@/settings/GameSettings.types'
import { useSettingsVersion } from '@/settings/settingsStore'
import './BonusEventDebugPanel.css'

type TriggerButtonDescriptor = {
  id: string
  label: string
  kind: 'combo' | 'pop_streak'
  value: number
}

function buildComboTriggerLabel(rule: SpawnEventRule): string {
  if (rule.trigger.type !== 'combo_multiplier') return rule.id
  const { minMultiplier, maxMultiplier } = rule.trigger
  if (typeof maxMultiplier === 'number' && Number.isFinite(maxMultiplier)) {
    if (maxMultiplier === minMultiplier) return `Combo x${minMultiplier}`
    return `Combo x${minMultiplier}-${maxMultiplier}`
  }
  return `Combo x${minMultiplier}+`
}

function buildPopStreakLabel(rule: SpawnEventRule): string {
  if (rule.trigger.type !== 'pop_streak_without_miss') return rule.id
  return `Streak ${Math.max(1, Math.trunc(rule.trigger.requiredPops))}`
}

function buildTriggerButtonDescriptors(rules: SpawnEventRule[]): TriggerButtonDescriptor[] {
  const descriptors: TriggerButtonDescriptor[] = []
  const seenIds = new Set<string>()

  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i]
    if (!rule || rule.enabled !== true) continue

    if (rule.trigger.type === 'combo_multiplier') {
      const minMultiplier = Math.max(2, Math.trunc(rule.trigger.minMultiplier))
      const maxMultiplier = typeof rule.trigger.maxMultiplier === 'number' && Number.isFinite(rule.trigger.maxMultiplier)
        ? Math.max(minMultiplier, Math.trunc(rule.trigger.maxMultiplier))
        : null
      const key = `combo:${minMultiplier}:${maxMultiplier ?? 'plus'}`
      if (seenIds.has(key)) continue
      seenIds.add(key)
      descriptors.push({
        id: key,
        label: buildComboTriggerLabel(rule),
        kind: 'combo',
        value: minMultiplier,
      })
      continue
    }

    if (rule.trigger.type === 'pop_streak_without_miss') {
      const requiredPops = Math.max(1, Math.trunc(rule.trigger.requiredPops))
      const key = `streak:${requiredPops}`
      if (seenIds.has(key)) continue
      seenIds.add(key)
      descriptors.push({
        id: key,
        label: buildPopStreakLabel(rule),
        kind: 'pop_streak',
        value: requiredPops,
      })
    }
  }

  return descriptors
}

function resolvePanelOrigin(): { x: number; y: number } {
  return {
    x: Math.round(window.innerWidth * 0.5),
    y: Math.round(window.innerHeight * 0.56),
  }
}

export function BonusEventDebugPanel() {
  useSettingsVersion()
  const flowState = useGameplayStore((state) => state.flowState)
  const triggerCombo = useGameplayStore((state) => state.debugTriggerSpawnEventComboMultiplier)
  const triggerPopStreak = useGameplayStore((state) => state.debugTriggerSpawnEventPopStreak)
  const triggerRule = useGameplayStore((state) => state.debugTriggerSpawnEventRuleById)
  const resetCooldowns = useGameplayStore((state) => state.debugResetSpawnEventCooldowns)
  const [isOpen, setIsOpen] = useState(false)

  const isDebug = SETTINGS.debug.enabled === true
  const rules = SETTINGS.spawner.eventRules
  const triggerButtons = useMemo(() => buildTriggerButtonDescriptors(rules), [rules])

  if (!isDebug) return null

  const isRunActive = flowState === 'run'

  const handleTriggerButton = (descriptor: TriggerButtonDescriptor, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const origin = resolvePanelOrigin()
    if (descriptor.kind === 'combo') {
      triggerCombo(descriptor.value, origin)
      return
    }
    triggerPopStreak(descriptor.value, origin)
  }

  const handleRuleButton = (ruleId: string, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    triggerRule(ruleId, resolvePanelOrigin())
  }

  return (
    <div className="bonus-debug-panel">
      <button
        type="button"
        className="bonus-debug-panel__toggle"
        onClick={() => setIsOpen((value) => !value)}
      >
        {isOpen ? 'Hide Event Debug' : 'Event Debug'}
      </button>
      {isOpen ? (
        <div className="bonus-debug-panel__card">
          <div className="bonus-debug-panel__header">
            <div className="bonus-debug-panel__title">Bonus Event Debug</div>
            <div className="bonus-debug-panel__status">
              {isRunActive ? 'Run active' : 'Start a run to test events'}
            </div>
          </div>

          <div className="bonus-debug-panel__section">
            <div className="bonus-debug-panel__section-title">Trigger Simulation</div>
            <div className="bonus-debug-panel__grid">
              {triggerButtons.map((descriptor) => (
                <button
                  key={descriptor.id}
                  type="button"
                  className="bonus-debug-panel__button"
                  onClick={(event) => handleTriggerButton(descriptor, event)}
                  disabled={!isRunActive}
                  title="Uses the real trigger selection and cooldown logic"
                >
                  {descriptor.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bonus-debug-panel__section">
            <div className="bonus-debug-panel__section-title">Direct Rewards</div>
            <div className="bonus-debug-panel__grid">
              {rules.filter((rule) => rule.enabled === true).map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className="bonus-debug-panel__button bonus-debug-panel__button--accent"
                  onClick={(event) => handleRuleButton(rule.id, event)}
                  disabled={!isRunActive}
                  title="Bypasses trigger selection and fires this reward directly"
                >
                  {rule.id}
                </button>
              ))}
            </div>
          </div>

          <div className="bonus-debug-panel__footer">
            <button
              type="button"
              className="bonus-debug-panel__button bonus-debug-panel__button--ghost"
              onClick={() => resetCooldowns()}
            >
              Reset cooldowns
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
