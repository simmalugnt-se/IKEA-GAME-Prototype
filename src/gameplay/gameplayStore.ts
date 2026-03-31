import { create } from 'zustand'
import { triggerEventSequence } from '@/audio/BackgroundMusicManager'
import { playGameSound } from '@/audio/GameAudioRouter'
import { resetGameRunClock, setGameRunClockRunning } from '@/game/GameRunClock'
import { useLevelTilingStore } from '@/levels/levelTilingStore'
import {
  buildQueuedSpawnRequestsForSpawnEvent,
  getSpawnEventRules,
  type QueuedSpawnRequest,
} from '@/gameplay/spawnItemSettings'
import { SETTINGS, resolveMaterialColorIndex } from '@/settings/GameSettings'
import type { GameRunMode } from '@/settings/GameSettings.types'
import { onEntityUnregister } from '@/entities/entityStore'
import { emitScorePop } from '@/input/scorePopEmitter'
import { sendScoreboardEvent } from '@/scoreboard/scoreboardSender'
import { getRunId, rotateRunId } from '@/scoreboard/runId'
import {
  submitHighScoreSubmission,
  type HighScoreSubmissionReason,
} from '@/scoreboard/highScoreSubmissionRuntime'
import { useSpawnerStore } from '@/gameplay/spawnerStore'
import type {
  GameOverEndReason,
  ScoreboardEventSource,
  ScoreboardLifeLossReason,
} from '@/scoreboard/scoreboardEvents'
import { normalizeHighScoreInitials } from '@/ui/highScoreEntry/highScoreEntryAlphabet'

export const GAME_FLOW_STATES = [
  'idle',
  'run',
  'game_over_travel',
  'game_over_input',
] as const

export type GameFlowState = (typeof GAME_FLOW_STATES)[number]

export type ContagionRecord = {
  lineageId: string
  colorIndex: number
  carrier: boolean
  activatedAt: number
  seededFrom?: string
}

export type ScreenPos = { x: number; y: number }

export type ContagionCollisionEntity = {
  entityId?: string
  contagionCarrier?: boolean
  contagionInfectable?: boolean
  colorIndex?: number
  screenPos?: ScreenPos
}

export type BalloonPopForComboEvent = {
  x: number
  y: number
  timeMs: number
}

export type SpawnItemHitEffectEvent = {
  scoreDelta: number
  timeDeltaMs: number
  x: number
  y: number
  feedbackText?: string
}

export type RunTimeBonusReason = 'combo' | 'spawn_item' | 'unknown'

type NormalizedCollisionEntity = {
  entityId: string
  carrier: boolean
  infectable: boolean
  colorIndex: number
  screenPos?: ScreenPos
}

type PendingPair = {
  a: NormalizedCollisionEntity
  b: NormalizedCollisionEntity
}

type GameplayState = {
  score: number
  lastRunScore: number
  sessionHighScore: number
  lives: number
  runMode: GameRunMode
  runTimeEndsAtMs: number
  runTimePausedRemainingMs: number
  runTimePauseFromMs: number
  runTimePauseToMs: number
  runTimePauseStartedAtMs: number
  runTimePauseEndsAtMs: number
  flowState: GameFlowState
  flowEpoch: number
  gameOverInitials: string
  gameOverInputEndsAtMs: number
  gameOverTravelTargetZ: number | null
  sequence: number
  contagionEpoch: number
  contagionColorsByEntityId: Record<string, number>
  bootstrapIdle: () => void
  startRunFromIdleTrigger: () => void
  onGameOverTileCentered: () => void
  setGameOverInitials: (initials: string) => void
  registerGameOverInputInteraction: () => void
  submitGameOverInitials: (reason: HighScoreSubmissionReason) => void
  setGameOverTravelTargetZ: (targetZ: number | null) => void
  addScore: (delta: number, source?: ScoreboardEventSource) => void
  addRunTimeMs: (deltaMs: number, reason?: RunTimeBonusReason) => void
  applySpawnItemHitEffect: (event: SpawnItemHitEffectEvent) => void
  loseLife: (reason?: ScoreboardLifeLossReason) => void
  loseLives: (delta: number, reason?: ScoreboardLifeLossReason) => void
  removeEntities: (ids: string[]) => void
  registerBalloonPopForCombo: (event: BalloonPopForComboEvent) => void
  enqueueCollisionPair: (
    entityA: ContagionCollisionEntity | null | undefined,
    entityB: ContagionCollisionEntity | null | undefined,
  ) => void
  flushContagionQueue: () => void
}

function normalizeNonNegativeInt(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.trunc(value))
}

function normalizeInt(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback
  return Math.trunc(value)
}

function getInitialLives(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.lives.initial, 0)
}

function resolveRunModeFromSettings(): GameRunMode {
  return SETTINGS.gameplay.run.mode === 'lives' ? 'lives' : 'time'
}

function resolveRunTimeLimitMs(): number {
  return Math.max(1000, normalizeNonNegativeInt(SETTINGS.gameplay.run.timeLimitMs, 120000))
}

function resolveComboTimeBonusStepMs(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.run.comboTimeBonusStepMs, 5000)
}

function resolveTimeBonusLerpMs(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.run.timeBonusLerpMs, 600)
}

type RunTimeStateFields = Pick<
  GameplayState,
  | 'runTimeEndsAtMs'
  | 'runTimePausedRemainingMs'
  | 'runTimePauseFromMs'
  | 'runTimePauseToMs'
  | 'runTimePauseStartedAtMs'
  | 'runTimePauseEndsAtMs'
>

function createClearedRunTimeStateFields(): RunTimeStateFields {
  return {
    runTimeEndsAtMs: 0,
    runTimePausedRemainingMs: 0,
    runTimePauseFromMs: 0,
    runTimePauseToMs: 0,
    runTimePauseStartedAtMs: 0,
    runTimePauseEndsAtMs: 0,
  }
}

