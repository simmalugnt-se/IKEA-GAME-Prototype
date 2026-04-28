import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { AUDIO_SETTINGS } from '@/audio/AudioSettings'
import { isAudioUnlocked, subscribeAudioUnlocked } from '@/audio/SoundManager'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'
import { useSettingsVersion } from '@/settings/settingsStore'
import { formatScore } from '@/ui/scoreFormat'
import './ScoreHud.css'

const LIFE_LOSS_BLINK_DURATION_MS = 820
const SCORE_LERP_RESPONSE = 16
const SCORE_LERP_MAX_DT_SEC = 0.05
const HEART_LIGATURE = '#heart'
const CLOCK_LIGATURE = '#CLOCK'
const TIME_TICK_INTERVAL_MS = 100

function formatClockValue(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function ScoreHud() {
  useSettingsVersion()
  const uiWhite = '#fff'
  const score = useGameplayStore((state) => state.score)
  const [audioUnlocked, setAudioUnlocked] = useState(() => isAudioUnlocked())
  const [blinkingLifeSlots, setBlinkingLifeSlots] = useState<number[]>([])
  const [displayScore, setDisplayScore] = useState(() => score)
  const lives = useGameplayStore((state) => state.lives)
  const paused = useGameplayStore((state) => state.paused)
  const runMode = useGameplayStore((state) => state.runMode)
  const runTimeEndsAtMs = useGameplayStore((state) => state.runTimeEndsAtMs)
  const runTimePausedRemainingMs = useGameplayStore((state) => state.runTimePausedRemainingMs)
  const runTimePauseFromMs = useGameplayStore((state) => state.runTimePauseFromMs)
  const runTimePauseToMs = useGameplayStore((state) => state.runTimePauseToMs)
  const runTimePauseStartedAtMs = useGameplayStore((state) => state.runTimePauseStartedAtMs)
  const runTimePauseEndsAtMs = useGameplayStore((state) => state.runTimePauseEndsAtMs)
  const flowState = useGameplayStore((state) => state.flowState)
  const maxLives = Math.max(0, Math.trunc(SETTINGS.gameplay.lives.initial))
  const secondaryColor = SETTINGS.colors.outline
  const margin = '1.5rem'
  const isTopHudHidden = flowState !== 'run'
  const topHudTransform = isTopHudHidden ? 'translateY(calc(-100% - var(--edgeDistance)))' : 'translateY(0%)'
  const isAudioOn = AUDIO_SETTINGS.enabled === true && audioUnlocked
  const previousLivesRef = useRef(lives)
  const blinkTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const displayScoreRef = useRef(score)
  const targetScoreRef = useRef(score)
  const scoreRafIdRef = useRef<number | null>(null)
  const lastScoreFrameTimeRef = useRef<number | null>(null)
  const timeTickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeTickRafIdRef = useRef<number | null>(null)
  const [timeNowMs, setTimeNowMs] = useState(() => Date.now())
  const scorePanelStyle: CSSProperties = {
    transform: topHudTransform,
    ['--hud-outline' as any]: secondaryColor,
    ['--hud-white' as any]: uiWhite,
  }
  const livesPanelStyle: CSSProperties = {
    transform: topHudTransform,
    ['--hud-outline' as any]: secondaryColor,
    ['--hud-white' as any]: uiWhite,
    ['--life-loss-dark' as any]: secondaryColor,
  }

  useEffect(() => {
    return subscribeAudioUnlocked(() => {
      setAudioUnlocked(true)
    })
  }, [])

  useEffect(() => {
    targetScoreRef.current = score
    const currentDisplay = displayScoreRef.current

    if (score <= currentDisplay) {
      if (scoreRafIdRef.current !== null) {
        cancelAnimationFrame(scoreRafIdRef.current)
        scoreRafIdRef.current = null
      }
      lastScoreFrameTimeRef.current = null
      if (score !== currentDisplay) {
        displayScoreRef.current = score
        setDisplayScore(score)
      }
      return
    }

    if (scoreRafIdRef.current !== null) return

    const frame = (now: number) => {
      const previousFrameTime = lastScoreFrameTimeRef.current
      if (previousFrameTime === null) {
        lastScoreFrameTimeRef.current = now
        scoreRafIdRef.current = requestAnimationFrame(frame)
        return
      }

      const rawDt = (now - previousFrameTime) / 1000
      const dtSec = Math.max(0, Math.min(SCORE_LERP_MAX_DT_SEC, rawDt))
      lastScoreFrameTimeRef.current = now

      const current = displayScoreRef.current
      const target = targetScoreRef.current
      const diff = target - current
      if (diff <= 0) {
        scoreRafIdRef.current = null
        lastScoreFrameTimeRef.current = null
        return
      }

      const alpha = 1 - Math.exp(-SCORE_LERP_RESPONSE * dtSec)
      const step = Math.max(1, Math.floor(diff * alpha))
      const next = Math.min(target, current + step)

      if (next !== current) {
        displayScoreRef.current = next
        setDisplayScore(next)
      }

      if (next >= target) {
        scoreRafIdRef.current = null
        lastScoreFrameTimeRef.current = null
        return
      }

      scoreRafIdRef.current = requestAnimationFrame(frame)
    }

    lastScoreFrameTimeRef.current = null
    scoreRafIdRef.current = requestAnimationFrame(frame)
  }, [score])

  useEffect(() => {
    const previousLives = previousLivesRef.current
    previousLivesRef.current = lives
    if (lives >= previousLives) return

    const clampedLives = Math.max(0, Math.min(maxLives, lives))
    const clampedPreviousLives = Math.max(0, Math.min(maxLives, previousLives))
    const lostStartSlot = clampedLives
    const lostEndSlot = clampedPreviousLives - 1
    if (lostEndSlot < lostStartSlot) return

    const lostSlots: number[] = []
    for (let slot = lostStartSlot; slot <= lostEndSlot; slot += 1) {
      lostSlots.push(slot)
    }
    if (lostSlots.length === 0) return

    setBlinkingLifeSlots((prev) => {
      if (prev.length === 0) return lostSlots
      const next = prev.slice()
      for (let i = 0; i < lostSlots.length; i += 1) {
        const slot = lostSlots[i]
        if (next.includes(slot)) continue
        next.push(slot)
      }
      return next
    })

    for (let i = 0; i < lostSlots.length; i += 1) {
      const slot = lostSlots[i]
      const existingTimer = blinkTimersRef.current.get(slot)
      if (existingTimer !== undefined) {
        clearTimeout(existingTimer)
      }
      const timer = setTimeout(() => {
        setBlinkingLifeSlots((prev) => prev.filter((value) => value !== slot))
        blinkTimersRef.current.delete(slot)
      }, LIFE_LOSS_BLINK_DURATION_MS)
      blinkTimersRef.current.set(slot, timer)
    }
  }, [lives, maxLives])

  useEffect(() => {
    const clearTicker = () => {
      if (timeTickTimeoutRef.current !== null) {
        clearTimeout(timeTickTimeoutRef.current)
        timeTickTimeoutRef.current = null
      }
      if (timeTickRafIdRef.current !== null) {
        cancelAnimationFrame(timeTickRafIdRef.current)
        timeTickRafIdRef.current = null
      }
    }

    clearTicker()
    if (flowState !== 'run' || runMode !== 'time' || paused) return clearTicker

    let disposed = false
    const tick = () => {
      if (disposed) return
      const latestState = useGameplayStore.getState()
      if (latestState.flowState !== 'run' || latestState.runMode !== 'time' || latestState.paused) return

      const nowMs = Date.now()
      setTimeNowMs(nowMs)

      if (latestState.runTimePauseEndsAtMs > nowMs) {
        timeTickRafIdRef.current = requestAnimationFrame(tick)
        return
      }

      timeTickTimeoutRef.current = setTimeout(tick, TIME_TICK_INTERVAL_MS)
    }

    tick()
    return () => {
      disposed = true
      clearTicker()
    }
  }, [flowState, paused, runMode])

  useEffect(() => {
    return () => {
      blinkTimersRef.current.forEach((timer) => clearTimeout(timer))
      blinkTimersRef.current.clear()
      if (scoreRafIdRef.current !== null) {
        cancelAnimationFrame(scoreRafIdRef.current)
        scoreRafIdRef.current = null
      }
      if (timeTickTimeoutRef.current !== null) {
        clearTimeout(timeTickTimeoutRef.current)
        timeTickTimeoutRef.current = null
      }
      if (timeTickRafIdRef.current !== null) {
        cancelAnimationFrame(timeTickRafIdRef.current)
        timeTickRafIdRef.current = null
      }
      lastScoreFrameTimeRef.current = null
    }
  }, [])

  const blinkingLifeSlotSet = new Set(blinkingLifeSlots)
  let displayRemainingTimeMs = 0
  if (runMode === 'time' && flowState === 'run') {
    if (paused) {
      displayRemainingTimeMs = Math.max(0, Math.trunc(runTimePausedRemainingMs))
    } else {
      const isPauseActive = (
        runTimePauseEndsAtMs > timeNowMs
        && runTimePauseEndsAtMs > runTimePauseStartedAtMs
      )
      if (isPauseActive) {
        const progress = (timeNowMs - runTimePauseStartedAtMs) / (runTimePauseEndsAtMs - runTimePauseStartedAtMs)
        const clampedProgress = Math.max(0, Math.min(1, progress))
        displayRemainingTimeMs = Math.max(
          0,
          Math.round(runTimePauseFromMs + (runTimePauseToMs - runTimePauseFromMs) * clampedProgress),
        )
      } else {
        displayRemainingTimeMs = Math.max(0, runTimeEndsAtMs - timeNowMs)
      }
    }
  }
  const pulseSlowStartMs = Math.max(0, Math.trunc(SETTINGS.gameplay.run.pulseSlowStartMs))
  const pulseFastStartMs = Math.max(0, Math.min(pulseSlowStartMs, Math.trunc(SETTINGS.gameplay.run.pulseFastStartMs)))
  const timePulseFast = runMode === 'time' && flowState === 'run' && !paused && displayRemainingTimeMs > 0 && displayRemainingTimeMs <= pulseFastStartMs
  const timePulseSlow = (
    runMode === 'time'
    && flowState === 'run'
    && !paused
    && displayRemainingTimeMs > 0
    && displayRemainingTimeMs <= pulseSlowStartMs
    && !timePulseFast
  )

  return (
    <>
      <div
        className="score-hud-panel score-hud-panel--score popdot-text-base popdot-style-3"
        style={scorePanelStyle}
      >
        <span className="score-hud-chip popdot-text-base popdot-style-4 score-hud-chip--label">Score</span>
        <span className="score-hud-chip popdot-text-base popdot-style-3 score-hud-chip--score-value">{formatScore(displayScore)}</span>
      </div>

      {!isAudioOn && (
        <div className="score-hud-audio-hint">
          <span className="score-hud-audio-hint__text popdot-text-base popdot-style-6 popdot-shadow-2">
            Click anywhere to enable the soundtrack and SFX
          </span>
          <span className="score-hud-audio-hint__icon popdot-text-base popdot-style-3 popdot-shadow-2">#SOUNDOFF</span>
        </div>
      )}

      <div
        className="score-hud-panel score-hud-panel--lives popdot-text-base popdot-style-3"
        style={livesPanelStyle}
      >
        <span className="score-hud-chip popdot-text-base popdot-style-4 score-hud-chip--label">
          {runMode === 'time' ? CLOCK_LIGATURE : 'Lives'}
        </span>
        {runMode === 'time' ? (
          <span
            className={[
              'score-hud-chip',
              'popdot-text-base',
              'popdot-style-3',
              'score-hud-chip--time-value',
              timePulseFast ? 'score-hud-time--pulse-fast' : '',
              timePulseSlow ? 'score-hud-time--pulse-slow' : '',
            ].join(' ').trim()}
          >
            {formatClockValue(displayRemainingTimeMs)}
          </span>
        ) : (
          <span className="score-hud-chip popdot-text-base popdot-style-3 score-hud-chip--lives-value">
            {Array.from({ length: maxLives }, (_, slotIndex) => {
              const isActiveLife = slotIndex < lives
              if (isActiveLife) {
                return (
                  <span
                    key={`life-slot-${slotIndex}`}
                    className="score-hud-life popdot-text-base popdot-style-3"
                  >
                    {HEART_LIGATURE}
                  </span>
                )
              }
              const shouldBlink = blinkingLifeSlotSet.has(slotIndex)
              return (
                <span
                  key={`life-slot-${slotIndex}`}
                  className={[
                    'score-hud-life',
                    'popdot-text-base',
                    'popdot-style-3',
                    'score-hud-life--lost',
                    shouldBlink ? 'life-loss-blink' : '',
                  ].join(' ').trim()}
                >
                  {HEART_LIGATURE}
                </span>
              )
            })}
          </span>
        )}
      </div>
    </>
  )
}
