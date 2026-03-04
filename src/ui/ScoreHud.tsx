import type { CSSProperties } from 'react'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'

function formatScore(value: number): string {
  const truncated = Number.isFinite(value) ? Math.trunc(value) : 0
  const sign = truncated < 0 ? '-' : ''
  const digits = Math.abs(truncated).toString()
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

export function ScoreHud() {
  const uiWhite = '#fff'
  const uiWhiteAlpha = 'rgba(255, 255, 255, 0.333)'
  const score = useGameplayStore((state) => state.score)
  const lastRunScore = useGameplayStore((state) => state.lastRunScore)
  const sessionHighScore = useGameplayStore((state) => state.sessionHighScore)
  const lives = useGameplayStore((state) => state.lives)
  const flowState = useGameplayStore((state) => state.flowState)
  const maxLives = SETTINGS.gameplay.lives.initial
  const secondaryColor = SETTINGS.colors.outline
  const consumedLives = Math.max(0, maxLives - lives)
  const fontSize = '2rem'
  const margin = '1.5rem'
  const isTopHudHidden = flowState !== 'run'
  const topHudTransform = isTopHudHidden ? 'translateY(calc(-100% - ' + margin + '))' : 'translateY(0%)'
  const topHudOpacity = isTopHudHidden ? 0 : 1

  const hudTextStyle: CSSProperties = {
    fontFamily: '"Instrument Sans", sans-serif',
    fontSize,
    lineHeight: 1,
    fontWeight: '400',
    letterSpacing: '0.01em',
    textTransform: 'uppercase',
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: margin,
          left: margin,
          zIndex: 30,
          pointerEvents: 'none',
          ...hudTextStyle,
          display: 'flex',
          alignItems: 'start',
          gap: '2ch',
          maxWidth: 'min(70vw, 52ch)',
          flexWrap: 'wrap',
          color: uiWhite,
          transform: topHudTransform,
          opacity: topHudOpacity,
          transition: 'transform 2s cubic-bezier(0.6, 0, 0, 1), opacity 2s cubic-bezier(0.6, 0, 0, 1)',
        }}
      >
        <div style={{ display: 'flex', gap: '1em', minWidth: 'max(15ch, calc(100vw / 4))' }}>
          <span>Score</span>
          <span>{formatScore(score)}</span>
        </div>
        <div style={{ display: 'flex', gap: '1em', fontSize: '0.4em', fontWeight: '500', paddingTop: '0.25em', letterSpacing: '0.025em' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1em', minWidth: 'max(15ch, calc(100vw / 12))' }}>
            <span>Prev.</span>
            <span>{formatScore(lastRunScore)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1em', minWidth: 'max(15ch, calc(100vw / 12))' }}>
            <span>Best</span>
            <span>{formatScore(sessionHighScore)}</span>
          </div>
        </div>
      </div >

      <div
        style={{
          position: 'absolute',
          bottom: margin,
          right: margin,
          zIndex: 30,
          pointerEvents: 'none',
          ...hudTextStyle,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          gap: '2ch',
          maxWidth: 'min(70vw, 52ch)',
          flexWrap: 'wrap',
          color: uiWhite,
          textAlign: 'right',
          textWrap: 'balance',
          width: '10ch',
        }}
      >
        <span style={{ fontSize: '0.25em', fontWeight: '600', letterSpacing: '0.025em' }}>CMD + . (Punctuation mark) to toggle the property panel for game settings.</span>
      </div>

      <div
        style={{
          position: 'absolute',
          top: margin,
          right: margin,
          zIndex: 30,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.125em',
          ...hudTextStyle,
          transform: topHudTransform,
          opacity: topHudOpacity,
          transition: 'transform 2s .15s cubic-bezier(0.6, 0, 0, 1), opacity 2s .15s cubic-bezier(0.6, 0, 0, 1)',
        }}
      >
        {Array.from({ length: lives }, (_, index) => (
          <span
            key={`life-active-${index}`}
            className="material-icons"
            style={{
              color: uiWhite,
              fontSize: fontSize,
              lineHeight: '1em',
            }}
          >
            favorite
          </span>
        ))}
        {Array.from({ length: consumedLives }, (_, index) => (
          <span
            key={`life-consumed-${index}`}
            className="material-icons"
            style={{
              color: secondaryColor,
              fontSize: fontSize,
              lineHeight: '1em',
            }}
          >
            favorite
          </span>
        ))}
      </div>
    </>
  )
}