function getDefaultGameOverInitials(): string {
  return normalizeHighScoreInitials('AAA')
}

function resolveGameOverInputInactivityMs(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.flow.gameOverInputInactivityMs, 15000)
}

function resolveGameOverInputCountdownMs(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.flow.gameOverInputCountdownMs, 15000)
}

function normalizeCollisionEntity(raw: ContagionCollisionEntity | null | undefined): NormalizedCollisionEntity | null {
  if (!raw) return null
  if (typeof raw.entityId !== 'string') return null
  const entityId = raw.entityId.trim()
  if (!entityId) return null

  return {
    entityId,
    carrier: raw.contagionCarrier === true,
    infectable: raw.contagionInfectable !== false,
    colorIndex: resolveMaterialColorIndex(raw.colorIndex ?? 0),
    screenPos: raw.screenPos,
  }
}

function resolvePairKey(entityAId: string, entityBId: string): string {
  return entityAId < entityBId
    ? `${entityAId}|${entityBId}`
    : `${entityBId}|${entityAId}`
}

function sourceWinsByLww(
  sourceId: string,
  sourceActivatedAt: number,
  targetId: string,
  targetActivatedAt: number,
): boolean {
  if (sourceActivatedAt !== targetActivatedAt) {
    return sourceActivatedAt > targetActivatedAt
  }
  return sourceId.localeCompare(targetId) > 0
}

type ContagionMaps = {
  records: Map<string, ContagionRecord>
  pendingPairs: Map<string, PendingPair>
}

type ComboStrike = {
  pops: BalloonPopForComboEvent[]
  lastTimeMs: number
}

type ComboRuntimeState = {
  pendingStrike: ComboStrike | null
  flushTimer: ReturnType<typeof setTimeout> | null
  chainBonus: number
  lastMultiStrikeTimeMs: number
}

type CursorSizeBoostRuntimeState = {
  activatedAtMs: number
  endsAtMs: number
  scaleMultiplier: number
  easeInMs: number
  easeOutMs: number
}

function createContagionMaps(): ContagionMaps {
  return {
    records: new Map(),
    pendingPairs: new Map(),
  }
}

function createComboRuntimeState(): ComboRuntimeState {
  return {
    pendingStrike: null,
    flushTimer: null,
    chainBonus: 0,
    lastMultiStrikeTimeMs: Number.NEGATIVE_INFINITY,
  }
}

function createCursorSizeBoostRuntimeState(): CursorSizeBoostRuntimeState {
  return {
    activatedAtMs: 0,
    endsAtMs: 0,
    scaleMultiplier: 1,
    easeInMs: 0,
    easeOutMs: 0,
  }
}

let maps = createContagionMaps()
let comboRuntime = createComboRuntimeState()
let cursorSizeBoostRuntime = createCursorSizeBoostRuntimeState()
let gameOverInputInactivityTimer: ReturnType<typeof setTimeout> | null = null
let gameOverInputCountdownTimer: ReturnType<typeof setTimeout> | null = null
let runEndTimer: ReturnType<typeof setTimeout> | null = null
let timeBonusPauseTimer: ReturnType<typeof setTimeout> | null = null
const spawnEventCooldownsByRuleId = new Map<string, number>()

function clearComboFlushTimer(): void {
  if (comboRuntime.flushTimer === null) return
  clearTimeout(comboRuntime.flushTimer)
  comboRuntime.flushTimer = null
}

function resetComboRuntimeState(): void {
  clearComboFlushTimer()
  comboRuntime.pendingStrike = null
  comboRuntime.chainBonus = 0
  comboRuntime.lastMultiStrikeTimeMs = Number.NEGATIVE_INFINITY
}

function clearGameOverInputInactivityTimer(): void {
  if (gameOverInputInactivityTimer === null) return
  clearTimeout(gameOverInputInactivityTimer)
  gameOverInputInactivityTimer = null
}

function clearGameOverInputCountdownTimer(): void {
  if (gameOverInputCountdownTimer === null) return
  clearTimeout(gameOverInputCountdownTimer)
  gameOverInputCountdownTimer = null
}

function clearGameOverInputTimers(): void {
  clearGameOverInputInactivityTimer()
  clearGameOverInputCountdownTimer()
}

function clearRunEndTimer(): void {
  if (runEndTimer === null) return
  clearTimeout(runEndTimer)
  runEndTimer = null
}

function clearTimeBonusPauseTimer(): void {
  if (timeBonusPauseTimer === null) return
  clearTimeout(timeBonusPauseTimer)
  timeBonusPauseTimer = null
}

function clearRunModeTimers(): void {
  clearRunEndTimer()
  clearTimeBonusPauseTimer()
}

function resetSpawnEventCooldowns(): void {
  spawnEventCooldownsByRuleId.clear()
}

function resolveHighResNowMs(): number {
  if (typeof performance !== 'undefined' && Number.isFinite(performance.now())) {
    return performance.now()
  }
  return Date.now()
}

function easeInOutSine01(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return -(Math.cos(Math.PI * clamped) - 1) * 0.5
}

function resetCursorSizeBoostRuntime(): void {
  cursorSizeBoostRuntime = createCursorSizeBoostRuntimeState()
}

function activateCursorSizeBoost(
  action: {
    scaleMultiplier: number
    durationMs: number
    easeInMs: number
    easeOutMs: number
    feedbackText?: string
  },
  origin?: ScreenPos,
): void {
  const nowMs = resolveHighResNowMs()
  const durationMs = Math.max(1, normalizeNonNegativeInt(action.durationMs, 0))
  cursorSizeBoostRuntime = {
    activatedAtMs: nowMs,
    endsAtMs: nowMs + durationMs,
    scaleMultiplier: Math.max(1, action.scaleMultiplier),
    easeInMs: normalizeNonNegativeInt(action.easeInMs, 0),
    easeOutMs: normalizeNonNegativeInt(action.easeOutMs, 0),
  }

  if (typeof action.feedbackText === 'string' && action.feedbackText.trim().length > 0 && origin) {
    emitScorePop({
      text: action.feedbackText.trim(),
      x: origin.x,
      y: origin.y,
      burst: false,
      style: 'style5',
    })
  }
}

