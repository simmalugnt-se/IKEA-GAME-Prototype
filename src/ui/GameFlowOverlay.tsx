import { useEffect, useRef, useState } from 'react'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'
import { useSettingsVersion } from '@/settings/settingsStore'
import { formatScore } from '@/ui/scoreFormat'
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

type GameOverPreviewMode = 'off' | 'state1' | 'state2'

export function GameFlowOverlay() {
  useSettingsVersion()
  const flowState = useGameplayStore((state) => state.flowState)
  const debugEnabled = SETTINGS.debug.enabled === true
  const gameOverInputEndsAtMs = useGameplayStore((state) => state.gameOverInputEndsAtMs)
  const lastRunScore = useGameplayStore((state) => state.lastRunScore)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [displayGameOverScore, setDisplayGameOverScore] = useState(0)
  const scoreTickRafIdRef = useRef<number | null>(null)
  const scoreTickStartMsRef = useRef<number | null>(null)
  const scoreTickTargetRef = useRef(0)
  const previousIsGameOverViewRef = useRef(false)
  const previousPreviewModeRef = useRef<GameOverPreviewMode>('off')
  const previousScoreTargetRef = useRef(0)

  // TEMP_GAME_OVER_PREVIEW_START
  const [previewMode, setPreviewMode] = useState<GameOverPreviewMode>('off')
  const [previewInputEndsAtMs, setPreviewInputEndsAtMs] = useState(0)
  // TEMP_GAME_OVER_PREVIEW_END

  const effectiveFlowState =
    previewMode === 'state1'
      ? 'game_over_travel'
      : previewMode === 'state2'
        ? 'game_over_input'
        : flowState
  const effectiveInputEndsAtMs = previewMode === 'state2' ? previewInputEndsAtMs : gameOverInputEndsAtMs
  const isGameOverView = effectiveFlowState === 'game_over_travel' || effectiveFlowState === 'game_over_input'
  const resolvedScoreTarget = Math.max(
    0,
    Math.trunc(previewMode === 'off' ? lastRunScore : GAME_OVER_PREVIEW_SCORE),
  )

  // TEMP_GAME_OVER_PREVIEW_START
  useEffect(() => {
    if (!debugEnabled) {
      setPreviewMode('off')
      setPreviewInputEndsAtMs(0)
      return
    }

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
        setPreviewMode('state1')
        setPreviewInputEndsAtMs(0)
        return
      }

      if (event.code === 'Digit9') {
        event.preventDefault()
        setPreviewMode('state2')
        setPreviewInputEndsAtMs(Date.now() + Math.max(1, SETTINGS.gameplay.flow.gameOverInputDurationMs))
        return
      }

      if (event.code === 'Digit0') {
        event.preventDefault()
        setPreviewMode('off')
        setPreviewInputEndsAtMs(0)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [debugEnabled])

  useEffect(() => {
    if (previewMode !== 'state2') return
    if (previewInputEndsAtMs > Date.now()) return
    setPreviewInputEndsAtMs(Date.now() + Math.max(1, SETTINGS.gameplay.flow.gameOverInputDurationMs))
  }, [previewMode, previewInputEndsAtMs])
  // TEMP_GAME_OVER_PREVIEW_END

  useEffect(() => {
    if (effectiveFlowState !== 'game_over_input') return
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
    const previewModeChanged = previousPreviewModeRef.current !== previewMode
    const scoreTargetChanged = previousScoreTargetRef.current !== resolvedScoreTarget

    previousIsGameOverViewRef.current = isGameOverView
    previousPreviewModeRef.current = previewMode
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

    if (!enteredGameOverView && !previewModeChanged && !scoreTargetChanged) return

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
      const easedT = 1 - Math.pow(1 - linearT, 3) // easeOutCubic
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
  }, [isGameOverView, previewMode, resolvedScoreTarget])

  useEffect(() => {
    return () => {
      if (scoreTickRafIdRef.current !== null) {
        cancelAnimationFrame(scoreTickRafIdRef.current)
        scoreTickRafIdRef.current = null
      }
    }
  }, [])

  if (effectiveFlowState === 'idle') {
    return (
      <div className="gfo-center-wrap">
        <div className="popdot-text-base popdot-style-1 popdot-shadow-8 gfo-idle-prompt">POP BALLOON TO START!</div>
      </div>
    )
  }

  if (effectiveFlowState === 'game_over_input') {
    const countdown = resolveCountdownSeconds(effectiveInputEndsAtMs, nowMs)
    const timerDurationMs = Math.max(1, SETTINGS.gameplay.flow.gameOverInputDurationMs)
    const remainingRatio = resolveRemainingRatio(effectiveInputEndsAtMs, nowMs, timerDurationMs)
    const timerRadius = 28
    const timerStroke = 8
    const timerCircumference = 2 * Math.PI * timerRadius
    const timerDashOffset = timerCircumference * (1 - remainingRatio)

    return (
      <div className="gfo-center-wrap">
        <div className="gfo-score-row gfo-stack-center gfo-gap-2">
          <span className="popdot-text-base popdot-style-2 popdot-shadow-4 gfo-score-label">TOTAL SCORE:</span>
          <span className="popdot-text-base popdot-style-1 popdot-shadow-12 gfo-score-value-entry">{formatScore(displayGameOverScore)}</span>
        </div>
        <div className="gfo-high-score-entry-row gfo-stack-center gfo-gap-2">
          <span className="popdot-text-base popdot-style-2 popdot-shadow-4 gfo-high-score-entry-label">HIGH SCORE ENTRY:</span>
          <div className="gfo-high-score-entry gfo-row-center">
            <span className="popdot-text-base popdot-style-1 popdot-shadow-16 gfo-high-score-entry-letter gfo-high-score-entry-letter-active">A</span>
            <span className="popdot-text-base popdot-style-1 popdot-shadow-16 gfo-high-score-entry-letter">A</span>
            <span className="popdot-text-base popdot-style-1 popdot-shadow-16 gfo-high-score-entry-letter">A</span>
          </div>
        </div>
        <div className="gfo-row-center gfo-gap-2">
          <button disabled={true} className="popdot-button popdot-button-black popdot-text-base popdot-style-1 popdot-box-shadow-16">BACK</button>
          <button className="popdot-button popdot-text-base popdot-style-1 popdot-box-shadow-16">NEXT!</button>
        </div>
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
      </div>
    )
  }

  if (effectiveFlowState === 'game_over_travel') {
    return (
      <div className="gfo-center-wrap">
        <div className="gfo-game-over-row gfo-stack-center gfo-gap-1_5">
          <div className="popdot-text-base popdot-style-1 popdot-shadow-16 gfo-game-over-title">GAME OVER</div>
        </div>
        <div className="gfo-score-row gfo-stack-center gfo-gap-1_5">
          <span className="popdot-text-base popdot-style-2 popdot-shadow-4 gfo-score-label">TOTAL SCORE:</span>
          <span className="popdot-text-base popdot-style-1 popdot-shadow-16 gfo-score-value">{formatScore(displayGameOverScore)}</span>
        </div>
      </div>
    )
  }

  return null
}
