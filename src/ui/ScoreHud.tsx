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

export function ScoreHud() {
  useSettingsVersion()
  const uiWhite = '#fff'
  const score = useGameplayStore((state) => state.score)
  const [audioUnlocked, setAudioUnlocked] = useState(() => isAudioUnlocked())
  const [blinkingLifeSlots, setBlinkingLifeSlots] = useState<number[]>([])
  const [displayScore, setDisplayScore] = useState(() => score)
  const lives = useGameplayStore((state) => state.lives)
  const flowState = useGameplayStore((state) => state.flowState)
  const maxLives = Math.max(0, Math.trunc(SETTINGS.gameplay.lives.initial))
  const secondaryColor = SETTINGS.colors.outline
  const margin = '1.5rem'
  const isTopHudHidden = flowState !== 'run'
  const topHudTransform = isTopHudHidden ? 'translateY(calc(-100% - ' + margin + '))' : 'translateY(0%)'
  const isAudioOn = AUDIO_SETTINGS.enabled === true && audioUnlocked
  const previousLivesRef = useRef(lives)
  const blinkTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const displayScoreRef = useRef(score)
  const targetScoreRef = useRef(score)
  const scoreRafIdRef = useRef<number | null>(null)
  const lastScoreFrameTimeRef = useRef<number | null>(null)
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
        className="score-hud-panel score-hud-panel--score popdot-text-base popdot-style-3"
        style={scorePanelStyle}
      >
        <span className="score-hud-chip popdot-text-base popdot-style-4 score-hud-chip--label">Score</span>
        <span className="score-hud-chip popdot-text-base popdot-style-3 score-hud-chip--score-value">{formatScore(displayScore)}</span>
      </div>

      {!isAudioOn && (
        <div className="score-hud-audio-hint">
          <span className="score-hud-audio-hint__text popdot-text-base popdot-style-3 popdot-shadow-2">
            Click anywhere to enable the soundtrack and SFX
          </span>
          <span className="score-hud-audio-hint__icon">
            volume_off
          </span>
        </div>
      )}

      <div
        className="score-hud-panel score-hud-panel--lives popdot-text-base popdot-style-3"
        style={livesPanelStyle}
      >
        <span className="score-hud-chip popdot-text-base popdot-style-4 score-hud-chip--label">Lives</span>
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
      </div>
    </>
  )
}