export function getCursorSizeBoostScale(nowMs = resolveHighResNowMs()): number {
  const {
    activatedAtMs,
    endsAtMs,
    scaleMultiplier,
    easeInMs,
    easeOutMs,
  } = cursorSizeBoostRuntime

  if (!(endsAtMs > activatedAtMs) || !(scaleMultiplier > 1)) return 1
  if (nowMs <= activatedAtMs || nowMs >= endsAtMs) return 1

  const totalDurationMs = endsAtMs - activatedAtMs
  const introDurationMs = Math.max(0, Math.min(easeInMs, totalDurationMs))
  const outroDurationMs = Math.max(0, Math.min(easeOutMs, totalDurationMs))
  const plateauStartMs = activatedAtMs + introDurationMs
  const plateauEndMs = endsAtMs - outroDurationMs

  if (introDurationMs > 0 && nowMs < plateauStartMs) {
    const t = (nowMs - activatedAtMs) / introDurationMs
    return 1 + (scaleMultiplier - 1) * easeInOutSine01(t)
  }

  if (outroDurationMs > 0 && nowMs > plateauEndMs) {
    const t = (nowMs - plateauEndMs) / outroDurationMs
    return 1 + (scaleMultiplier - 1) * (1 - easeInOutSine01(t))
  }

  return scaleMultiplier
}

function formatTimeDeltaLabel(deltaMs: number): string {
  const absMs = Math.abs(deltaMs)
  if (absMs <= 0) return ''
  const seconds = absMs / 1000
  const rounded = Number.isInteger(seconds) ? `${seconds}` : seconds.toFixed(1)
  const prefix = deltaMs >= 0 ? '+' : '-'
  return `${prefix}${rounded}S`
}

function buildSpawnItemEffectLabel(scoreDelta: number, timeDeltaMs: number, feedbackText?: string): string {
  const lines: string[] = []
  if (typeof feedbackText === 'string' && feedbackText.trim().length > 0) {
    lines.push(feedbackText.trim())
  }
  if (scoreDelta !== 0) lines.push(`${scoreDelta > 0 ? '+' : ''}${scoreDelta}`)
  if (timeDeltaMs !== 0) lines.push(formatTimeDeltaLabel(timeDeltaMs))
  return lines.join('\n')
}

function maybeTriggerSpawnEventsForComboMultiplier(
  multiplier: number,
  origin?: ScreenPos,
): void {
  if (!(multiplier >= 2)) return

  const nowMs = Date.now()
  const queuedRequests: QueuedSpawnRequest[] = []

  const rules = getSpawnEventRules()
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i]
    if (!rule || rule.enabled !== true) continue
    const ruleId = typeof rule.id === 'string' ? rule.id.trim() : ''
    if (!ruleId) continue
    if (rule.trigger.type !== 'combo_multiplier') continue
    if (multiplier < Math.max(2, Math.trunc(rule.trigger.minMultiplier))) continue

    const cooldownMs = normalizeNonNegativeInt(rule.trigger.cooldownMs, 0)
    const nextAllowedAtMs = spawnEventCooldownsByRuleId.get(ruleId) ?? 0
    if (nowMs < nextAllowedAtMs) continue

    spawnEventCooldownsByRuleId.set(ruleId, nowMs + cooldownMs)

    if (rule.action.type === 'spawn_burst') {
      const requests = buildQueuedSpawnRequestsForSpawnEvent(rule)
      if (requests.length <= 0) continue
      queuedRequests.push(...requests)
      continue
    }

    if (rule.action.type === 'cursor_size_boost') {
      activateCursorSizeBoost(rule.action, origin)
    }
  }

  if (queuedRequests.length > 0) {
    useSpawnerStore.getState().enqueueSpawns(queuedRequests)
  }
}

function scheduleGameOverInputInactivityTimer(): void {
  clearGameOverInputTimers()
  const inactivityMs = resolveGameOverInputInactivityMs()
  gameOverInputInactivityTimer = setTimeout(() => {
    gameOverInputInactivityTimer = null
    const state = useGameplayStore.getState()
    if (state.flowState !== 'game_over_input') return

    const countdownMs = resolveGameOverInputCountdownMs()
    const endsAtMs = Date.now() + countdownMs
    useGameplayStore.setState((previousState) => {
      if (previousState.flowState !== 'game_over_input') return previousState
      return {
        ...previousState,
        gameOverInputEndsAtMs: endsAtMs,
      }
    })

    clearGameOverInputCountdownTimer()
    gameOverInputCountdownTimer = setTimeout(() => {
      gameOverInputCountdownTimer = null
      useGameplayStore.getState().submitGameOverInitials('timeout')
    }, countdownMs)
  }, inactivityMs)
}

function resolveComboStrikeWindowMs(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.balloons.combo.strikeWindowMs, 100)
}

function resolveComboChainWindowMs(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.balloons.combo.chainWindowMs, 800)
}

function resolveComboChainBonusCap(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.balloons.combo.chainBonusCap, 2)
}

function scheduleComboStrikeFlush(): void {
  clearComboFlushTimer()
  comboRuntime.flushTimer = setTimeout(() => {
    comboRuntime.flushTimer = null
    flushPendingComboStrike()
  }, resolveComboStrikeWindowMs())
}

