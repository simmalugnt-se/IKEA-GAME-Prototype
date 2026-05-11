export type ScoreboardSoundCue =
  | { kind: 'combo', multiplier: number }
  | { kind: 'run_started' }
  | { kind: 'run_ended' }
  | { kind: 'idle_started' }
  | { kind: 'high_score_entry' }
  | { kind: 'high_score_entry_lock' }
  | { kind: 'initials_submitted' }
  | { kind: 'contagion_points' }
  | { kind: 'timebonus' }
  | { kind: 'roller' }
  | { kind: 'slowmo' }
  | { kind: 'zero_gravity' }
  | { kind: 'multi_balls' }
