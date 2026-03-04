export type ScoreboardEventSource = 'balloon_pop' | 'balloon_combo' | 'contagion' | 'unknown'

export type ScoreboardLifeLossReason = 'balloon_missed' | 'unknown'

export type InitialsStepFinishReason = 'timeout'

export type GameStartedEvent = {
  type: 'game_started'
  timestamp: number
  runId: string
  score: number
  lives: number
}

export type PointsReceivedEvent = {
  type: 'points_received'
  timestamp: number
  runId: string
  points: number
  generatedBy: ScoreboardEventSource
  totalScore: number
}

export type LivesLostEvent = {
  type: 'lives_lost'
  timestamp: number
  runId: string
  amount: number
  reason: ScoreboardLifeLossReason
  livesRemaining: number
}

export type GameOverEvent = {
  type: 'game_over'
  timestamp: number
  runId: string
  finalScore: number
}

export type ComboTriggeredEvent = {
  type: 'combo_triggered'
  timestamp: number
  runId: string
  multiplier: number
  strikeSize: number
  chainBonus: number
  perPopPoints: number
  totalPoints: number
  totalScore: number
}

export type IdleStartedEvent = {
  type: 'idle_started'
  timestamp: number
  runId: string
}

export type InitialsStepStartedEvent = {
  type: 'initials_step_started'
  timestamp: number
  runId: string
  durationMs: number
}

export type InitialsStepFinishedEvent = {
  type: 'initials_step_finished'
  timestamp: number
  runId: string
  reason: InitialsStepFinishReason
  initials: string
}

export type ScoreboardEvent =
  | GameStartedEvent
  | PointsReceivedEvent
  | LivesLostEvent
  | GameOverEvent
  | ComboTriggeredEvent
  | IdleStartedEvent
  | InitialsStepStartedEvent
  | InitialsStepFinishedEvent

export function isScoreboardEvent(value: unknown): value is ScoreboardEvent {
  if (value === null || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    obj.type === 'game_started'
    || obj.type === 'points_received'
    || obj.type === 'lives_lost'
    || obj.type === 'game_over'
    || obj.type === 'combo_triggered'
    || obj.type === 'idle_started'
    || obj.type === 'initials_step_started'
    || obj.type === 'initials_step_finished'
  )
}

export function parseScoreboardEvent(data: string): ScoreboardEvent | null {
  try {
    const parsed = JSON.parse(data) as unknown
    return isScoreboardEvent(parsed) ? parsed : null
  } catch {
    return null
  }
}