function flushPendingComboStrike(): void {
  const strike = comboRuntime.pendingStrike
  if (!strike) return
  comboRuntime.pendingStrike = null
  clearComboFlushTimer()

  const strikeSize = strike.pops.length
  if (strikeSize <= 0) return

  const chainWindowMs = resolveComboChainWindowMs()
  const chainBonusCap = resolveComboChainBonusCap()

  let finalMultiplier = 1
  let appliedChainBonus = 0
  if (strikeSize >= 2) {
    const withinChainWindow = (
      Number.isFinite(comboRuntime.lastMultiStrikeTimeMs)
      && strike.lastTimeMs - comboRuntime.lastMultiStrikeTimeMs <= chainWindowMs
    )
    comboRuntime.chainBonus = withinChainWindow
      ? Math.min(chainBonusCap, comboRuntime.chainBonus + 1)
      : 0
    appliedChainBonus = comboRuntime.chainBonus
    finalMultiplier = strikeSize + appliedChainBonus
    comboRuntime.lastMultiStrikeTimeMs = strike.lastTimeMs
  } else if (
    Number.isFinite(comboRuntime.lastMultiStrikeTimeMs)
    && strike.lastTimeMs - comboRuntime.lastMultiStrikeTimeMs > chainWindowMs
  ) {
    comboRuntime.chainBonus = 0
    comboRuntime.lastMultiStrikeTimeMs = Number.NEGATIVE_INFINITY
  }

  const baseScorePerPop = normalizeNonNegativeInt(SETTINGS.gameplay.balloons.scorePerPop, 0)
  const perPopScore = baseScorePerPop * finalMultiplier
  const totalStrikeScore = perPopScore * strikeSize
  const scoreSource: ScoreboardEventSource = strikeSize >= 2
    ? 'balloon_combo'
    : 'balloon_pop'

  if (totalStrikeScore > 0) {
    useGameplayStore.getState().addScore(totalStrikeScore, scoreSource)
  }
  const totalScoreAfterStrike = useGameplayStore.getState().score

  if (perPopScore > 0) {
    const scoreText = `+${perPopScore}`
    for (let i = 0; i < strike.pops.length; i += 1) {
      const pop = strike.pops[i]
      if (!pop) continue
      emitScorePop({
        text: scoreText,
        x: pop.x,
        y: pop.y,
        style: 'style3',
      })
    }
  }

  if (strikeSize >= 2) {
    let sumX = 0
    let sumY = 0
    for (let i = 0; i < strike.pops.length; i += 1) {
      const pop = strike.pops[i]
      if (!pop) continue
      sumX += pop.x
      sumY += pop.y
    }
    const invCount = 1 / strikeSize
    emitScorePop({
      text: `X${finalMultiplier}\nCOMBO!`,
      x: sumX * invCount,
      y: sumY * invCount,
      burst: false,
      style: 'style5',
    })
    playGameSound({ type: 'combo_triggered', multiplier: finalMultiplier })
    sendScoreboardEvent({
      type: 'combo_triggered',
      timestamp: Date.now(),
      runId: getRunId(),
      multiplier: finalMultiplier,
      strikeSize,
      chainBonus: appliedChainBonus,
      perPopPoints: perPopScore,
      totalPoints: totalStrikeScore,
      totalScore: totalScoreAfterStrike,
    })
    maybeTriggerSpawnEventsForComboMultiplier(finalMultiplier, {
      x: sumX * invCount,
      y: sumY * invCount,
    })
  }

  const comboTimeBonusStepMs = resolveComboTimeBonusStepMs()
  const comboTimeBonusMs = Math.max(0, finalMultiplier - 1) * comboTimeBonusStepMs
  if (comboTimeBonusMs > 0) {
    useGameplayStore.getState().addRunTimeMs(comboTimeBonusMs, 'combo')
  }
}

function normalizeComboPopEvent(raw: BalloonPopForComboEvent): BalloonPopForComboEvent {
  const fallbackX = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0
  const fallbackY = typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0
  const fallbackTime = typeof performance !== 'undefined' ? performance.now() : Date.now()

  return {
    x: Number.isFinite(raw.x) ? raw.x : fallbackX,
    y: Number.isFinite(raw.y) ? raw.y : fallbackY,
    timeMs: Number.isFinite(raw.timeMs) ? raw.timeMs : fallbackTime,
  }
}

