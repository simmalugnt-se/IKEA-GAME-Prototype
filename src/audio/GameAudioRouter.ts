import { AUDIO_SETTINGS } from '@/audio/AudioSettings'
import type { AudioBankId } from '@/audio/AudioSettings.types'
import { hasLoadedAudioBank, playAudioBank, startLoopingAudioBank, type AudioLoopHandle } from '@/audio/SoundManager'

type ComboTriggeredGameSoundEvent = {
  type: 'combo_triggered'
  multiplier: number
}

type ComboTierGameSoundEvent = {
  type: 'combo_tier2' | 'combo_tier3' | 'combo_tier4Plus'
}

export type GameSoundEvent =
  | { type: 'balloon_pop' }
  | { type: 'payload_landed' }
  | { type: 'run_started' }
  | { type: 'idle_started' }
  | { type: 'life_lost' }
  | { type: 'run_end' }
  | { type: 'game_over' }
  | { type: 'contagion_infection' }
  | { type: 'time_bonus' }
  | { type: 'roller' }
  | { type: 'slowmo' }
  | { type: 'zero_gravity' }
  | { type: 'multi_balls' }
  | { type: 'high_score_entry' }
  | { type: 'high_score_entry_hover' }
  | { type: 'high_score_entry_lock' }
  | ComboTierGameSoundEvent
  | ComboTriggeredGameSoundEvent

export type GameSoundLoopEvent =
  | { type: 'ten_seconds_left' }

let lastSwooshTimeMs = 0

function resolveComboBankByMultiplier(multiplier: number): AudioBankId | null {
  if (!(multiplier >= 2)) return null
  if (multiplier === 2) return 'comboTier2'
  if (multiplier === 3) return 'comboTier3'
  return 'comboTier4Plus'
}

function playBankWithoutFallback(bankId: AudioBankId): void {
  if (!hasLoadedAudioBank(bankId)) {
    console.error(`[GameAudioRouter] Audio bank has no loaded files: ${bankId}`)
    return
  }
  playAudioBank(bankId)
}

export function playGameSound(event: GameSoundEvent): void {
  switch (event.type) {
    case 'balloon_pop':
      playAudioBank('pop')
      return
    case 'payload_landed':
      playAudioBank('felt')
      return
    case 'run_started':
      playAudioBank('runStarted')
      return
    case 'idle_started':
      playAudioBank('idleStarted')
      return
    case 'life_lost':
      playAudioBank('error')
      return
    case 'run_end':
      playAudioBank('gameOver')
      return
    case 'game_over':
      playAudioBank('gameOver')
      return
    case 'contagion_infection':
      playAudioBank('steel')
      return
    case 'time_bonus':
      playAudioBank('timeBonus')
      return
    case 'roller':
      playAudioBank('roller')
      return
    case 'slowmo':
      playAudioBank('slowmo')
      return
    case 'zero_gravity':
      playAudioBank('zeroGravity')
      return
    case 'multi_balls':
      playAudioBank('multiBalls')
      return
    case 'high_score_entry':
      playAudioBank('highScoreEntry')
      return
    case 'high_score_entry_hover':
      playAudioBank('highScoreEntryHover')
      return
    case 'high_score_entry_lock':
      playAudioBank('highScoreEntryLock')
      return
    case 'combo_tier2':
      playBankWithoutFallback('comboTier2')
      return
    case 'combo_tier3':
      playBankWithoutFallback('comboTier3')
      return
    case 'combo_tier4Plus':
      playBankWithoutFallback('comboTier4Plus')
      return
    case 'combo_triggered':
      {
        const comboBankId = resolveComboBankByMultiplier(event.multiplier)
        if (!comboBankId) return
        playBankWithoutFallback(comboBankId)
      }
      return
    default:
      return
  }
}

export function startGameSoundLoop(event: GameSoundLoopEvent): AudioLoopHandle | null {
  switch (event.type) {
    case 'ten_seconds_left':
      return startLoopingAudioBank('tenSecondsLeft')
    default:
      return null
  }
}

export function tryPlaySwooshFromVelocity(velocityPx: number, nowMs: number): void {
  const swooshRules = AUDIO_SETTINGS.rules.swoosh
  if (velocityPx < swooshRules.minVelocity) return
  if (nowMs - lastSwooshTimeMs < swooshRules.cooldownMs) return

  lastSwooshTimeMs = nowMs
  const range = swooshRules.maxVelocity - swooshRules.minVelocity
  const volumeScale = range > 0
    ? Math.min(1, Math.max(0, (velocityPx - swooshRules.minVelocity) / range))
    : 1
  playAudioBank('swoosh', volumeScale)
}
