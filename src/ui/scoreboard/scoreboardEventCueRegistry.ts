import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import type { ScoreboardSoundCue, ScoreboardVisualCue } from '@/ui/scoreboard/scoreboardEventRuntime.types'

type VisualCueTemplate = Omit<ScoreboardVisualCue, 'id'>

export type ScoreboardCueTemplate = {
  visual?: VisualCueTemplate
  sound?: ScoreboardSoundCue
  cooldownKey?: string
  cooldownMs?: number
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function resolveTimeBonusSeconds(payload: Record<string, unknown>): number | null {
  const awardedMs = payload.awardedMs
  if (typeof awardedMs !== 'number' || !Number.isFinite(awardedMs) || awardedMs <= 0) return null
  return Math.max(1, Math.round(awardedMs / 1000))
}

function resolvePointsLabel(event: Extract<ScoreboardEvent, { type: 'points_received' }>): string {
  const points = Math.trunc(event.points)
  if (points > 0) return `+${points}`
  if (points < 0) return `${points}`
  return '0'
}

function toCueLabelFromEventId(eventId: string): string {
  const normalized = typeof eventId === 'string' ? eventId.trim() : ''
  if (!normalized) return 'SPECIAL EVENT'
  return normalized
    .split(/[_-]+/g)
    .filter((token) => token.length > 0)
    .join(' ')
    .toUpperCase()
}

export function resolveScoreboardCueTemplates(event: ScoreboardEvent): ScoreboardCueTemplate[] {
  switch (event.type) {
    case 'combo_triggered': {
      const multiplier = Math.max(2, Math.trunc(event.multiplier))
      return [{
        visual: {
          kind: 'combo',
          label: `x${multiplier} COMBO`,
          intensity: clamp(multiplier / 5, 0.65, 1.6),
          durationMs: 780,
          eventType: event.type,
        },
        sound: { kind: 'combo', multiplier },
        cooldownKey: 'combo_triggered',
        cooldownMs: 110,
      }]
    }

    case 'points_received': {
      const isPenalty = event.points < 0 || event.generatedBy === 'spawn_item_penalty'
      const templates: ScoreboardCueTemplate[] = [{
        visual: {
          kind: isPenalty ? 'special' : 'points',
          label: resolvePointsLabel(event),
          intensity: isPenalty ? 0.96 : (event.generatedBy === 'contagion' ? 1.1 : 0.72),
          durationMs: isPenalty ? 520 : (event.generatedBy === 'contagion' ? 520 : 380),
          eventType: event.type,
        },
        cooldownKey: isPenalty
          ? 'points_penalty_fx'
          : (event.generatedBy === 'contagion' ? 'points_contagion_fx' : 'points_generic_fx'),
        cooldownMs: isPenalty ? 70 : (event.generatedBy === 'contagion' ? 90 : 45),
      }]

      if (event.generatedBy === 'contagion') {
        templates.push({
          sound: { kind: 'contagion_points' },
          cooldownKey: 'points_contagion_sound',
          cooldownMs: 220,
        })
      }

      return templates
    }

    case 'game_started':
      return [{
        visual: {
          kind: 'game_started',
          label: 'RUN START',
          intensity: 0.95,
          durationMs: 860,
          eventType: event.type,
        },
        sound: { kind: 'run_started' },
        cooldownKey: 'game_started',
        cooldownMs: 600,
      }]

    case 'game_over':
      return [{
        visual: {
          kind: 'game_over',
          label: 'GAME OVER',
          intensity: 1.15,
          durationMs: 920,
          eventType: event.type,
        },
        sound: { kind: 'run_ended' },
        cooldownKey: 'game_over',
        cooldownMs: 600,
      }]

    case 'initials_step_finished':
      return [{
        visual: {
          kind: 'initials_submitted',
          label: 'SCORE SUBMITTED',
          intensity: 0.85,
          durationMs: 760,
          eventType: event.type,
        },
        sound: { kind: 'initials_submitted' },
        cooldownKey: 'initials_step_finished',
        cooldownMs: 600,
      }]

    case 'game_event_triggered': {
      if (event.eventId === 'timebonus') {
        const seconds = resolveTimeBonusSeconds(event.payload)
        const label = seconds !== null ? `+${seconds}s TIME` : 'TIME BONUS'
        return [{
          visual: {
            kind: 'timebonus',
            label,
            intensity: 1.0,
            durationMs: 740,
            eventType: event.type,
          },
          sound: { kind: 'timebonus' },
          cooldownKey: 'game_event_timebonus',
          cooldownMs: 140,
        }]
      }

      // Placeholder mapping for upcoming game-event ids (e.g. steamroller).
      if (event.eventId === 'steamroller') {
        return [{
          visual: {
            kind: 'special',
            label: 'STEAMROLLER',
            intensity: 1.25,
            durationMs: 880,
            eventType: event.type,
          },
          sound: { kind: 'special_event' },
          cooldownKey: 'game_event_steamroller',
          cooldownMs: 300,
        }]
      }

      return [{
        visual: {
          kind: 'special',
          label: toCueLabelFromEventId(event.eventId),
          intensity: 0.92,
          durationMs: 780,
          eventType: event.type,
        },
        cooldownKey: `game_event_${event.eventId}`,
        cooldownMs: 220,
      }]
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
