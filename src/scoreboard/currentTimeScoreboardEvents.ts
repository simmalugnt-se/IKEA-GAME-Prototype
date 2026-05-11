import { useGameplayStore, type GameFlowState } from '@/gameplay/gameplayStore'
import { getRunId } from '@/scoreboard/runId'
import { sendVolatileScoreboardEvent } from '@/scoreboard/scoreboardSender'
import type { GameRunMode } from '@/settings/GameSettings.types'

const NORMAL_TICK_MS = 100

type TimerSnapshot = {
  flowState: GameFlowState
  runMode: GameRunMode
  paused: boolean
  runTimeEndsAtMs: number
  runTimePausedRemainingMs: number
  runTimePauseFromMs: number
  runTimePauseToMs: number
  runTimePauseStartedAtMs: number
  runTimePauseEndsAtMs: number
}

function selectTimerSnapshot(): TimerSnapshot {
  const state = useGameplayStore.getState()
  return {
    flowState: state.flowState,
    runMode: state.runMode,
    paused: state.paused,
    runTimeEndsAtMs: state.runTimeEndsAtMs,
    runTimePausedRemainingMs: state.runTimePausedRemainingMs,
    runTimePauseFromMs: state.runTimePauseFromMs,
    runTimePauseToMs: state.runTimePauseToMs,
    runTimePauseStartedAtMs: state.runTimePauseStartedAtMs,
    runTimePauseEndsAtMs: state.runTimePauseEndsAtMs,
  }
}

function shouldRunTimer(snapshot: TimerSnapshot): boolean {
  return snapshot.flowState === 'run' && snapshot.runMode === 'time' && !snapshot.paused
}

function resolveDisplayRemainingMs(snapshot: TimerSnapshot, nowMs: number): number {
  if (snapshot.paused) return Math.max(0, Math.trunc(snapshot.runTimePausedRemainingMs))

  const isPauseActive = (
    snapshot.runTimePauseEndsAtMs > nowMs
    && snapshot.runTimePauseEndsAtMs > snapshot.runTimePauseStartedAtMs
  )
  if (isPauseActive) {
    const progress = (nowMs - snapshot.runTimePauseStartedAtMs)
      / (snapshot.runTimePauseEndsAtMs - snapshot.runTimePauseStartedAtMs)
    const clampedProgress = Math.max(0, Math.min(1, progress))
    return Math.max(
      0,
      Math.round(snapshot.runTimePauseFromMs + (snapshot.runTimePauseToMs - snapshot.runTimePauseFromMs) * clampedProgress),
    )
  }

  return Math.max(0, snapshot.runTimeEndsAtMs - nowMs)
}

function resolveDisplaySeconds(snapshot: TimerSnapshot, nowMs: number): number {
  return Math.max(0, Math.ceil(resolveDisplayRemainingMs(snapshot, nowMs) / 1000))
}

function formatDisplaySeconds(totalSeconds: number): string {
  const normalized = Math.max(0, Math.trunc(totalSeconds))
  const minutes = Math.floor(normalized / 60)
  const seconds = normalized % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function isTimeBonusLerpActive(snapshot: TimerSnapshot, nowMs: number): boolean {
  return snapshot.runTimePauseEndsAtMs > nowMs && snapshot.runTimePauseEndsAtMs > snapshot.runTimePauseStartedAtMs
}

export function initCurrentTimeScoreboardEvents(): () => void {
  let disposed = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let rafId: number | null = null
  let active = false
  let lastSentSeconds: number | null = null

  const clearScheduled = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  const sendIfChanged = (seconds: number) => {
    if (seconds === lastSentSeconds) return
    lastSentSeconds = seconds
    sendVolatileScoreboardEvent({
      type: 'current_time_updated',
      timestamp: Date.now(),
      runId: getRunId(),
      currentTime: formatDisplaySeconds(seconds),
    })
  }

  const stop = () => {
    active = false
    lastSentSeconds = null
    clearScheduled()
  }

  const tick = () => {
    if (disposed || !active) return

    const snapshot = selectTimerSnapshot()
    if (!shouldRunTimer(snapshot)) {
      stop()
      return
    }

    const nowMs = Date.now()
    sendIfChanged(resolveDisplaySeconds(snapshot, nowMs))

    if (isTimeBonusLerpActive(snapshot, nowMs)) {
      rafId = requestAnimationFrame(tick)
      return
    }

    timeoutId = setTimeout(tick, NORMAL_TICK_MS)
  }

  const start = () => {
    clearScheduled()
    active = true
    tick()
  }

  const sync = () => {
    if (disposed) return
    const snapshot = selectTimerSnapshot()
    if (!shouldRunTimer(snapshot)) {
      if (active) stop()
      return
    }
    if (!active) {
      start()
      return
    }
    if (timeoutId !== null && isTimeBonusLerpActive(snapshot, Date.now())) {
      clearScheduled()
      tick()
    }
  }

  const unsubscribe = useGameplayStore.subscribe(sync)
  sync()

  return () => {
    disposed = true
    unsubscribe()
    stop()
  }
}
