export type ScoreboardSoundCue =
  | { kind: 'combo', multiplier: number }
  | { kind: 'run_started' }
  | { kind: 'run_ended' }
  | { kind: 'initials_submitted' }
  | { kind: 'contagion_points' }
  | { kind: 'timebonus' }
  | { kind: 'special_event' }
