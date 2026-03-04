import { useEffect, useState } from 'react'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'

function formatScore(value: number): string {
  const truncated = Number.isFinite(value) ? Math.trunc(value) : 0
  const sign = truncated < 0 ? '-' : ''
  const digits = Math.abs(truncated).toString()
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

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

export function GameFlowOverlay() {
  const flowState = useGameplayStore((state) => state.flowState)
  const gameOverInputEndsAtMs = useGameplayStore((state) => state.gameOverInputEndsAtMs)
  const lastRunScore = useGameplayStore((state) => state.lastRunScore)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (flowState !== 'game_over_input') return
    setNowMs(Date.now())
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 100)
    return () => {
      clearInterval(timer)
    }
  }, [flowState, gameOverInputEndsAtMs])

  if (flowState === 'idle') {
    return (
      <div style={styles.centerWrap}>
        <div style={styles.idlePrompt}>POP BALLOON TO START</div>
      </div>
    )
  }

  if (flowState === 'game_over_input') {
    const countdown = resolveCountdownSeconds(gameOverInputEndsAtMs, nowMs)
    const timerDurationMs = Math.max(1, SETTINGS.gameplay.flow.gameOverInputDurationMs)
    const remainingRatio = resolveRemainingRatio(gameOverInputEndsAtMs, nowMs, timerDurationMs)
    const timerRadius = 34
    const timerStroke = 4
    const timerCircumference = 2 * Math.PI * timerRadius
    const timerDashOffset = timerCircumference * (1 - remainingRatio)

    return (
      <div style={styles.centerWrap}>
        <div style={styles.gameOverTitle}>GAME OVER</div>
        <div style={styles.scoreRow}>
          <span style={styles.scoreLabel}>SCORE</span>
          <span style={styles.scoreValue}>{formatScore(lastRunScore)}</span>
        </div>
        <div style={styles.highScoreEntry}>HIGH SCORE ENTRY: AAA</div>
        <div style={styles.timerWrap}>
          <svg width={80} height={80} viewBox="0 0 80 80" style={styles.timerSvg}>
            <circle
              cx="40"
              cy="40"
              r={timerRadius}
              fill="none"
              stroke={SETTINGS.colors.shadow}
              strokeWidth={timerStroke}
              opacity={0.85}
            />
            <circle
              cx="40"
              cy="40"
              r={timerRadius}
              fill="none"
              stroke="#ffffff"
              strokeWidth={timerStroke}
              strokeDasharray={timerCircumference}
              strokeDashoffset={timerDashOffset}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
            />
          </svg>
          <div style={styles.timerLabel}>{countdown}</div>
        </div>
      </div>
    )
  }

  if (flowState === 'game_over_travel') {
    return (
      <div style={styles.centerWrap}>
        <div style={styles.gameOverTitle}>GAME OVER</div>
        <div style={styles.scoreRow}>
          <span style={styles.scoreLabel}>SCORE</span>
          <span style={styles.scoreValue}>{formatScore(lastRunScore)}</span>
        </div>
      </div>
    )
  }

  return null
}

const styles = {
  centerWrap: {
    position: 'absolute',
    inset: 0,
    zIndex: 31,
    pointerEvents: 'none' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    color: '#ffffff',
    textAlign: 'center' as const,
    fontFamily: '"Instrument Sans", sans-serif',
  },
  idlePrompt: {
    fontSize: '1.2rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    fontWeight: 600,
    textShadow: '0 0 16px rgba(0, 0, 0, 0.45)',
  },
  highScoreTitle: {
    fontSize: '1.5rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    fontWeight: 700,
    textShadow: '0 0 18px rgba(0, 0, 0, 0.5)',
  },
  countdown: {
    fontSize: '3.2rem',
    fontWeight: 800,
    letterSpacing: '0.08em',
    lineHeight: 1,
    textShadow: '0 0 22px rgba(0, 0, 0, 0.55)',
  },
  gameOverTitle: {
    fontSize: '2.2rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    fontWeight: 800,
    textShadow: '0 0 22px rgba(0, 0, 0, 0.6)',
    lineHeight: 1,
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.8rem',
    marginTop: '0.15rem',
  },
  scoreLabel: {
    fontSize: '0.85rem',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    opacity: 0.9,
    fontWeight: 700,
  },
  scoreValue: {
    fontSize: '2rem',
    lineHeight: 1,
    fontWeight: 700,
    letterSpacing: '0.03em',
    textShadow: '0 0 18px rgba(0, 0, 0, 0.55)',
  },
  highScoreEntry: {
    marginTop: '0.45rem',
    fontSize: '1rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    fontWeight: 700,
    textShadow: '0 0 14px rgba(0, 0, 0, 0.5)',
  },
  timerWrap: {
    marginTop: '0.35rem',
    width: '80px',
    height: '80px',
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerSvg: {
    width: '80px',
    height: '80px',
    display: 'block',
  },
  timerLabel: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.6rem',
    lineHeight: 1,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textShadow: '0 0 16px rgba(0, 0, 0, 0.55)',
  },
} as const
