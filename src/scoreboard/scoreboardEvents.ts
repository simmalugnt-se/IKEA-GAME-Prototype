import type { GameRunMode, HighScoreStorageMode } from '@/settings/GameSettings.types'

export type ScoreboardEventSource =
  | 'balloon_pop'
  | 'balloon_combo'
  | 'contagion'
  | 'spawn_item_bonus'
  | 'spawn_item_penalty'
  | 'unknown'

export type ScoreboardLifeLossReason = 'balloon_missed' | 'unknown'

export type InitialsStepFinishReason = 'timeout' | 'submitted'
export type GameOverEndReason = 'lives_depleted' | 'time_elapsed'

export type HighScoreScoreboardEntry = {
  rank: number
  initials: string
  score: number
  runId: string
}

export type HighScoreListSlotEntry = {
  rank: number
  initials: string
  score: number
  opacity: number
}

export type GameStartedEvent = {
  type: 'game_started'
  timestamp: number
  runId: string
  score: number
  lives: number
  runMode: GameRunMode
  timeLimitMs: number
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
  endReason: GameOverEndReason
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

export type GameEventTriggeredEvent = {
  type: 'game_event_triggered'
  timestamp: number
  runId: string
  eventId: string
  payload: Record<string, unknown>
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
  score: number
  submittedAtMs: number
  rank: number | null
  totalEntries: number
  storageMode: HighScoreStorageMode
}

export type HighScoresUpdatedEvent = {
  type: 'high_scores_updated'
  timestamp: number
  runId: string
  topEntries: HighScoreScoreboardEntry[]
  totalEntries: number
  storageMode: HighScoreStorageMode
  latestRunId: string | null
}

export type LiveRankUpdatedEvent = {
  type: 'live_rank_updated'
  timestamp: number
  runId: string
  score: number
  rank: number
  playerInitials: string
  listSlots: HighScoreListSlotEntry[]
}

export type ScoreboardEvent =
  | GameStartedEvent
  | PointsReceivedEvent
  | LivesLostEvent
  | GameOverEvent
  | ComboTriggeredEvent
  | GameEventTriggeredEvent
  | IdleStartedEvent
  | InitialsStepStartedEvent
  | InitialsStepFinishedEvent
  | HighScoresUpdatedEvent
  | LiveRankUpdatedEvent

export function isScoreboardEvent(value: unknown): value is ScoreboardEvent {
  if (value === null || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return (
    obj.type === 'game_started'
    || obj.type === 'points_received'
    || obj.type === 'lives_lost'
    || obj.type === 'game_over'
    || obj.type === 'combo_triggered'
    || obj.type === 'game_event_triggered'
    || obj.type === 'idle_started'
    || obj.type === 'initials_step_started'
    || obj.type === 'initials_step_finished'
    || obj.type === 'high_scores_updated'
    || obj.type === 'live_rank_updated'
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
