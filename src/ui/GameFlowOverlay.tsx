import { useEffect, useState } from 'react'
import { useGameplayStore } from '@/gameplay/gameplayStore'

function resolveCountdownSeconds(endsAtMs: number, nowMs: number): number {
  if (!(endsAtMs > 0)) return 0
  const remainingMs = endsAtMs - nowMs
  if (remainingMs <= 0) return 0
  return Math.ceil(remainingMs / 1000)
}

export function GameFlowOverlay() {
  const flowState = useGameplayStore((state) => state.flowState)
  const gameOverInputEndsAtMs = useGameplayStore((state) => state.gameOverInputEndsAtMs)
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
    return (
      <div style={styles.centerWrap}>
        <div style={styles.highScoreTitle}>HIGH SCORE</div>
        <div style={styles.countdown}>{countdown}</div>
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
} as const
