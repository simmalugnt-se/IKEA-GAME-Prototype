import type {
  HighScoreListSlotEntry,
  HighScoreScoreboardEntry,
  ScoreboardEvent,
} from '@/scoreboard/scoreboardEvents'
import type {
  EventBalloonTypeEnumValue,
  ScoreboardRiveDataPatch,
  ScoreboardRiveDriver,
  ScoreboardRiveTrigger,
} from '@/ui/scoreboard/ScoreboardRiveDriver'
import { isScoreboardRiveDebugLoggingEnabled } from '@/ui/scoreboard/scoreboardRiveDebugLogging'

export type ScoreboardRiveEventApplication = {
  data: ScoreboardRiveDataPatch
  trigger?: ScoreboardRiveTrigger
  triggers?: readonly ScoreboardRiveTrigger[]
}

export type ApplyScoreboardEventToRiveOptions = {
  fireTrigger?: boolean
}

const EVENT_BALLOON_TYPES = [
  'ground_ball_wave_reward',
  'slowmo_reward',
  'track_sweeper_reward',
  'gravity_loss_reward',
  'combo_cluster_reward',
] as const satisfies readonly EventBalloonTypeEnumValue[]

function formatSignedIntLabel(value: number): string {
  const normalized = Math.trunc(value)
  if (normalized > 0) return `+${normalized}`
  return `${normalized}`
}

function resolveEventBalloonType(eventId: string): EventBalloonTypeEnumValue | undefined {
  return EVENT_BALLOON_TYPES.find((type) => type === eventId)
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function payloadMsToSeconds(payload: Record<string, unknown>, key: string): number {
  const value = payloadNumber(payload, key)
  return value === undefined ? 0 : Math.max(0, value) / 1000
}

function resolveTimebonusCurrentSeconds(payload: Record<string, unknown>): number {
  const currentRemainingMs = payloadNumber(payload, 'currentRemainingMs')
  if (currentRemainingMs !== undefined) return Math.max(0, currentRemainingMs) / 1000

  const targetRemainingMs = payloadNumber(payload, 'targetRemainingMs')
  const awardedMs = payloadNumber(payload, 'awardedMs')
  if (targetRemainingMs !== undefined && awardedMs !== undefined) {
    return Math.max(0, targetRemainingMs - awardedMs) / 1000
  }

  return 0
}

function toEventIdLabel(eventId: string): string {
  return eventId
    .split(/[_-]+/g)
    .filter((token) => token.length > 0)
    .join(' ')
    .toUpperCase()
}

function stringifyPayload(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload)
  } catch {
    return '{}'
  }
}

function resolveGameEventLabel(event: Extract<ScoreboardEvent, { type: 'game_event_triggered' }>): string {
  if (event.eventId === 'timebonus') {
    const awardedMs = event.payload.awardedMs
    if (typeof awardedMs === 'number' && Number.isFinite(awardedMs) && awardedMs > 0) {
      return `+${Math.max(1, Math.round(awardedMs / 1000))}s TIME`
    }
    return 'TIME BONUS'
  }
  return toEventIdLabel(event.eventId || 'SPECIAL EVENT')
}

function createBaseEventData(event: ScoreboardEvent): ScoreboardRiveDataPatch {
  return {
    eventTimestamp: event.timestamp,
    eventType: event.type,
    runId: event.runId,
  }
}

function toRiveInitials(value: string | undefined | null): string {
  if (typeof value !== 'string') return ''
  return value.toUpperCase()
}

function writeHighScoreTopRow(
  data: Record<string, number | string | boolean>,
  index: number,
  entry: HighScoreScoreboardEntry | undefined,
  latestRunId: string | null,
): void {
  const row = index + 1
  data[`highScoreTopRank${row}`] = entry?.rank ?? 0
  data[`highScoreTopInitials${row}`] = toRiveInitials(entry?.initials)
  data[`highScoreTopScore${row}`] = entry?.score ?? 0
  const isLatest = entry !== undefined && latestRunId !== null && entry.runId === latestRunId
  data[`highScoreTopOpacity${row}`] = entry === undefined ? 0 : isLatest ? 1 : 0.5
}

function writeListSlotRow(
  data: Record<string, number | string | boolean>,
  index: number,
  entry: HighScoreListSlotEntry | undefined,
): void {
  const row = index + 1
  data[`listSlotRank${row}`] = entry?.rank ?? 0
  data[`listSlotInitials${row}`] = toRiveInitials(entry?.initials)
  data[`listSlotScore${row}`] = entry?.score ?? 0
  data[`listSlotOpacity${row}`] = entry?.opacity ?? 0
}

function mapHighScoresUpdatedEventToRive(
  event: Extract<ScoreboardEvent, { type: 'high_scores_updated' }>,
  base: ScoreboardRiveDataPatch,
): ScoreboardRiveEventApplication {
  const data: Record<string, number | string | boolean> = {
    ...base,
    eventLabel: 'HIGH SCORES',
    highScoreStorageMode: event.storageMode,
  }

  for (let i = 0; i < 5; i += 1) {
    writeHighScoreTopRow(data, i, event.topEntries[i], event.latestRunId)
  }

  return {
    data: data as ScoreboardRiveDataPatch,
    trigger: 'triggerHighScoresUpdated',
  }
}