export const useGameplayStore = create<GameplayState>((set, get) => {
  let runTimerScopeToken = 0

  const advanceRunTimerScope = (): number => {
    runTimerScopeToken += 1
    clearRunModeTimers()
    return runTimerScopeToken
  }

  const isRunTimerScopeActive = (scopeToken: number): boolean => {
    return scopeToken === runTimerScopeToken
  }

  const scheduleRunEndTimer = (scopeToken: number, endsAtMs: number): void => {
    clearRunEndTimer()
    const delayMs = Math.max(0, endsAtMs - Date.now())
    runEndTimer = setTimeout(() => {
      runEndTimer = null
      if (!isRunTimerScopeActive(scopeToken)) return
      const state = get()
      if (state.flowState !== 'run' || state.runMode !== 'time') return
      if (state.runTimePauseEndsAtMs > Date.now()) return
      if (state.runTimeEndsAtMs > Date.now()) {
        scheduleRunEndTimer(scopeToken, state.runTimeEndsAtMs)
        return
      }
      endRun('time_elapsed')
    }, delayMs)
  }

  const resumeRunTimeAfterPause = (scopeToken: number): void => {
    if (!isRunTimerScopeActive(scopeToken)) return
    const nowMs = Date.now()
    let nextEndsAtMs = 0
    let shouldEndRun = false
    set((state) => {
      if (state.flowState !== 'run' || state.runMode !== 'time') return state
      const nextRemainingMs = Math.max(0, Math.trunc(state.runTimePausedRemainingMs))
      if (nextRemainingMs <= 0) {
        shouldEndRun = true
        return {
          ...state,
          ...createClearedRunTimeStateFields(),
          runTimeEndsAtMs: nowMs,
        }
      }
      nextEndsAtMs = nowMs + nextRemainingMs
      return {
        ...state,
        ...createClearedRunTimeStateFields(),
        runTimeEndsAtMs: nextEndsAtMs,
      }
    })

    if (!isRunTimerScopeActive(scopeToken)) return
    if (shouldEndRun) {
      endRun('time_elapsed')
      return
    }
    if (nextEndsAtMs > 0) {
      scheduleRunEndTimer(scopeToken, nextEndsAtMs)
    }
  }

  const scheduleRunTimePauseResume = (scopeToken: number, pauseEndsAtMs: number): void => {
    clearRunEndTimer()
    clearTimeBonusPauseTimer()
    const delayMs = Math.max(0, pauseEndsAtMs - Date.now())
    timeBonusPauseTimer = setTimeout(() => {
      timeBonusPauseTimer = null
      resumeRunTimeAfterPause(scopeToken)
    }, delayMs)
  }

  const endRun = (endReason: GameOverEndReason): void => {
    const levelTilingStore = useLevelTilingStore.getState()
    const gameOverFiles = SETTINGS.level.tiling.gameOverFiles
      .map((file) => file.trim())
      .filter((file) => file.length > 0)
    const previewTravelTargetZ = gameOverFiles.length > 0
      ? levelTilingStore.previewForcedFinalCenterZ(gameOverFiles)
      : null

    let didTransition = false
    let finalScore = 0
    set((state) => {
      if (state.flowState !== 'run') return state
      didTransition = true
      finalScore = state.score
      return {
        ...state,
        lives: endReason === 'lives_depleted' ? 0 : state.lives,
        lastRunScore: state.score,
        sessionHighScore: Math.max(state.sessionHighScore, state.score),
        flowState: 'game_over_travel',
        flowEpoch: state.flowEpoch + 1,
        gameOverInitials: getDefaultGameOverInitials(),
        gameOverInputEndsAtMs: 0,
        gameOverTravelTargetZ: previewTravelTargetZ,
        ...createClearedRunTimeStateFields(),
      }
    })
    if (!didTransition) return

    resetComboRuntimeState()
    resetSpawnEventCooldowns()
    resetCursorSizeBoostRuntime()
    clearGameOverInputTimers()
    advanceRunTimerScope()

    setGameRunClockRunning(false)
    resetGameRunClock()

    if (gameOverFiles.length > 0) {
      levelTilingStore.setForcedTiles(gameOverFiles)
      if (previewTravelTargetZ === null) {
        console.error('[gameplayStore] Could not resolve game-over travel target from forced tile preview.')
      }
    } else {
      console.error('[gameplayStore] Missing SETTINGS.level.tiling.gameOverFiles while entering game_over_travel.')
    }

    triggerEventSequence('game_over')
    playGameSound({ type: 'run_end' })
    sendScoreboardEvent({
      type: 'game_over',
      timestamp: Date.now(),
      runId: getRunId(),
      finalScore,
      endReason,
    })
  }

  const resolveCurrentRemainingTimeMs = (state: GameplayState, nowMs: number): number => {
    if (state.runMode !== 'time') return 0
    if (state.runTimePauseEndsAtMs > nowMs) {
      return Math.max(0, Math.trunc(state.runTimePauseToMs))
    }
    return Math.max(0, Math.trunc(state.runTimeEndsAtMs - nowMs))
  }

  return ({
  score: 0,
  lastRunScore: 0,
  sessionHighScore: 0,
  lives: getInitialLives(),
  runMode: resolveRunModeFromSettings(),
  ...createClearedRunTimeStateFields(),
  flowState: 'idle',
  flowEpoch: 0,
  gameOverInitials: getDefaultGameOverInitials(),
  gameOverInputEndsAtMs: 0,
  gameOverTravelTargetZ: null,
  sequence: 0,
  contagionEpoch: 0,
  contagionColorsByEntityId: {},

  bootstrapIdle: () => {
    maps = createContagionMaps()
    resetComboRuntimeState()
    resetSpawnEventCooldowns()
    resetCursorSizeBoostRuntime()
    clearGameOverInputTimers()
    advanceRunTimerScope()

    let didTransition = false
    set((state) => {
      if (state.flowState === 'idle' && state.flowEpoch > 0) return state
      didTransition = true
      return {
        ...state,
        lives: getInitialLives(),
        runMode: resolveRunModeFromSettings(),
        flowState: 'idle',
        flowEpoch: state.flowEpoch + 1,
        gameOverInitials: getDefaultGameOverInitials(),
        gameOverInputEndsAtMs: 0,
        gameOverTravelTargetZ: null,
        ...createClearedRunTimeStateFields(),
        sequence: 0,
        contagionEpoch: 0,
        contagionColorsByEntityId: {},
      }
    })

    useSpawnerStore.getState().clearAll()
    setGameRunClockRunning(false)
    resetGameRunClock()

    if (didTransition) {
      playGameSound({ type: 'idle_started' })
      sendScoreboardEvent({
        type: 'idle_started',
        timestamp: Date.now(),
        runId: getRunId(),
      })
    }
  },

  startRunFromIdleTrigger: () => {
    const stateBefore = get()
    if (stateBefore.flowState !== 'idle') return

    maps = createContagionMaps()
    resetComboRuntimeState()
    resetSpawnEventCooldowns()
    resetCursorSizeBoostRuntime()
    clearGameOverInputTimers()
    const runScopeToken = advanceRunTimerScope()

    const newRunId = rotateRunId()
    const initialLives = getInitialLives()
    const runMode = resolveRunModeFromSettings()
    const runTimeLimitMs = resolveRunTimeLimitMs()
    const runStartMs = Date.now()
    const runTimeEndsAtMs = runMode === 'time' ? runStartMs + runTimeLimitMs : 0

    set((state) => {
      if (state.flowState !== 'idle') return state
      return {
        ...state,
        score: 0,
        lives: initialLives,
        runMode,
        ...createClearedRunTimeStateFields(),
        runTimeEndsAtMs,
        flowState: 'run',
        flowEpoch: state.flowEpoch + 1,
        gameOverInitials: getDefaultGameOverInitials(),
        gameOverInputEndsAtMs: 0,
        gameOverTravelTargetZ: null,
        sequence: 0,
        contagionEpoch: 0,
        contagionColorsByEntityId: {},
      }
    })

    resetGameRunClock()
    setGameRunClockRunning(true)
    if (runMode === 'time') {
      scheduleRunEndTimer(runScopeToken, runTimeEndsAtMs)
    }

    playGameSound({ type: 'run_started' })
    sendScoreboardEvent({
      type: 'game_started',
      timestamp: Date.now(),
      runId: newRunId,
      score: 0,
      lives: initialLives,
      runMode,
      timeLimitMs: runTimeLimitMs,
    })
  },

  onGameOverTileCentered: () => {
    const inactivityMs = resolveGameOverInputInactivityMs()
    const countdownMs = resolveGameOverInputCountdownMs()
    const stepDurationMs = inactivityMs + countdownMs

    let didTransition = false
    set((state) => {
      if (state.flowState !== 'game_over_travel') return state
      didTransition = true
      return {
        ...state,
        flowState: 'game_over_input',
        flowEpoch: state.flowEpoch + 1,
        gameOverInputEndsAtMs: 0,
      }
    })
    if (!didTransition) return

    scheduleGameOverInputInactivityTimer()

    sendScoreboardEvent({
      type: 'initials_step_started',
      timestamp: Date.now(),
      runId: getRunId(),
      durationMs: stepDurationMs,
    })
  },

  setGameOverInitials: (initials) => {
    const normalized = normalizeHighScoreInitials(initials)
    set((state) => {
      if (state.flowState !== 'game_over_input') return state
      if (state.gameOverInitials === normalized) return state
      return {
        ...state,
        gameOverInitials: normalized,
      }
    })
  },

  registerGameOverInputInteraction: () => {
    let shouldSchedule = false
    set((state) => {
      if (state.flowState !== 'game_over_input') return state
      shouldSchedule = true
      if (!(state.gameOverInputEndsAtMs > 0)) return state
      return {
        ...state,
        gameOverInputEndsAtMs: 0,
      }
    })

    if (!shouldSchedule) return
    scheduleGameOverInputInactivityTimer()
  },

  submitGameOverInitials: (reason) => {
    let didTransition = false
    let submittedInitials = getDefaultGameOverInitials()
    let submittedScore = 0
    const submittedAtMs = Date.now()

    set((state) => {
      if (state.flowState !== 'game_over_input') return state
      didTransition = true
      submittedInitials = normalizeHighScoreInitials(state.gameOverInitials)
      submittedScore = Math.max(0, Math.trunc(state.lastRunScore))
      return {
        ...state,
        runMode: resolveRunModeFromSettings(),
        flowState: 'idle',
        flowEpoch: state.flowEpoch + 1,
        gameOverInputEndsAtMs: 0,
        gameOverTravelTargetZ: null,
        ...createClearedRunTimeStateFields(),
      }
    })
    if (!didTransition) return

    clearGameOverInputTimers()
    resetCursorSizeBoostRuntime()
    advanceRunTimerScope()
    setGameRunClockRunning(false)
    resetGameRunClock()

    const submission = submitHighScoreSubmission({
      runId: getRunId(),
      score: submittedScore,
      initials: submittedInitials,
      submittedAtMs,
      submittedAtIso: new Date(submittedAtMs).toISOString(),
      reason,
    })

    playGameSound({ type: 'idle_started' })
    sendScoreboardEvent({
      type: 'initials_step_finished',
      timestamp: Date.now(),
      runId: getRunId(),
      reason,
      initials: submittedInitials,
      score: submittedScore,
      submittedAtMs,
      rank: submission.rank,
      totalEntries: submission.totalEntries,
      storageMode: submission.storageMode,
    })
    sendScoreboardEvent({
      type: 'idle_started',
      timestamp: Date.now(),
      runId: getRunId(),
    })
  },

  setGameOverTravelTargetZ: (targetZ) => {
    set((state) => {
      if (state.flowState !== 'game_over_travel') return state
      return {
        ...state,
        gameOverTravelTargetZ: Number.isFinite(targetZ) ? (targetZ as number) : null,
      }
    })
  },

  addScore: (delta, source = 'unknown') => {
    const normalizedDelta = normalizeInt(delta, 0)
    if (normalizedDelta === 0) return

    let nextTotal = 0
    let appliedDelta = 0
    let accepted = false
    set((state) => {
      if (state.flowState !== 'run') return state
      nextTotal = Math.max(0, state.score + normalizedDelta)
      appliedDelta = nextTotal - state.score
      if (appliedDelta === 0) return state
      accepted = true
      return { score: nextTotal }
    })

    if (!accepted) return

    sendScoreboardEvent({
      type: 'points_received',
      timestamp: Date.now(),
      runId: getRunId(),
      points: appliedDelta,
      generatedBy: source,
      totalScore: nextTotal,
    })
  },

  addRunTimeMs: (deltaMs, _reason = 'unknown') => {
    void _reason
    const normalizedDeltaMs = normalizeInt(deltaMs, 0)
    if (normalizedDeltaMs === 0) return
    const stateBefore = get()
    if (stateBefore.flowState !== 'run' || stateBefore.runMode !== 'time') return

    const nowMs = Date.now()
    const lerpMs = resolveTimeBonusLerpMs()
    const scopeToken = runTimerScopeToken
    let accepted = false
    let nextEndsAtMs = 0
    let nextPauseEndsAtMs = 0

    set((state) => {
      if (state.flowState !== 'run' || state.runMode !== 'time') return state
      const currentRemainingMs = resolveCurrentRemainingTimeMs(state, nowMs)
      const targetRemainingMs = Math.max(0, currentRemainingMs + normalizedDeltaMs)
      accepted = true

      if (lerpMs <= 0) {
        nextEndsAtMs = nowMs + targetRemainingMs
        return {
          ...state,
          ...createClearedRunTimeStateFields(),
          runTimeEndsAtMs: nextEndsAtMs,
        }
      }

      nextPauseEndsAtMs = nowMs + lerpMs
      return {
        ...state,
        runTimeEndsAtMs: 0,
        runTimePausedRemainingMs: targetRemainingMs,
        runTimePauseFromMs: currentRemainingMs,
        runTimePauseToMs: targetRemainingMs,
        runTimePauseStartedAtMs: nowMs,
        runTimePauseEndsAtMs: nextPauseEndsAtMs,
      }
    })

    if (!accepted || !isRunTimerScopeActive(scopeToken)) return

    if (lerpMs <= 0) {
      scheduleRunEndTimer(scopeToken, nextEndsAtMs)
      return
    }
    scheduleRunTimePauseResume(scopeToken, nextPauseEndsAtMs)
  },

  applySpawnItemHitEffect: (event) => {
    if (get().flowState !== 'run') return

    const requestedScoreDelta = normalizeInt(event.scoreDelta, 0)
    const timeDeltaMs = normalizeInt(event.timeDeltaMs, 0)
    if (requestedScoreDelta === 0 && timeDeltaMs === 0) return

    const isPenaltyEffect = requestedScoreDelta < 0 || timeDeltaMs < 0
    if (isPenaltyEffect) {
      resetComboRuntimeState()
    }

    let appliedScoreDelta = 0

    if (requestedScoreDelta !== 0) {
      const scoreBefore = get().score
      get().addScore(
        requestedScoreDelta,
        requestedScoreDelta > 0 ? 'spawn_item_bonus' : 'spawn_item_penalty',
      )
      appliedScoreDelta = get().score - scoreBefore
    }
    if (timeDeltaMs !== 0) {
      get().addRunTimeMs(timeDeltaMs, 'spawn_item')
    }

    const text = buildSpawnItemEffectLabel(appliedScoreDelta, timeDeltaMs, event.feedbackText)
    if (!text) return

    emitScorePop({
      text,
      x: event.x,
      y: event.y,
      burst: false,
      style: appliedScoreDelta < 0 || timeDeltaMs < 0 ? 'style5' : 'style2',
    })
  },

  loseLife: (reason = 'unknown') => {
    useGameplayStore.getState().loseLives(SETTINGS.gameplay.lives.lossPerMiss, reason)
  },

  loseLives: (delta, reason = 'unknown') => {
    const normalizedDelta = normalizeNonNegativeInt(delta, 0)
    if (normalizedDelta === 0) return

    let shouldEndRun = false
    let livesLostActual = 0
    let livesRemaining = 0
    set((state) => {
      if (state.flowState !== 'run') return state
      if (state.runMode !== 'lives') return state

      const nextLives = Math.max(0, state.lives - normalizedDelta)
      livesLostActual = state.lives - nextLives
      livesRemaining = nextLives
      shouldEndRun = nextLives <= 0

      return {
        ...state,
        lives: nextLives,
      }
    })

    if (livesLostActual <= 0) return

    playGameSound({ type: 'life_lost' })
    sendScoreboardEvent({
      type: 'lives_lost',
      timestamp: Date.now(),
      runId: getRunId(),
      amount: livesLostActual,
      reason,
      livesRemaining,
    })

    if (shouldEndRun) {
      endRun('lives_depleted')
    }
  },

  removeEntities: (ids) => {
    let changed = false
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]
      if (!id) continue
      if (maps.records.delete(id)) changed = true
    }

    set((state) => {
      const next = { ...state.contagionColorsByEntityId }
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i]
        if (!id) continue
        if (id in next) {
          delete next[id]
          changed = true
        }
      }
      if (!changed) return state
      return { contagionColorsByEntityId: next }
    })
  },

  registerBalloonPopForCombo: (rawEvent) => {
    if (get().flowState !== 'run') return

    const popEvent = normalizeComboPopEvent(rawEvent)
    const comboSettings = SETTINGS.gameplay.balloons.combo
    if (!comboSettings.enabled) {
      resetComboRuntimeState()
      const baseScore = normalizeNonNegativeInt(SETTINGS.gameplay.balloons.scorePerPop, 0)
      if (baseScore > 0) {
        get().addScore(baseScore, 'balloon_pop')
        emitScorePop({
          text: `+${baseScore}`,
          x: popEvent.x,
          y: popEvent.y,
          style: 'style3',
        })
      }
      return
    }

    const strikeWindowMs = resolveComboStrikeWindowMs()
    const activeStrike = comboRuntime.pendingStrike
    if (!activeStrike) {
      comboRuntime.pendingStrike = {
        pops: [popEvent],
        lastTimeMs: popEvent.timeMs,
      }
      scheduleComboStrikeFlush()
      return
    }

    if (popEvent.timeMs - activeStrike.lastTimeMs <= strikeWindowMs) {
      activeStrike.pops.push(popEvent)
      activeStrike.lastTimeMs = popEvent.timeMs
      scheduleComboStrikeFlush()
      return
    }

    flushPendingComboStrike()
    comboRuntime.pendingStrike = {
      pops: [popEvent],
      lastTimeMs: popEvent.timeMs,
    }
    scheduleComboStrikeFlush()
  },

  enqueueCollisionPair: (rawA, rawB) => {
    if (get().flowState !== 'run') return

    const contagionSettings = SETTINGS.gameplay.contagion
    if (!contagionSettings.enabled) return

    const entityA = normalizeCollisionEntity(rawA)
    const entityB = normalizeCollisionEntity(rawB)
    if (!entityA || !entityB) return
    if (entityA.entityId === entityB.entityId) return

    const pairKey = resolvePairKey(entityA.entityId, entityB.entityId)
    if (maps.pendingPairs.has(pairKey)) return

    maps.pendingPairs.set(pairKey, { a: entityA, b: entityB })
  },

  flushContagionQueue: () => {
    if (get().flowState !== 'run') {
      maps.pendingPairs.clear()
      return
    }
    if (maps.pendingPairs.size === 0) return

    const pendingPairs = Array.from(maps.pendingPairs.values())
    maps.pendingPairs.clear()

    let contagionScoreDelta = 0

    set((state) => {
      const contagionSettings = SETTINGS.gameplay.contagion
      if (!contagionSettings.enabled) return state
      if (state.flowState !== 'run') return state

      let nextSequence = state.sequence
      let nextScore = state.score
      const nextColorsByEntityId = { ...state.contagionColorsByEntityId }
      let contagionChanged = false
      const setEntityColor = (entityId: string, colorIndex: number) => {
        if (nextColorsByEntityId[entityId] === colorIndex) return
        nextColorsByEntityId[entityId] = colorIndex
      }
      const ensureCarrier = (entity: NormalizedCollisionEntity): ContagionRecord | undefined => {
        const current = maps.records.get(entity.entityId)
        if (current) return current
        if (!entity.carrier) return undefined

        contagionChanged = true
        nextSequence += 1
        const seeded: ContagionRecord = {
          lineageId: entity.entityId,
          colorIndex: entity.colorIndex,
          carrier: true,
          activatedAt: nextSequence,
          seededFrom: 'carrier',
        }
        maps.records.set(entity.entityId, seeded)
        setEntityColor(entity.entityId, seeded.colorIndex)
        return seeded
      }

      for (let i = 0; i < pendingPairs.length; i += 1) {
        const pair = pendingPairs[i]
        if (!pair) continue
        const entityA = pair.a
        const entityB = pair.b

        const contagionA = ensureCarrier(entityA) ?? maps.records.get(entityA.entityId)
        const contagionB = ensureCarrier(entityB) ?? maps.records.get(entityB.entityId)

        const hasCarrierA = Boolean(contagionA?.carrier)
        const hasCarrierB = Boolean(contagionB?.carrier)

        if (!hasCarrierA && !hasCarrierB) {
          continue
        }

        let source: NormalizedCollisionEntity
        let target: NormalizedCollisionEntity
        let sourceRecord: ContagionRecord

        if (hasCarrierA && !hasCarrierB) {
          source = entityA
          target = entityB
          sourceRecord = contagionA!
        } else if (!hasCarrierA && hasCarrierB) {
          source = entityB
          target = entityA
          sourceRecord = contagionB!
        } else {
          if (contagionA!.lineageId === contagionB!.lineageId) {
            continue
          }

          const aWins = sourceWinsByLww(
            entityA.entityId,
            contagionA!.activatedAt,
            entityB.entityId,
            contagionB!.activatedAt,
          )
          source = aWins ? entityA : entityB
          target = aWins ? entityB : entityA
          sourceRecord = aWins ? contagionA! : contagionB!
        }

        if (!target.infectable) {
          continue
        }

        const targetCurrent = maps.records.get(target.entityId)
        const nextTargetColor = sourceRecord.colorIndex
        const nextTargetLineage = sourceRecord.lineageId

        if (
          targetCurrent
          && targetCurrent.carrier
          && targetCurrent.colorIndex === nextTargetColor
          && targetCurrent.lineageId === nextTargetLineage
        ) {
          continue
        }

        contagionChanged = true
        nextSequence += 1
        maps.records.set(target.entityId, {
          lineageId: nextTargetLineage,
          colorIndex: nextTargetColor,
          carrier: true,
          activatedAt: nextSequence,
          seededFrom: source.entityId,
        })
        setEntityColor(target.entityId, nextTargetColor)
        const infectionScore = Math.max(0, contagionSettings.scorePerInfection)
        nextScore += infectionScore
        if (infectionScore > 0 && target.screenPos) {
          emitScorePop({
            text: `+${infectionScore}`,
            ...target.screenPos,
            style: 'style3',
          })
        }
      }

      if (!contagionChanged) {
        return state
      }

      playGameSound({ type: 'contagion_infection' })

      contagionScoreDelta = nextScore - state.score

      return {
        ...state,
        score: nextScore,
        sequence: nextSequence,
        contagionEpoch: state.contagionEpoch + 1,
        contagionColorsByEntityId: nextColorsByEntityId,
      }
    })

    if (contagionScoreDelta > 0) {
      sendScoreboardEvent({
        type: 'points_received',
        timestamp: Date.now(),
        runId: getRunId(),
        points: contagionScoreDelta,
        generatedBy: 'contagion',
        totalScore: useGameplayStore.getState().score,
      })
    }
  },
  })
})

export function useContagionColorOverride(entityId: string | undefined): number | undefined {
  return useGameplayStore((state) => {
    if (!entityId) return undefined
    return state.contagionColorsByEntityId[entityId]
  })
}

export function getGameplayFlowState(): GameFlowState {
  return useGameplayStore.getState().flowState
}

export function isGameplayRunFlow(): boolean {
  return useGameplayStore.getState().flowState === 'run'
}

export function isMotionSystemFlowActive(): boolean {
  return useGameplayStore.getState().flowState !== 'game_over_input'
}

onEntityUnregister((id) => {
  useGameplayStore.getState().removeEntities([id])
})
