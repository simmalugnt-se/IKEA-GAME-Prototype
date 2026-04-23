import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import {
  resolveScoreboardCueTemplates,
  type ScoreboardCueTemplate,
} from '@/ui/scoreboard/scoreboardEventCueRegistry'
import type {
  ScoreboardEventLogEntry,
  ScoreboardSoundCue,
  ScoreboardVisualCue,
} from '@/ui/scoreboard/scoreboardEventRuntime.types'

export type ScoreboardEventOrchestratorOptions = {
  logCapacity?: number
  onVisualCue?: (cue: ScoreboardVisualCue) => void
  onSoundCue?: (cue: ScoreboardSoundCue) => void
  onLogUpdate?: (entries: readonly ScoreboardEventLogEntry[]) => void
}

export type ScoreboardEventOrchestrator = {
  handleEvent: (event: ScoreboardEvent) => void
  clearLog: () => void
  getLogSnapshot: () => readonly ScoreboardEventLogEntry[]
  dispose: () => void
}

const DEFAULT_LOG_CAPACITY = 200

function normalizeLogCapacity(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LOG_CAPACITY
  return Math.max(10, Math.min(2000, Math.trunc(value)))
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
  const logCapacity = normalizeLogCapacity(options.logCapacity)
  const logEntries: ScoreboardEventLogEntry[] = []
  const nextAllowedByKey = new Map<string, number>()

  let nextLogId = 1
  let nextCueId = 1
  let disposed = false

  const emitLog = () => {
    options.onLogUpdate?.([...logEntries])
  }

  const appendLogEntry = (event: ScoreboardEvent) => {
    const entry: ScoreboardEventLogEntry = {
      id: nextLogId,
      receivedAtMs: Date.now(),
      eventType: event.type,
      runId: event.runId,
      timestamp: event.timestamp,
      summary: summarizeEvent(event),
    }
    nextLogId += 1
    logEntries.unshift(entry)
    if (logEntries.length > logCapacity) {
      logEntries.length = logCapacity
    }
    emitLog()
  }

  return {
    handleEvent: (event) => {
      if (disposed) return

      appendLogEntry(event)

      const cueTemplates = resolveScoreboardCueTemplates(event)
      if (cueTemplates.length === 0) return

      const nowMs = Date.now()
      for (let i = 0; i < cueTemplates.length; i += 1) {
        const cueTemplate = cueTemplates[i]
        if (!shouldEmitFromCooldown(nowMs, cueTemplate, nextAllowedByKey)) continue

        if (cueTemplate.visual) {
          options.onVisualCue?.({
            id: nextCueId,
            ...cueTemplate.visual,
          })
          nextCueId += 1
        }

        if (cueTemplate.sound) {
          options.onSoundCue?.(cueTemplate.sound)
        }
      }
    },

    clearLog: () => {
      if (logEntries.length === 0) return
      logEntries.length = 0
      emitLog()
    },

    getLogSnapshot: () => logEntries,

    dispose: () => {
      disposed = true
      nextAllowedByKey.clear()
    },
  }
}
