import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import {
  getLatestCursorSweepSeq,
  readCursorSweepSegment,
  readCursorPointerRenderState,
  type CursorPointerRenderState,
  type CursorSweepSegment,
} from '@/input/cursorVelocity'
import { SETTINGS } from '@/settings/GameSettings'
import { useSettingsVersion } from '@/settings/settingsStore'
import {
  normalizeHighScoreInitials,
  shiftHighScoreLetter,
} from '@/ui/highScoreEntry/highScoreEntryAlphabet'
import {
  isEdgeTransitionPass,
  resolveRectPassThroughMetrics,
  type RectEdge,
  toScreenRect,
  type ScreenRect,
} from '@/ui/highScoreEntry/highScoreEntrySwipe'
import { formatScore } from '@/ui/scoreFormat'
import { runOverlayFlowTransition } from '@/ui/viewTransitions/overlayFlowViewTransition'
import './GameFlowOverlay.css'

function resolveCountdownSeconds(endsAtMs: number, nowMs: number): number {
  if (!(endsAtMs > 0)) return 0
  const remainingMs = endsAtMs - nowMs
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / 1000)
}

function resolveRemainingRatio(endsAtMs: number, nowMs: number, durationMs: number): number {
  if (!(endsAtMs > 0) || !(durationMs > 0)) return 0
  const remainingMs = endsAtMs - nowMs
  if (remainingMs <= 0) return 0
  return Math.max(0, Math.min(1, remainingMs / durationMs))
}

const GAME_OVER_SCORE_TICK_MS = 1000
const GAME_OVER_PREVIEW_SCORE = 65300
const HIGH_SCORE_INITIALS_LENGTH = 3
const BUTTON_DWELL_HOLD_CLASS = 'gfo-button-dwell-hold'

type GameOverPreviewMode = 'off' | 'state1' | 'state2'
type FlowScenarioOverride = `flow:${string}`

type HitZones = {
  letters: Array<ScreenRect | null>
  back: ScreenRect | null
  next: ScreenRect | null
}

type ButtonDwellState = {
  inside: boolean
  enteredAtMs: number
  lastInsideAtMs: number
  triggeredThisVisit: boolean
}

type ButtonDwellBySlot = [ButtonDwellState, ButtonDwellState]

type LetterPassState = {
  inside: boolean
  entryEdge: RectEdge | null
  insideDistancePx: number
  maxVelocityPx: number
}

type LetterPassBySlot = [LetterPassState, LetterPassState]

function createButtonDwellState(): ButtonDwellState {
  return {
    inside: false,
    enteredAtMs: 0,
    lastInsideAtMs: 0,
    triggeredThisVisit: false,
  }
}

function resetButtonDwellState(state: ButtonDwellState): void {
  state.inside = false
  state.enteredAtMs = 0
  state.lastInsideAtMs = 0
  state.triggeredThisVisit = false
}

function resetButtonDwellBySlot(states: ButtonDwellBySlot): void {
  resetButtonDwellState(states[0])
  resetButtonDwellState(states[1])
}

function createLetterPassState(): LetterPassState {
  return {
    inside: false,
    entryEdge: null,
    insideDistancePx: 0,
    maxVelocityPx: 0,
  }
}

function resetLetterPassState(state: LetterPassState): void {
  state.inside = false
  state.entryEdge = null
  state.insideDistancePx = 0
  state.maxVelocityPx = 0
}

function resetLetterPassBySlot(states: LetterPassBySlot): void {
  resetLetterPassState(states[0])
  resetLetterPassState(states[1])
}

