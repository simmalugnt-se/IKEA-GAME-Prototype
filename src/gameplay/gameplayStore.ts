import { create } from 'zustand'
import { playBee, playComboMultiplier, playError, playSteel } from '@/audio/SoundManager'
import { SETTINGS, resolveMaterialColorIndex } from '@/settings/GameSettings'
import { onEntityUnregister } from '@/entities/entityStore'
import { emitScorePop } from '@/input/scorePopEmitter'
import { sendScoreboardEvent } from '@/scoreboard/scoreboardSender'
import { getRunId, rotateRunId } from '@/scoreboard/runId'
import type { ScoreboardEventSource, ScoreboardLifeLossReason } from '@/scoreboard/scoreboardEvents'

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
  gameOver: boolean
  runEndSequence: number
  sequence: number
  contagionEpoch: number
  contagionColorsByEntityId: Record<string, number>
  reset: () => void
  addScore: (delta: number, source?: ScoreboardEventSource) => void
  loseLife: (reason?: ScoreboardLifeLossReason) => void
  loseLives: (delta: number, reason?: ScoreboardLifeLossReason) => void
  setGameOver: (value: boolean) => void
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

function isScoreLockedOnGameOver(): boolean {
  return SETTINGS.gameplay.score.lockOnGameOver === true
}

