import { create } from 'zustand'
import { triggerEventSequence } from '@/audio/BackgroundMusicManager'
import { playGameSound } from '@/audio/GameAudioRouter'
import { resetGameRunClock, setGameRunClockRunning } from '@/game/GameRunClock'
import { useLevelTilingStore } from '@/levels/levelTilingStore'
import { SETTINGS, resolveMaterialColorIndex } from '@/settings/GameSettings'
import { onEntityUnregister } from '@/entities/entityStore'
import { emitScorePop } from '@/input/scorePopEmitter'
import { sendScoreboardEvent } from '@/scoreboard/scoreboardSender'
import { getRunId, rotateRunId } from '@/scoreboard/runId'
import { useSpawnerStore } from '@/gameplay/spawnerStore'
import type { ScoreboardEventSource, ScoreboardLifeLossReason } from '@/scoreboard/scoreboardEvents'

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
  flowState: GameFlowState
  flowEpoch: number
  gameOverInputEndsAtMs: number
  sequence: number
  contagionEpoch: number
  contagionColorsByEntityId: Record<string, number>
  bootstrapIdle: () => void
  startRunFromIdleTrigger: () => void
  handleRunEndedByLives: () => void
  onGameOverTileCentered: () => void
  finishGameOverInputTimeout: () => void
  addScore: (delta: number, source?: ScoreboardEventSource) => void
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

function getInitialLives(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.lives.initial, 0)
}

function resolveGameOverInputDurationMs(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.flow.gameOverInputDurationMs, 5000)
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

let maps = createContagionMaps()
let comboRuntime = createComboRuntimeState()
let gameOverInputTimer: ReturnType<typeof setTimeout> | null = null

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

function clearGameOverInputTimer(): void {
  if (gameOverInputTimer === null) return
  clearTimeout(gameOverInputTimer)
  gameOverInputTimer = null
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
      text: `x${finalMultiplier}`,
      x: sumX * invCount,
      y: sumY * invCount,
      burst: false,
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

export const useGameplayStore = create<GameplayState>((set, get) => ({
  score: 0,
  lastRunScore: 0,
  sessionHighScore: 0,
  lives: getInitialLives(),
  flowState: 'idle',
  flowEpoch: 0,
  gameOverInputEndsAtMs: 0,
  sequence: 0,
  contagionEpoch: 0,
  contagionColorsByEntityId: {},

  bootstrapIdle: () => {
    maps = createContagionMaps()
    resetComboRuntimeState()
    clearGameOverInputTimer()

    let didTransition = false
    set((state) => {
      if (state.flowState === 'idle' && state.flowEpoch > 0) return state
      didTransition = true
      return {
        ...state,
        lives: getInitialLives(),
        flowState: 'idle',
        flowEpoch: state.flowEpoch + 1,
        gameOverInputEndsAtMs: 0,
        sequence: 0,
        contagionEpoch: 0,
        contagionColorsByEntityId: {},
      }
    })

    useSpawnerStore.getState().clearAll()
    setGameRunClockRunning(false)
    resetGameRunClock()

    if (didTransition) {
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
    clearGameOverInputTimer()

    const newRunId = rotateRunId()
    const initialLives = getInitialLives()

    set((state) => {
      if (state.flowState !== 'idle') return state
      return {
        ...state,
        score: 0,
        lives: initialLives,
        flowState: 'run',
        flowEpoch: state.flowEpoch + 1,
        gameOverInputEndsAtMs: 0,
        sequence: 0,
        contagionEpoch: 0,
        contagionColorsByEntityId: {},
      }
    })

    resetGameRunClock()
    setGameRunClockRunning(true)

    sendScoreboardEvent({
      type: 'game_started',
      timestamp: Date.now(),
      runId: newRunId,
      score: 0,
      lives: initialLives,
    })
  },

  handleRunEndedByLives: () => {
    let didTransition = false
    let finalScore = 0
    set((state) => {
      if (state.flowState !== 'run') return state
      didTransition = true
      finalScore = state.score
      return {
        ...state,
        lives: 0,
        lastRunScore: state.score,
        sessionHighScore: Math.max(state.sessionHighScore, state.score),
        flowState: 'game_over_travel',
        flowEpoch: state.flowEpoch + 1,
        gameOverInputEndsAtMs: 0,
      }
    })
    if (!didTransition) return

    resetComboRuntimeState()
    clearGameOverInputTimer()

    setGameRunClockRunning(false)
    resetGameRunClock()

    const gameOverFile = SETTINGS.level.tiling.gameOverFile
    if (gameOverFile && gameOverFile.trim().length > 0) {
      useLevelTilingStore.getState().queueForcedNextTile(gameOverFile)
    } else {
      console.error('[gameplayStore] Missing SETTINGS.level.tiling.gameOverFile while entering game_over_travel.')
    }

    triggerEventSequence('game_over')
    playGameSound({ type: 'run_end' })
    sendScoreboardEvent({
      type: 'game_over',
      timestamp: Date.now(),
      runId: getRunId(),
      finalScore,
    })
  },

  onGameOverTileCentered: () => {
    const durationMs = resolveGameOverInputDurationMs()
    const endsAtMs = Date.now() + durationMs

    let didTransition = false
    set((state) => {
      if (state.flowState !== 'game_over_travel') return state
      didTransition = true
      return {
        ...state,
        flowState: 'game_over_input',
        flowEpoch: state.flowEpoch + 1,
        gameOverInputEndsAtMs: endsAtMs,
      }
    })
    if (!didTransition) return

    clearGameOverInputTimer()
    gameOverInputTimer = setTimeout(() => {
      useGameplayStore.getState().finishGameOverInputTimeout()
    }, durationMs)

    sendScoreboardEvent({
      type: 'initials_step_started',
      timestamp: Date.now(),
      runId: getRunId(),
      durationMs,
    })
  },

  finishGameOverInputTimeout: () => {
    let didTransition = false
    set((state) => {
      if (state.flowState !== 'game_over_input') return state
      didTransition = true
      return {
        ...state,
        flowState: 'idle',
        flowEpoch: state.flowEpoch + 1,
        gameOverInputEndsAtMs: 0,
      }
    })
    if (!didTransition) return

    clearGameOverInputTimer()
    setGameRunClockRunning(false)
    resetGameRunClock()

    sendScoreboardEvent({
      type: 'initials_step_finished',
      timestamp: Date.now(),
      runId: getRunId(),
      reason: 'timeout',
      initials: 'AAA',
    })
    sendScoreboardEvent({
      type: 'idle_started',
      timestamp: Date.now(),
      runId: getRunId(),
    })
  },

  addScore: (delta, source = 'unknown') => {
    const normalizedDelta = normalizeNonNegativeInt(delta, 0)
    if (normalizedDelta === 0) return

    let nextTotal = 0
    let accepted = false
    set((state) => {
      if (state.flowState !== 'run') return state
      accepted = true
      nextTotal = state.score + normalizedDelta
      return { score: nextTotal }
    })

    if (!accepted) return

    sendScoreboardEvent({
      type: 'points_received',
      timestamp: Date.now(),
      runId: getRunId(),
      points: normalizedDelta,
      generatedBy: source,
      totalScore: nextTotal,
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
      get().handleRunEndedByLives()
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
}))

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
