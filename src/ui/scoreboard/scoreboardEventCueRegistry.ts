import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import type { ScoreboardSoundCue } from '@/ui/scoreboard/scoreboardEventRuntime.types'

export type ScoreboardCueTemplate = {
  sound?: ScoreboardSoundCue
  cooldownKey?: string
  cooldownMs?: number
}

export function resolveScoreboardCueTemplates(event: ScoreboardEvent): ScoreboardCueTemplate[] {
  switch (event.type) {
    case 'combo_triggered': {
      const multiplier = Math.max(2, Math.trunc(event.multiplier))
      return [{
        sound: { kind: 'combo', multiplier },
        cooldownKey: 'combo_triggered',
        cooldownMs: 110,
      }]
    }

    case 'points_received': {
      if (event.generatedBy === 'contagion') {
        return [{
          sound: { kind: 'contagion_points' },
          cooldownKey: 'points_contagion_sound',
          cooldownMs: 220,
        }]
      }

      return []
    }

    case 'game_started':
      return [{
        sound: { kind: 'run_started' },
        cooldownKey: 'game_started',
        cooldownMs: 600,
      }]

    case 'game_over':
      return [{
        sound: { kind: 'run_ended' },
        cooldownKey: 'game_over',
        cooldownMs: 600,
      }]

    case 'initials_step_finished':
      return [{
        sound: { kind: 'high_score_entry_lock' },
        cooldownKey: 'initials_step_finished',
        cooldownMs: 600,
      }]

    case 'game_event_triggered': {
      if (event.eventId === 'timebonus') {
        return [{
          sound: { kind: 'timebonus' },
          cooldownKey: 'game_event_timebonus',
          cooldownMs: 140,
        }]
      }

      if (event.eventId === 'track_sweeper_reward') {
        return [{
          sound: { kind: 'roller' },
          cooldownKey: 'game_event_track_sweeper_reward',
          cooldownMs: 300,
        }]
      }

      if (event.eventId === 'slowmo_reward') {
        return [{
          sound: { kind: 'slowmo' },
          cooldownKey: 'game_event_slowmo_reward',
          cooldownMs: 300,
        }]
      }

      if (event.eventId === 'gravity_loss_reward') {
        return [{
          sound: { kind: 'zero_gravity' },
          cooldownKey: 'game_event_gravity_loss_reward',
          cooldownMs: 300,
        }]
      }

      if (event.eventId === 'ground_ball_wave_reward') {
        return [{
          sound: { kind: 'multi_balls' },
          cooldownKey: 'game_event_ground_ball_wave_reward',
          cooldownMs: 300,
        }]
      }

      return []
    }

    // Time-mode v1 excludes lives-based cue handling.
    case 'lives_lost':
      return []

    case 'initials_step_started':
      return [{
        sound: { kind: 'high_score_entry' },
        cooldownKey: 'initials_step_started',
        cooldownMs: 600,
      }]

    case 'idle_started':
      return [{
        sound: { kind: 'idle_started' },
        cooldownKey: 'idle_started',
        cooldownMs: 600,
      }]

    default:
      return []
  }
}