function getInitialLives(): number {
  return normalizeNonNegativeInt(SETTINGS.gameplay.lives.initial, 0)
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
    playComboMultiplier(finalMultiplier)
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
  gameOver: false,
  runEndSequence: 0,
  sequence: 0,
  contagionEpoch: 0,
  contagionColorsByEntityId: {},

  reset: () => {
    maps = createContagionMaps()
    resetComboRuntimeState()
    const newRunId = rotateRunId()
    const initialLives = getInitialLives()
    set((state) => ({
      score: 0,
      lastRunScore: 0,
      sessionHighScore: state.sessionHighScore,
      lives: initialLives,
      gameOver: false,
      runEndSequence: 0,
      sequence: 0,
      contagionEpoch: 0,
      contagionColorsByEntityId: {},
    }))
    sendScoreboardEvent({
      type: 'game_started',
      timestamp: Date.now(),
      runId: newRunId,
      score: 0,
      lives: initialLives,
    })
  },

  addScore: (delta, source = 'unknown') => {
    const normalizedDelta = normalizeNonNegativeInt(delta, 0)
    if (normalizedDelta === 0) return
    let nextTotal = 0
    let blocked = false
    set((state) => {
      if (isScoreLockedOnGameOver() && state.gameOver) { blocked = true; return state }
      nextTotal = state.score + normalizedDelta
      return { score: nextTotal }
    })
    if (!blocked) {
      sendScoreboardEvent({
        type: 'points_received',
        timestamp: Date.now(),
        runId: getRunId(),
        points: normalizedDelta,
        generatedBy: source,
        totalScore: nextTotal,
      })
    }
  },

  loseLife: (reason = 'unknown') => {
    useGameplayStore.getState().loseLives(SETTINGS.gameplay.lives.lossPerMiss, reason)
  },

  loseLives: (delta, reason = 'unknown') => {
    const normalizedDelta = normalizeNonNegativeInt(delta, 0)
    if (normalizedDelta === 0) return
    let playLifeLostSound = false
    let playRunEndSound = false
    let shouldResetCombo = false
    let livesLostActual = 0
    let livesRemaining = 0
    let didEnterGameOver = false
    let finalScore = 0
    set((state) => {
      if (state.gameOver) return state
      const nextLives = Math.max(0, state.lives - normalizedDelta)
      const didRunEnd = nextLives <= 0
      shouldResetCombo = didRunEnd
      playLifeLostSound = nextLives < state.lives
      playRunEndSound = didRunEnd
      livesLostActual = state.lives - nextLives
      const autoResetLives = SETTINGS.gameplay.lives.autoReset === true
      const nextGameOver = didRunEnd && !autoResetLives
      didEnterGameOver = nextGameOver && !state.gameOver
      const shouldResetOnRunEnd = didRunEnd && SETTINGS.gameplay.score.resetOnRunEnd === true
      const shouldResetOnGameOver = didEnterGameOver && SETTINGS.gameplay.score.resetOnGameOver === true
      const nextScore = (shouldResetOnRunEnd || shouldResetOnGameOver) ? 0 : state.score
      finalScore = state.score
      const nextLastRunScore = didRunEnd ? state.score : state.lastRunScore
      const nextSessionHighScore = didRunEnd
        ? Math.max(state.sessionHighScore, state.score)
        : state.sessionHighScore

      if (didRunEnd && autoResetLives) {
        livesRemaining = getInitialLives()
        return {
          ...state,
          score: nextScore,
          lastRunScore: nextLastRunScore,
          sessionHighScore: nextSessionHighScore,
          lives: livesRemaining,
          runEndSequence: state.runEndSequence + 1,
        }
      }

      livesRemaining = nextLives
      return {
        ...state,
        score: nextScore,
        lastRunScore: nextLastRunScore,
        sessionHighScore: nextSessionHighScore,
        lives: nextLives,
        gameOver: nextGameOver,
        runEndSequence: didRunEnd ? state.runEndSequence + 1 : state.runEndSequence,
      }
    })
    if (playLifeLostSound) {
      playError()
      if (livesLostActual > 0) {
        sendScoreboardEvent({
          type: 'lives_lost',
          timestamp: Date.now(),
          runId: getRunId(),
          amount: livesLostActual,
          reason,
          livesRemaining,
        })
      }
    }
    if (shouldResetCombo) resetComboRuntimeState()
    if (playRunEndSound) {
      playBee()
      if (didEnterGameOver) {
        sendScoreboardEvent({
          type: 'game_over',
          timestamp: Date.now(),
          runId: getRunId(),
          finalScore,
        })
      }
    }
  },

  setGameOver: (value) => {
    const nextValue = value === true
    let playGameOverSound = false
    let shouldResetCombo = false
    let finalScore = 0
    set((state) => {
      if (state.gameOver === nextValue) return state
      playGameOverSound = nextValue
      finalScore = state.score
      shouldResetCombo = nextValue
      const shouldResetScore = nextValue && SETTINGS.gameplay.score.resetOnGameOver === true
      return {
        ...state,
        score: shouldResetScore ? 0 : state.score,
        lastRunScore: nextValue ? state.score : state.lastRunScore,
        sessionHighScore: nextValue
          ? Math.max(state.sessionHighScore, state.score)
          : state.sessionHighScore,
        gameOver: nextValue,
      }
    })
    if (playGameOverSound) {
      playBee()
      sendScoreboardEvent({
        type: 'game_over',
        timestamp: Date.now(),
        runId: getRunId(),
        finalScore,
      })
    }
    if (shouldResetCombo) resetComboRuntimeState()
  },

  removeEntities: (ids) => {
    let changed = false
    for (const id of ids) {
      if (maps.records.delete(id)) changed = true
    }
    set((state) => {
      const next = { ...state.contagionColorsByEntityId }
      for (const id of ids) {
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
    if (isScoreLockedOnGameOver() && get().gameOver) return

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
    const contagionSettings = SETTINGS.gameplay.contagion
    if (!contagionSettings.enabled) return
    if (isScoreLockedOnGameOver() && get().gameOver) return

    const entityA = normalizeCollisionEntity(rawA)
    const entityB = normalizeCollisionEntity(rawB)
    if (!entityA || !entityB) return
    if (entityA.entityId === entityB.entityId) return

    const pairKey = resolvePairKey(entityA.entityId, entityB.entityId)
    if (maps.pendingPairs.has(pairKey)) return

    maps.pendingPairs.set(pairKey, { a: entityA, b: entityB })
  },

  flushContagionQueue: () => {
    if (isScoreLockedOnGameOver() && get().gameOver) {
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
      if (isScoreLockedOnGameOver() && state.gameOver) return state

      let nextSequence = state.sequence
      let nextScore = state.score
      const nextColorsByEntityId = state.contagionColorsByEntityId
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

      pendingPairs.forEach(({ a: entityA, b: entityB }) => {
        const contagionA = ensureCarrier(entityA) ?? maps.records.get(entityA.entityId)
        const contagionB = ensureCarrier(entityB) ?? maps.records.get(entityB.entityId)

        const hasCarrierA = Boolean(contagionA?.carrier)
        const hasCarrierB = Boolean(contagionB?.carrier)

        if (!hasCarrierA && !hasCarrierB) {
          return
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
            return
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
          return
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
          return
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
      })

      if (!contagionChanged) {
        return state
      }

      playSteel()

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

onEntityUnregister((id) => {
  useGameplayStore.getState().removeEntities([id])
})
