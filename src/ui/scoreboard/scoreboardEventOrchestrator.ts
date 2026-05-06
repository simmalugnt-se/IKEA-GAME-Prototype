import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import {
  resolveScoreboardCueTemplates,
  type ScoreboardCueTemplate,
} from '@/ui/scoreboard/scoreboardEventCueRegistry'
import type {
  ScoreboardSoundCue,
} from '@/ui/scoreboard/scoreboardEventRuntime.types'

export type ScoreboardEventOrchestratorOptions = {
  onSoundCue?: (cue: ScoreboardSoundCue) => void
}

export type ScoreboardEventOrchestrator = {
  handleEvent: (event: ScoreboardEvent) => void
  dispose: () => void
}

function formatPayloadCompact(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload)
  if (keys.length === 0) return ''

  const pairs: string[] = []
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    const rawValue = payload[key]
    let value = ''
    if (typeof rawValue === 'number') {
      value = Number.isInteger(rawValue)
        ? `${rawValue}`
        : rawValue.toFixed(2)
    } else if (typeof rawValue === 'string') {
      value = rawValue
    } else if (typeof rawValue === 'boolean') {
      value = rawValue ? 'true' : 'false'
    } else {
      value = '[obj]'
    }
    pairs.push(`${key}=${value}`)
  }

  const compact = pairs.join(', ')
  return compact.length <= 120 ? compact : `${compact.slice(0, 117)}...`
}

function summarizeEvent(event: ScoreboardEvent): string {
  switch (event.type) {
    case 'game_started':
      return `run=${event.runMode} lives=${event.lives} limit=${Math.trunc(event.timeLimitMs / 1000)}s`
    case 'points_received': {
      const points = Math.trunc(event.points)
      const signedPoints = points > 0 ? `+${points}` : `${points}`
      return `${signedPoints} from=${event.generatedBy} total=${event.totalScore}`
    }
    case 'lives_lost':
      return `lost=${event.amount} remaining=${event.livesRemaining}`
    case 'game_over':
      return `score=${event.finalScore} reason=${event.endReason}`
    case 'combo_triggered':
      return `x${event.multiplier} strike=${event.strikeSize} +${event.totalPoints}`
    case 'idle_started':
      return 'idle'
    case 'initials_step_started':
      return `duration=${Math.trunc(event.durationMs / 1000)}s`
    case 'initials_step_finished':
      return `${event.initials} score=${event.score} rank=${event.rank ?? '-'} reason=${event.reason}`
    case 'game_event_triggered': {
      const payloadSummary = formatPayloadCompact(event.payload)
      return payloadSummary.length > 0
        ? `${event.eventId} (${payloadSummary})`
        : event.eventId
    }
    default:
      return 'unknown'
  }
}

function shouldEmitFromCooldown(
  nowMs: number,
  cue: ScoreboardCueTemplate,
  nextAllowedByKey: Map<string, number>,
): boolean {
  const key = cue.cooldownKey
  if (!key) return true

  const nextAllowedAtMs = nextAllowedByKey.get(key)
  if (typeof nextAllowedAtMs === 'number' && nowMs < nextAllowedAtMs) {
    return false
  }

  const cooldownMs = cue.cooldownMs
  if (typeof cooldownMs === 'number' && cooldownMs > 0) {
    nextAllowedByKey.set(key, nowMs + cooldownMs)
  }

  return true
}

export function createScoreboardEventOrchestrator(
  options: ScoreboardEventOrchestratorOptions,
): ScoreboardEventOrchestrator {
  const nextAllowedByKey = new Map<string, number>()

  let disposed = false

  return {
    handleEvent: (event) => {
      if (disposed) return

      console.log('[scoreboard:event]', {
        type: event.type,
        runId: event.runId,
        timestamp: event.timestamp,
        summary: summarizeEvent(event),
        event,
      })

      const cueTemplates = resolveScoreboardCueTemplates(event)
      if (cueTemplates.length === 0) return

      const nowMs = Date.now()
      for (let i = 0; i < cueTemplates.length; i += 1) {
        const cueTemplate = cueTemplates[i]
        if (!shouldEmitFromCooldown(nowMs, cueTemplate, nextAllowedByKey)) continue

        if (cueTemplate.sound) {
          options.onSoundCue?.(cueTemplate.sound)
        }
      }
    },

    dispose: () => {
      disposed = true
      nextAllowedByKey.clear()
    },
  }
}
