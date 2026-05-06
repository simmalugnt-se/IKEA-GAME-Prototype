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
        sound: { kind: 'initials_submitted' },
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

      // Placeholder mapping for upcoming game-event ids (e.g. steamroller).
      if (event.eventId === 'steamroller') {
        return [{
          sound: { kind: 'special_event' },
          cooldownKey: 'game_event_steamroller',
          cooldownMs: 300,
        }]
      }

      return []
    }

    // Time-mode v1 excludes lives-based cue handling.
    case 'lives_lost':
      return []

    case 'idle_started':
    case 'initials_step_started':
      return []

    default:
      return []
  }
}