function pointInScreenRect(x: number, y: number, rect: ScreenRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

function setButtonDwellClass(
  button: HTMLButtonElement | null,
  classActiveRef: { current: boolean },
  active: boolean,
): void {
  if (classActiveRef.current === active) return
  classActiveRef.current = active
  if (!button) return
  if (active) {
    button.classList.add(BUTTON_DWELL_HOLD_CLASS)
    return
  }
  button.classList.remove(BUTTON_DWELL_HOLD_CLASS)
}

function updateButtonDwellState(
  state: ButtonDwellState,
  isInside: boolean,
  nowMs: number,
  dwellMs: number,
  jitterGraceMs: number,
): boolean {
  if (isInside) {
    if (!state.inside) {
      state.inside = true
      state.enteredAtMs = nowMs
      state.triggeredThisVisit = false
    }
    state.lastInsideAtMs = nowMs
  } else if (state.inside && nowMs - state.lastInsideAtMs >= jitterGraceMs) {
    resetButtonDwellState(state)
  }

  if (!state.inside || state.triggeredThisVisit) return false
  if (nowMs - state.enteredAtMs < dwellMs) return false
  state.triggeredThisVisit = true
  return true
}

function resolveInitialLetters(rawInitials: string): [string, string, string] {
  const normalized = normalizeHighScoreInitials(rawInitials, HIGH_SCORE_INITIALS_LENGTH)
  return [
    normalized[0] ?? 'A',
    normalized[1] ?? 'A',
    normalized[2] ?? 'A',
  ]
}

function clearHitZones(zones: HitZones): void {
  zones.back = null
  zones.next = null
  for (let i = 0; i < HIGH_SCORE_INITIALS_LENGTH; i += 1) {
    zones.letters[i] = null
  }
}

export function GameFlowOverlay() {
  useSettingsVersion()

  const flowState = useGameplayStore((state) => state.flowState)
  const gameOverInputEndsAtMs = useGameplayStore((state) => state.gameOverInputEndsAtMs)
  const gameOverInitials = useGameplayStore((state) => state.gameOverInitials)
  const lastRunScore = useGameplayStore((state) => state.lastRunScore)
  const setGameOverInitials = useGameplayStore((state) => state.setGameOverInitials)
  const registerGameOverInputInteraction = useGameplayStore((state) => state.registerGameOverInputInteraction)
  const submitGameOverInitials = useGameplayStore((state) => state.submitGameOverInitials)

  const [nowMs, setNowMs] = useState(() => Date.now())
  const [displayGameOverScore, setDisplayGameOverScore] = useState(0)
  const [activeLetterIndex, setActiveLetterIndex] = useState(0)

  const scoreTickRafIdRef = useRef<number | null>(null)
  const scoreTickStartMsRef = useRef<number | null>(null)
  const scoreTickTargetRef = useRef(0)
  const previousIsGameOverViewRef = useRef(false)
  const previousScoreTargetRef = useRef(0)

  const overlayRootRef = useRef<HTMLDivElement | null>(null)
  const letterSlotRefs = useRef<Array<HTMLSpanElement | null>>([null, null, null])
  const backButtonRef = useRef<HTMLButtonElement | null>(null)
  const nextButtonRef = useRef<HTMLButtonElement | null>(null)
  const hitZonesRef = useRef<HitZones>({
    letters: [null, null, null],
    back: null,
    next: null,
  })

  const gestureRafIdRef = useRef<number | null>(null)
  const lastSweepSeqRef = useRef(0)
  const sweepSegmentRef = useRef<CursorSweepSegment>({
    seq: 0,
    timeMs: 0,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    velocityPx: 0,
    velocityScreenXPx: 0,
    velocityScreenYPx: 0,
    pointerSlot: 0,
  })
  const pointerRenderScratchRef = useRef<[CursorPointerRenderState, CursorPointerRenderState]>([
    { slot: 0, active: false, x: 0, y: 0, velocityPx: 0 },
    { slot: 1, active: false, x: 0, y: 0, velocityPx: 0 },
  ])
  const lastLetterActionAtMsRef = useRef(Number.NEGATIVE_INFINITY)
  const letterPassBySlotRef = useRef<LetterPassBySlot>([
    createLetterPassState(),
    createLetterPassState(),
  ])
  const backDwellBySlotRef = useRef<ButtonDwellBySlot>([
    createButtonDwellState(),
    createButtonDwellState(),
  ])
  const nextDwellBySlotRef = useRef<ButtonDwellBySlot>([
    createButtonDwellState(),
    createButtonDwellState(),
  ])
  const backButtonHoldClassActiveRef = useRef(false)
  const nextButtonHoldClassActiveRef = useRef(false)
  const activeLetterIndexRef = useRef(activeLetterIndex)
  const initialsRef = useRef(normalizeHighScoreInitials(gameOverInitials, HIGH_SCORE_INITIALS_LENGTH))
  const setGameOverInitialsRef = useRef(setGameOverInitials)
  const registerGameOverInputInteractionRef = useRef(registerGameOverInputInteraction)
  const submitGameOverInitialsRef = useRef(submitGameOverInitials)
  const pendingFlowScenarioOverrideRef = useRef<FlowScenarioOverride | null>(null)
  const previewChainRafIdRef = useRef<number | null>(null)

  // TEMP_GAME_OVER_PREVIEW_START
  const [previewMode, setPreviewMode] = useState<GameOverPreviewMode>('off')
  const [previewInputEndsAtMs, setPreviewInputEndsAtMs] = useState(0)
  const previewModeRef = useRef<GameOverPreviewMode>(previewMode)
  // TEMP_GAME_OVER_PREVIEW_END

  const effectiveFlowState =
    previewMode === 'state1'
      ? 'game_over_travel'
      : previewMode === 'state2'
        ? 'game_over_input'
        : flowState
  const effectiveInputEndsAtMs = previewMode === 'state2' ? previewInputEndsAtMs : gameOverInputEndsAtMs
  const isGameOverView = effectiveFlowState === 'game_over_travel' || effectiveFlowState === 'game_over_input'
  const [visualFlowState, setVisualFlowState] = useState(effectiveFlowState)
  const lastCommittedFlowRef = useRef(effectiveFlowState)
  const activeTransitionSeqRef = useRef(0)
  const resolvedScoreTarget = Math.max(
    0,
    Math.trunc(previewMode === 'off' ? lastRunScore : GAME_OVER_PREVIEW_SCORE),
  )

  const timerDurationMs = Math.max(1, SETTINGS.gameplay.flow.gameOverInputCountdownMs)
  const swipeConfig = SETTINGS.gameplay.flow.highScoreEntrySwipe
  const letterMinVelocityPx = Math.max(0, swipeConfig.letterMinVelocityPx)
  const letterMinDistancePx = Math.max(0, swipeConfig.letterMinDistancePx)
  const letterCooldownMs = Math.max(0, Math.trunc(swipeConfig.letterCooldownMs))
  const buttonDwellMs = Math.max(0, Math.trunc(swipeConfig.buttonDwellMs))
  const buttonDwellJitterGraceMs = Math.max(0, Math.trunc(swipeConfig.buttonDwellJitterGraceMs))
  const greenPalette = SETTINGS.palette.variants.green.colors
  const dwellProgressColor = greenPalette[1]?.base ?? greenPalette[0]?.base ?? '#669E10'

  const backDisabled = activeLetterIndex <= 0
  const nextLabel = activeLetterIndex >= HIGH_SCORE_INITIALS_LENGTH - 1
    ? 'GO!'
    : 'NEXT LETTER'
  const buttonDwellStyle = {
    '--gfo-button-dwell-ms': `${buttonDwellMs}ms`,
    '--gfo-button-dwell-color': dwellProgressColor,
  } as CSSProperties
  const [letter0, letter1, letter2] = resolveInitialLetters(gameOverInitials)

  useEffect(() => {
    activeLetterIndexRef.current = activeLetterIndex
  }, [activeLetterIndex])

  useEffect(() => {
    initialsRef.current = normalizeHighScoreInitials(gameOverInitials, HIGH_SCORE_INITIALS_LENGTH)
  }, [gameOverInitials])

  useEffect(() => {
    previewModeRef.current = previewMode
  }, [previewMode])

  useEffect(() => {
    setGameOverInitialsRef.current = setGameOverInitials
    registerGameOverInputInteractionRef.current = registerGameOverInputInteraction
    submitGameOverInitialsRef.current = submitGameOverInitials
  }, [registerGameOverInputInteraction, setGameOverInitials, submitGameOverInitials])

  function transitionActiveLetterIndex(nextIndex: number): void {
    const from = activeLetterIndexRef.current
    if (from === nextIndex) return

    resetLetterPassBySlot(letterPassBySlotRef.current)
    activeTransitionSeqRef.current += 1
    const transitionSeq = activeTransitionSeqRef.current
    runOverlayFlowTransition({
      scope: 'step',
      from,
      to: nextIndex,
      kind: 'pair',
      seq: transitionSeq,
      commit: () => {
        activeLetterIndexRef.current = nextIndex
        setActiveLetterIndex((previous) => (previous === nextIndex ? previous : nextIndex))
      },
    })
  }

  function setPreviewFlowState(
    nextMode: GameOverPreviewMode,
    nextInputEndsAtMs: number,
    scenarioOverride?: FlowScenarioOverride,
  ): void {
    pendingFlowScenarioOverrideRef.current = scenarioOverride ?? null
    setPreviewMode(nextMode)
    setPreviewInputEndsAtMs(nextInputEndsAtMs)
  }

  function clearPreviewFlowChainRaf(): void {
    if (previewChainRafIdRef.current === null) return
    cancelAnimationFrame(previewChainRafIdRef.current)
    previewChainRafIdRef.current = null
  }

  useLayoutEffect(() => {
    const from = lastCommittedFlowRef.current
    const to = effectiveFlowState
    const scenarioOverride = pendingFlowScenarioOverrideRef.current
    pendingFlowScenarioOverrideRef.current = null

    if (from === to) {
      setVisualFlowState((previous) => (previous === to ? previous : to))
      return
    }

    activeTransitionSeqRef.current += 1
    const transitionSeq = activeTransitionSeqRef.current
    runOverlayFlowTransition({
      scope: 'flow',
      from,
      to,
      scenarioOverride: scenarioOverride ?? undefined,
      seq: transitionSeq,
      commit: () => {
        lastCommittedFlowRef.current = to
        setVisualFlowState((previous) => (previous === to ? previous : to))
      },
    })
  }, [effectiveFlowState])

  // TEMP_GAME_OVER_PREVIEW_START
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const target = event.target as HTMLElement | null
      if (target) {
        const tagName = target.tagName
        if (
          target.isContentEditable
          || tagName === 'INPUT'
          || tagName === 'TEXTAREA'
          || tagName === 'SELECT'
        ) {
          return
        }
      }

      if (event.code === 'Digit8') {
        event.preventDefault()
        clearPreviewFlowChainRaf()
        if (previewModeRef.current === 'state2') {
          setPreviewFlowState('state1', 0, 'flow:game_over_input>game_over_travel')
          return
        }
        if (previewModeRef.current === 'state1') return
        setPreviewFlowState('state1', 0, 'flow:run>game_over_travel')
        return
      }

      if (event.code === 'Digit9') {
        event.preventDefault()
        clearPreviewFlowChainRaf()
        if (previewModeRef.current === 'state2') return
        if (previewModeRef.current === 'state1') {
          setPreviewFlowState('state2', Date.now() + timerDurationMs, 'flow:game_over_travel>game_over_input')
          return
        }

        setPreviewFlowState('state1', 0, 'flow:run>game_over_travel')
        previewChainRafIdRef.current = requestAnimationFrame(() => {
          previewChainRafIdRef.current = null
          setPreviewFlowState('state2', Date.now() + timerDurationMs, 'flow:game_over_travel>game_over_input')
        })
        return
      }

      if (event.code === 'Digit0') {
        event.preventDefault()
        clearPreviewFlowChainRaf()
        if (previewModeRef.current === 'state2') {
          setPreviewFlowState('off', 0, 'flow:game_over_input>idle')
          return
        }
        if (previewModeRef.current === 'state1') {
          setPreviewFlowState('off', 0, 'flow:game_over_travel>idle')
          return
        }
        setPreviewFlowState('off', 0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearPreviewFlowChainRaf()
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [timerDurationMs])

  useEffect(() => {
    if (previewMode !== 'state2') return
    if (previewInputEndsAtMs > Date.now()) return
    setPreviewInputEndsAtMs(Date.now() + timerDurationMs)
  }, [previewMode, previewInputEndsAtMs, timerDurationMs])
  // TEMP_GAME_OVER_PREVIEW_END

  useEffect(() => {
    const enteredInput = visualFlowState === 'game_over_input'
    if (!enteredInput) {
      setActiveLetterIndex(0)
      activeLetterIndexRef.current = 0
      resetLetterPassBySlot(letterPassBySlotRef.current)
      resetButtonDwellBySlot(backDwellBySlotRef.current)
      resetButtonDwellBySlot(nextDwellBySlotRef.current)
      setButtonDwellClass(backButtonRef.current, backButtonHoldClassActiveRef, false)
      setButtonDwellClass(nextButtonRef.current, nextButtonHoldClassActiveRef, false)
      return
    }

    setActiveLetterIndex(0)
    activeLetterIndexRef.current = 0
    lastLetterActionAtMsRef.current = Number.NEGATIVE_INFINITY
    resetLetterPassBySlot(letterPassBySlotRef.current)
    resetButtonDwellBySlot(backDwellBySlotRef.current)
    resetButtonDwellBySlot(nextDwellBySlotRef.current)
    setButtonDwellClass(backButtonRef.current, backButtonHoldClassActiveRef, false)
    setButtonDwellClass(nextButtonRef.current, nextButtonHoldClassActiveRef, false)
    lastSweepSeqRef.current = getLatestCursorSweepSeq()
  }, [visualFlowState])

  useEffect(() => {
    const shouldTickTime = effectiveFlowState === 'game_over_input' && effectiveInputEndsAtMs > 0
    if (!shouldTickTime) return

    setNowMs(Date.now())
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 100)

    return () => {
      clearInterval(timer)
    }
  }, [effectiveFlowState, effectiveInputEndsAtMs])

  useEffect(() => {
    const wasGameOverView = previousIsGameOverViewRef.current
    const enteredGameOverView = !wasGameOverView && isGameOverView
    const scoreTargetChanged = previousScoreTargetRef.current !== resolvedScoreTarget

    previousIsGameOverViewRef.current = isGameOverView
    previousScoreTargetRef.current = resolvedScoreTarget

    if (!isGameOverView) {
      if (scoreTickRafIdRef.current !== null) {
        cancelAnimationFrame(scoreTickRafIdRef.current)
        scoreTickRafIdRef.current = null
      }
      scoreTickStartMsRef.current = null
      scoreTickTargetRef.current = 0
      setDisplayGameOverScore(0)
      return
    }

    if (!enteredGameOverView && !scoreTargetChanged) return

    if (scoreTickRafIdRef.current !== null) {
      cancelAnimationFrame(scoreTickRafIdRef.current)
      scoreTickRafIdRef.current = null
    }

    setDisplayGameOverScore(0)
    scoreTickStartMsRef.current = null
    scoreTickTargetRef.current = resolvedScoreTarget

    const step = (now: number) => {
      if (scoreTickStartMsRef.current === null) {
        scoreTickStartMsRef.current = now
      }
      const elapsedMs = now - scoreTickStartMsRef.current
      const linearT = Math.max(0, Math.min(1, elapsedMs / GAME_OVER_SCORE_TICK_MS))
      const easedT = 1 - Math.pow(1 - linearT, 3)
      const rawScore = Math.floor(scoreTickTargetRef.current * easedT)
      const clampedScore = Math.max(0, Math.min(scoreTickTargetRef.current, rawScore))

      setDisplayGameOverScore((previousScore) => (
        clampedScore > previousScore ? clampedScore : previousScore
      ))

      if (linearT >= 1 || clampedScore >= scoreTickTargetRef.current) {
        setDisplayGameOverScore(scoreTickTargetRef.current)
        scoreTickRafIdRef.current = null
        return
      }

      scoreTickRafIdRef.current = requestAnimationFrame(step)
    }

    scoreTickRafIdRef.current = requestAnimationFrame(step)
  }, [isGameOverView, resolvedScoreTarget])

  useEffect(() => {
    return () => {
      if (scoreTickRafIdRef.current !== null) {
        cancelAnimationFrame(scoreTickRafIdRef.current)
        scoreTickRafIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const zones = hitZonesRef.current
    if (effectiveFlowState !== 'game_over_input') {
      clearHitZones(zones)
      return
    }

    const updateHitZones = () => {
      for (let i = 0; i < HIGH_SCORE_INITIALS_LENGTH; i += 1) {
        const node = letterSlotRefs.current[i]
        zones.letters[i] = node ? toScreenRect(node.getBoundingClientRect()) : null
      }

      const backNode = backButtonRef.current
      const nextNode = nextButtonRef.current
      zones.back = backNode ? toScreenRect(backNode.getBoundingClientRect()) : null
      zones.next = nextNode ? toScreenRect(nextNode.getBoundingClientRect()) : null
    }

    updateHitZones()
    const deferredUpdateRaf = requestAnimationFrame(updateHitZones)

    let resizeObserver: ResizeObserver | null = null
    const root = overlayRootRef.current
    if (typeof ResizeObserver !== 'undefined' && root) {
      resizeObserver = new ResizeObserver(updateHitZones)
      resizeObserver.observe(root)
    }

    window.addEventListener('resize', updateHitZones, { passive: true })
    window.addEventListener('scroll', updateHitZones, { passive: true })

    return () => {
      cancelAnimationFrame(deferredUpdateRaf)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateHitZones)
      window.removeEventListener('scroll', updateHitZones)
    }
  }, [activeLetterIndex, effectiveFlowState, nextLabel])

  useEffect(() => {
    if (effectiveFlowState !== 'game_over_input') return
    if (previewMode !== 'off') return

    let disposed = false

    const frame = () => {
      if (disposed) return
      gestureRafIdRef.current = requestAnimationFrame(frame)

      const latestSweepSeq = getLatestCursorSweepSeq()
      const sweepSegment = sweepSegmentRef.current

      if (latestSweepSeq > lastSweepSeqRef.current) {
        for (let sweepSeq = lastSweepSeqRef.current + 1; sweepSeq <= latestSweepSeq; sweepSeq += 1) {
          if (!readCursorSweepSegment(sweepSeq, sweepSegment)) continue

          const timeMs = Number.isFinite(sweepSegment.timeMs)
            ? sweepSegment.timeMs
            : performance.now()

          const zones = hitZonesRef.current
          const activeIndex = activeLetterIndexRef.current
          const activeLetterZone = zones.letters[activeIndex] ?? null
          const pointerSlot = sweepSegment.pointerSlot as 0 | 1
          const passState = letterPassBySlotRef.current[pointerSlot]
          if (activeLetterZone === null) {
            resetLetterPassState(passState)
            continue
          }

          const passMetrics = resolveRectPassThroughMetrics(
            sweepSegment.x0,
            sweepSegment.y0,
            sweepSegment.x1,
            sweepSegment.y1,
            activeLetterZone,
          )

          if (!passMetrics) {
            if (passState.inside) {
              resetLetterPassState(passState)
            }
            continue
          }

          if (passMetrics.entryEdge !== null) {
            if (!passState.inside) {
              passState.inside = true
              passState.entryEdge = passMetrics.entryEdge
              passState.insideDistancePx = 0
              passState.maxVelocityPx = 0
            } else if (passState.entryEdge === null) {
              passState.entryEdge = passMetrics.entryEdge
            }
          } else if (passMetrics.startsInside && !passState.inside) {
            passState.inside = true
            passState.entryEdge = null
            passState.insideDistancePx = 0
            passState.maxVelocityPx = 0
          }

          if (passState.inside) {
            passState.insideDistancePx += passMetrics.insideDistancePx
            if (sweepSegment.velocityPx > passState.maxVelocityPx) {
              passState.maxVelocityPx = sweepSegment.velocityPx
            }
          }

          if (passMetrics.exitEdge !== null && passState.inside) {
            const zoneWidth = Math.max(0, activeLetterZone.right - activeLetterZone.left)
            const zoneHeight = Math.max(0, activeLetterZone.bottom - activeLetterZone.top)
            const requiredInsidePx = Math.max(letterMinDistancePx, Math.min(zoneWidth, zoneHeight) * 0.55)
            const hasValidPassThrough = isEdgeTransitionPass(passState.entryEdge, passMetrics.exitEdge)
            const hasVelocity = passState.maxVelocityPx >= letterMinVelocityPx
            const isCooledDown = timeMs - lastLetterActionAtMsRef.current >= letterCooldownMs

            if (
              hasValidPassThrough
              && passState.insideDistancePx >= requiredInsidePx
              && hasVelocity
              && isCooledDown
            ) {
              lastLetterActionAtMsRef.current = timeMs

              const initials = initialsRef.current
              const letters = Array.from(initials)
              const currentLetter = letters[activeIndex] ?? 'A'
              letters[activeIndex] = shiftHighScoreLetter(currentLetter, 1)

              const nextInitials = normalizeHighScoreInitials(letters.join(''), HIGH_SCORE_INITIALS_LENGTH)
              initialsRef.current = nextInitials
              setGameOverInitialsRef.current(nextInitials)
              registerGameOverInputInteractionRef.current()
            }
            resetLetterPassState(passState)
            continue
          }

          if (!passMetrics.endsInside && passState.inside) {
            resetLetterPassState(passState)
          }
        }

        lastSweepSeqRef.current = latestSweepSeq
      }

      const nowMs = performance.now()
      const zones = hitZonesRef.current
      const backZone = zones.back
      const nextZone = zones.next
      const backDwellBySlot = backDwellBySlotRef.current
      const nextDwellBySlot = nextDwellBySlotRef.current
      const pointerRenderStates = pointerRenderScratchRef.current
      let resolvedLetterIndex = activeLetterIndexRef.current

      let backHoldClassActive = false
      let nextHoldClassActive = false

      for (let slot = 0; slot < 2; slot += 1) {
        const pointerState = pointerRenderStates[slot]
        const pointerActive = readCursorPointerRenderState(slot as 0 | 1, nowMs, pointerState)
        const pointerX = pointerState.x
        const pointerY = pointerState.y

        const touchingBack = pointerActive && backZone !== null
          ? pointInScreenRect(pointerX, pointerY, backZone)
          : false
        const touchingNext = pointerActive && nextZone !== null
          ? pointInScreenRect(pointerX, pointerY, nextZone)
          : false

        const backTriggered = updateButtonDwellState(
          backDwellBySlot[slot],
          touchingBack,
          nowMs,
          buttonDwellMs,
          buttonDwellJitterGraceMs,
        )
        const nextTriggered = updateButtonDwellState(
          nextDwellBySlot[slot],
          touchingNext,
          nowMs,
          buttonDwellMs,
          buttonDwellJitterGraceMs,
        )

        if (backTriggered) {
          registerGameOverInputInteractionRef.current()
          if (resolvedLetterIndex > 0) {
            resolvedLetterIndex -= 1
            transitionActiveLetterIndex(resolvedLetterIndex)
          }
        }

        if (nextTriggered) {
          if (resolvedLetterIndex >= HIGH_SCORE_INITIALS_LENGTH - 1) {
            submitGameOverInitialsRef.current('submitted')
            break
          }

          resolvedLetterIndex += 1
          transitionActiveLetterIndex(resolvedLetterIndex)
          registerGameOverInputInteractionRef.current()
        }

        if (backDwellBySlot[slot].inside && !backDwellBySlot[slot].triggeredThisVisit) {
          backHoldClassActive = true
        }
        if (nextDwellBySlot[slot].inside && !nextDwellBySlot[slot].triggeredThisVisit) {
          nextHoldClassActive = true
        }
      }

      setButtonDwellClass(backButtonRef.current, backButtonHoldClassActiveRef, backHoldClassActive)
      setButtonDwellClass(nextButtonRef.current, nextButtonHoldClassActiveRef, nextHoldClassActive)
    }

    gestureRafIdRef.current = requestAnimationFrame(frame)

    return () => {
      disposed = true
      if (gestureRafIdRef.current !== null) {
        cancelAnimationFrame(gestureRafIdRef.current)
        gestureRafIdRef.current = null
      }
      resetLetterPassBySlot(letterPassBySlotRef.current)
      resetButtonDwellBySlot(backDwellBySlotRef.current)
      resetButtonDwellBySlot(nextDwellBySlotRef.current)
      setButtonDwellClass(backButtonRef.current, backButtonHoldClassActiveRef, false)
      setButtonDwellClass(nextButtonRef.current, nextButtonHoldClassActiveRef, false)
    }
  }, [
    buttonDwellJitterGraceMs,
    buttonDwellMs,
    effectiveFlowState,
    letterMinDistancePx,
    letterMinVelocityPx,
    letterCooldownMs,
    previewMode,
  ])

  if (visualFlowState === 'idle') {
    return (
      <div className="gfo-center-wrap">
        <div className="popdot-text-base popdot-style-1 popdot-shadow-8 gfo-idle-prompt gfo-vt-idle-prompt">POP BALLOON TO START!</div>
      </div>
    )
  }

  if (visualFlowState === 'game_over_input') {
    const countdown = resolveCountdownSeconds(effectiveInputEndsAtMs, nowMs)
    const remainingRatio = resolveRemainingRatio(effectiveInputEndsAtMs, nowMs, timerDurationMs)
    const timerRadius = 28
    const timerStroke = 8
    const timerCircumference = 2 * Math.PI * timerRadius
    const timerDashOffset = timerCircumference * (1 - remainingRatio)
    const isTimerVisible = effectiveInputEndsAtMs > nowMs

    return (
      <div ref={overlayRootRef} className="gfo-center-wrap">
        <div className="gfo-score-row gfo-stack-center gfo-gap-2">
          <span className="popdot-text-base popdot-style-2 popdot-shadow-4 gfo-score-label gfo-vt-score-label">TOTAL SCORE:</span>
          <span className="popdot-text-base popdot-style-1 popdot-shadow-12 gfo-score-value-entry gfo-vt-score-value">{formatScore(displayGameOverScore)}</span>
        </div>

        <div className="gfo-high-score-entry-row gfo-stack-center gfo-gap-2">
          <span className="popdot-text-base popdot-style-2 popdot-shadow-4 gfo-high-score-entry-label gfo-vt-entry-label">HIGH SCORE ENTRY:</span>
          <div className="gfo-high-score-entry gfo-row-center">
            <span
              ref={(node) => { letterSlotRefs.current[0] = node }}
              className={[
                'popdot-text-base',
                'popdot-style-1',
                'popdot-shadow-16',
                'gfo-high-score-entry-letter',
                'gfo-vt-entry-letter-0',
                activeLetterIndex === 0 ? 'gfo-high-score-entry-letter-active' : '',
              ].filter(Boolean).join(' ')}
            >
              {letter0}
            </span>
            <span
              ref={(node) => { letterSlotRefs.current[1] = node }}
              className={[
                'popdot-text-base',
                'popdot-style-1',
                'popdot-shadow-16',
                'gfo-high-score-entry-letter',
                'gfo-vt-entry-letter-1',
                activeLetterIndex === 1 ? 'gfo-high-score-entry-letter-active' : '',
              ].filter(Boolean).join(' ')}
            >
              {letter1}
            </span>
            <span
              ref={(node) => { letterSlotRefs.current[2] = node }}
              className={[
                'popdot-text-base',
                'popdot-style-1',
                'popdot-shadow-16',
                'gfo-high-score-entry-letter',
                'gfo-vt-entry-letter-2',
                activeLetterIndex === 2 ? 'gfo-high-score-entry-letter-active' : '',
              ].filter(Boolean).join(' ')}
            >
              {letter2}
            </span>
          </div>
        </div>

        <div className="gfo-row-center gfo-gap-2">
          <button
            ref={backButtonRef}
            disabled={backDisabled}
            className="popdot-button popdot-button-black popdot-text-base popdot-style-1 popdot-box-shadow-16 gfo-button-dwellable gfo-vt-entry-back"
            style={buttonDwellStyle}
          >
            <span className="gfo-button-dwell-label">BACK</span>
          </button>
          <button
            ref={nextButtonRef}
            className="popdot-button popdot-text-base popdot-style-1 popdot-box-shadow-16 gfo-button-dwellable gfo-entry-next-stable gfo-vt-entry-next"
            style={buttonDwellStyle}
          >
            <span className="gfo-button-dwell-label">{nextLabel}</span>
          </button>
        </div>

        {isTimerVisible ? (
          <div className="gfo-timer-wrap gfo-center-content">
            <svg width={64} height={64} viewBox="0 0 64 64" className="gfo-timer-svg">
              <circle
                cx="32"
                cy="32"
                r={timerRadius}
                fill="none"
                className="gfo-timer-track"
                stroke={SETTINGS.colors.shadow}
                strokeWidth={timerStroke}
              />
              <circle
                cx="32"
                cy="32"
                r={timerRadius}
                fill="none"
                className="gfo-timer-progress"
                stroke="#ffffff"
                strokeWidth={timerStroke}
                strokeDasharray={timerCircumference}
                strokeDashoffset={timerDashOffset}
                strokeLinecap="round"
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div className="popdot-text-base popdot-style-2 popdot-shadow-4 gfo-timer-label gfo-center-content">{countdown}</div>
          </div>
        ) : null}
      </div>
    )
  }

  if (visualFlowState === 'game_over_travel') {
    return (
      <div className="gfo-center-wrap">
        <div className="gfo-game-over-row gfo-stack-center gfo-gap-1_5">
          <div className="popdot-text-base popdot-style-1 popdot-shadow-16 gfo-game-over-title gfo-vt-game-over-title">GAME OVER</div>
        </div>
        <div className="gfo-score-row gfo-stack-center gfo-gap-1_5">
          <span className="popdot-text-base popdot-style-2 popdot-shadow-4 gfo-score-label gfo-vt-score-label">TOTAL SCORE:</span>
          <span className="popdot-text-base popdot-style-1 popdot-shadow-16 gfo-score-value gfo-vt-score-value">{formatScore(displayGameOverScore)}</span>
        </div>
      </div>
    )
  }

  return null
}