function mapLiveRankUpdatedEventToRive(
  event: Extract<ScoreboardEvent, { type: 'live_rank_updated' }>,
  base: ScoreboardRiveDataPatch,
): ScoreboardRiveEventApplication {
  const data: Record<string, number | string | boolean> = {
    ...base,
    score: event.score,
    rank: event.rank,
    playerInitials: toRiveInitials(event.playerInitials),
  }

  for (let i = 0; i < 5; i += 1) {
    writeListSlotRow(data, i, event.listSlots[i])
  }

  return {
    data: data as ScoreboardRiveDataPatch,
    trigger: 'triggerLiveRankChanged',
  }
}

export function mapScoreboardEventToRive(event: ScoreboardEvent): ScoreboardRiveEventApplication {
  const base = createBaseEventData(event)

  switch (event.type) {
    case 'idle_started':
      return {
        data: {
          ...base,
          eventLabel: 'IDLE',
          gameState: 'idle',
        },
        trigger: 'triggerIdleStarted',
      }

    case 'game_started':
      return {
        data: {
          ...base,
          score: event.score,
          scoreDelta: 0,
          comboMultiplier: 1,
          lives: event.lives,
          livesRemaining: event.lives,
          rank: 0,
          timeLimitMs: event.timeLimitMs,
          eventLabel: 'RUN START',
          playerInitials: 'YOU',
          runMode: event.runMode,
          gameState: 'run',
        },
        trigger: 'triggerGameStarted',
      }

    case 'points_received':
      return {
        data: {
          ...base,
          score: event.totalScore,
          scoreDelta: event.points,
          generatedBy: event.generatedBy,
          eventLabel: formatSignedIntLabel(event.points),
        },
        trigger: 'triggerPointsReceived',
      }

    case 'combo_triggered':
      return {
        data: {
          ...base,
          score: event.totalScore,
          scoreDelta: event.totalPoints,
          comboMultiplier: event.multiplier,
          comboStrikeSize: event.strikeSize,
          comboChainBonus: event.chainBonus,
          comboPerPopPoints: event.perPopPoints,
          comboTotalPoints: event.totalPoints,
          eventLabel: `x${Math.trunc(event.multiplier)} COMBO`,
        },
        trigger: 'triggerComboTriggered',
      }

    case 'game_event_triggered':
      if (event.eventId === 'timebonus') {
        return {
          data: {
            ...base,
            gameEventId: event.eventId,
            gameEventPayloadJson: stringifyPayload(event.payload),
            eventLabel: resolveGameEventLabel(event),
            timebonusCurrentSeconds: resolveTimebonusCurrentSeconds(event.payload),
            timebonusAwardedSeconds: payloadMsToSeconds(event.payload, 'awardedMs'),
          },
          trigger: 'triggerSpecialEvent',
          triggers: ['timebonusTrigger'],
        }
      }

      return {
        data: {
          ...base,
          gameEventId: event.eventId,
          gameEventPayloadJson: stringifyPayload(event.payload),
          eventLabel: resolveGameEventLabel(event),
          eventBalloonType: resolveEventBalloonType(event.eventId) ?? 'none',
        },
        trigger: 'triggerSpecialEvent',
      }

    case 'lives_lost':
      return {
        data: {
          ...base,
          lives: event.livesRemaining,
          livesLostAmount: event.amount,
          livesRemaining: event.livesRemaining,
          lifeLossReason: event.reason,
          eventLabel: 'LIFE LOST',
        },
        trigger: 'triggerLivesLost',
      }

    case 'game_over':
      return {
        data: {
          ...base,
          score: event.finalScore,
          gameOverReason: event.endReason,
          eventLabel: 'GAME OVER',
          gameState: 'gameover',
          eventBalloonType: 'none',
        },
        trigger: 'triggerGameOver',
      }

    case 'initials_step_started':
      return {
        data: {
          ...base,
          initialsDurationMs: event.durationMs,
          eventLabel: 'ENTER INITIALS',
          gameState: 'entry',
        },
        trigger: 'triggerInitialsStepStarted',
      }

    case 'initials_step_finished':
      return {
        data: {
          ...base,
          score: event.score,
          rank: event.rank ?? 0,
          totalEntries: event.totalEntries,
          submittedAtMs: event.submittedAtMs,
          initialsFinishReason: event.reason,
          storageMode: event.storageMode,
          eventLabel: 'SCORE SUBMITTED',
          playerInitials: toRiveInitials(event.initials),
        },
        trigger: 'triggerInitialsSubmitted',
      }

    case 'high_scores_updated':
      return mapHighScoresUpdatedEventToRive(event, base)

    case 'live_rank_updated':
      return mapLiveRankUpdatedEventToRive(event, base)

    default:
      return { data: base }
  }
}

export function applyScoreboardEventToRive(
  riveDriver: ScoreboardRiveDriver,
  event: ScoreboardEvent,
  options: ApplyScoreboardEventToRiveOptions = {},
): ScoreboardRiveEventApplication {
  const application = mapScoreboardEventToRive(event)
  if (isScoreboardRiveDebugLoggingEnabled()) {
    console.log('[scoreboard:rive:apply]', {
      event,
      riveData: application.data,
      trigger: options.fireTrigger === false ? null : application.trigger ?? null,
    })
  }
  riveDriver.applyScoreboardData(application.data)
  if (application.trigger && options.fireTrigger !== false) {
    riveDriver.fireScoreboardTrigger(application.trigger)
  }
  if (application.triggers && options.fireTrigger !== false) {
    for (const trigger of application.triggers) {
      riveDriver.fireScoreboardTrigger(trigger)
    }
  }
  return application
}
