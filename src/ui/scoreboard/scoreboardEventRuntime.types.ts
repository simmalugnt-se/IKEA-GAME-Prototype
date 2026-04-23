import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'

export type ScoreboardFxCueKind =
  | 'combo'
  | 'points'
  | 'game_started'
  | 'game_over'
  | 'initials_submitted'
  | 'timebonus'
  | 'special'

export type ScoreboardVisualCue = {
  id: number
  kind: ScoreboardFxCueKind
  label: string
  intensity: number
  durationMs: number
  eventType: ScoreboardEvent['type']
}

export type ScoreboardSoundCue =
  | { kind: 'combo', multiplier: number }
  | { kind: 'run_started' }
  | { kind: 'run_ended' }
  | { kind: 'initials_submitted' }
  | { kind: 'contagion_points' }
  | { kind: 'timebonus' }
  | { kind: 'special_event' }

export type ScoreboardEventLogEntry = {
  id: number
  receivedAtMs: number
  eventType: ScoreboardEvent['type']
  runId: string
  timestamp: number
  summary: string
}
