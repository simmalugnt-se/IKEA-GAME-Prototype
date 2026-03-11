import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AUDIO_SETTINGS } from '@/audio/AudioSettings'
import { isAudioUnlocked, subscribeAudioUnlocked } from '@/audio/SoundManager'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'
import { useSettingsVersion } from '@/settings/settingsStore'
import { POPDOT_SHADOW_STYLE, POPDOT_STYLE_1, POPDOT_STYLE_2, POPDOT_STYLE_3, POPDOT_STYLE_4 } from '@/ui/hudTypography'

function formatScore(value: number): string {
  const truncated = Number.isFinite(value) ? Math.trunc(value) : 0
  const sign = truncated < 0 ? '-' : ''
  const digits = Math.abs(truncated).toString()
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

const LIFE_LOSS_BLINK_DURATION_MS = 820
const SCORE_LERP_RESPONSE = 16
const SCORE_LERP_MAX_DT_SEC = 0.05
const HEART_LIGATURE = '#heart'

export function ScoreHud() {
  useSettingsVersion()
  const uiWhite = '#fff'
  const score = useGameplayStore((state) => state.score)
  const [audioUnlocked, setAudioUnlocked] = useState(() => isAudioUnlocked())
  const [blinkingLifeSlots, setBlinkingLifeSlots] = useState<number[]>([])
  const [displayScore, setDisplayScore] = useState(() => score)
  const lastRunScore = useGameplayStore((state) => state.lastRunScore)
  const sessionHighScore = useGameplayStore((state) => state.sessionHighScore)
  const lives = useGameplayStore((state) => state.lives)
  const flowState = useGameplayStore((state) => state.flowState)
  const maxLives = Math.max(0, Math.trunc(SETTINGS.gameplay.lives.initial))
  const secondaryColor = SETTINGS.colors.outline
  const fontSize = '2rem'
  const margin = '1.5rem'
  const isTopHudHidden = flowState !== 'run'
  const topHudTransform = isTopHudHidden ? 'translateY(calc(-100% - ' + margin + '))' : 'translateY(0%)'
  const topHudOpacity = isTopHudHidden ? 0 : 1
  const isAudioOn = AUDIO_SETTINGS.enabled === true && audioUnlocked
  const previousLivesRef = useRef(lives)
  const blinkTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const displayScoreRef = useRef(score)
  const targetScoreRef = useRef(score)
  const scoreRafIdRef = useRef<number | null>(null)
  const lastScoreFrameTimeRef = useRef<number | null>(null)

  const hudTextStyle: CSSProperties = {
    ...POPDOT_STYLE_3,
    fontSize,
    textTransform: 'uppercase',
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
    return () => {
      blinkTimersRef.current.forEach((timer) => clearTimeout(timer))
      blinkTimersRef.current.clear()
      if (scoreRafIdRef.current !== null) {
        cancelAnimationFrame(scoreRafIdRef.current)
        scoreRafIdRef.current = null
      }
      lastScoreFrameTimeRef.current = null
    }
  }, [])

  const blinkingLifeSlotSet = new Set(blinkingLifeSlots)

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
          gap: '.5rem',
          padding: '0.25rem',
          borderRadius: '0.75rem',
          backgroundColor: secondaryColor,
          color: uiWhite,
          transform: topHudTransform,
          opacity: topHudOpacity,
          transition: 'transform 2s cubic-bezier(0.6, 0, 0, 1), opacity 2s cubic-bezier(0.6, 0, 0, 1)',
        }}
      >
        <span style={{ ...POPDOT_STYLE_4, display: 'flex', padding: '0.25rem 0.5rem', borderRadius: '.5rem' }}>Score</span>
        <span style={{ ...POPDOT_STYLE_3, display: 'flex', padding: '0.25rem 0.5rem', borderRadius: '.5rem', backgroundColor: uiWhite, color: secondaryColor }}>{formatScore(displayScore)}</span>
      </div >

      {!isAudioOn && (
        <div
          style={{
            position: 'absolute',
            bottom: margin,
            right: margin,
            zIndex: 30,
            pointerEvents: 'none',
            ...hudTextStyle,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '1ch',
            flexWrap: 'wrap',
            color: uiWhite,
            textAlign: 'right',
            textWrap: 'balance',
          }}
        >
          <span style={{ ...POPDOT_STYLE_3, ...POPDOT_SHADOW_STYLE, fontSize: '0.375em', lineHeight: '1em', maxWidth: '30ch' }}>
            Click anywhere to enable the soundtrack and SFX
          </span>
          <span
            style={{
              fontFamily: '"Material Symbols Outlined"',
              fontWeight: 400,
              fontStyle: 'normal',
              fontSize: '0.75em',
              lineHeight: '1em',
              letterSpacing: 'normal',
              textTransform: 'none',
              userSelect: 'none',
            }}
          >
            volume_off
          </span>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: margin,
          right: margin,
          zIndex: 30,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '.5rem',
          padding: '0.25rem',
          borderRadius: '0.75rem',
          backgroundColor: '#141414',
          color: uiWhite,
          ...hudTextStyle,
          transform: topHudTransform,
          opacity: topHudOpacity,
          transition: 'transform 2s .15s cubic-bezier(0.6, 0, 0, 1), opacity 2s .15s cubic-bezier(0.6, 0, 0, 1)',
        }}
      >
        <span style={{ ...POPDOT_STYLE_4, display: 'flex', padding: '0.25rem 0.5rem', borderRadius: '.5rem' }}>Lives</span>
        <span style={{ ...POPDOT_STYLE_3, display: 'flex', padding: '0.25rem 0.5rem', borderRadius: '.5rem', backgroundColor: '#ffffff', color: '#141414' }}>
          {Array.from({ length: maxLives }, (_, slotIndex) => {
            const isActiveLife = slotIndex < lives
            if (isActiveLife) {
              return (
                <span
                  key={`life-slot-${slotIndex}`}
                  style={{
                    ...POPDOT_STYLE_3,
                    color: secondaryColor,
                    fontSize: fontSize,
                    textTransform: 'none',
                  }}
                >
                  {HEART_LIGATURE}
                </span>
              )
            }
            const shouldBlink = blinkingLifeSlotSet.has(slotIndex)
            return (
              <span
                key={`life-slot-${slotIndex}`}
                className={shouldBlink ? 'life-loss-blink' : undefined}
                style={{
                  ...POPDOT_STYLE_3,
                  color: secondaryColor,
                  opacity: 0.25,
                  fontSize: fontSize,
                  textTransform: 'none',
                  ['--life-loss-dark' as any]: secondaryColor,
                } as CSSProperties}
              >
                {HEART_LIGATURE}
              </span>
            )
          })}
        </span>
      </div>
    </>
  )
}
