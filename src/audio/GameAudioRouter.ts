import { AUDIO_SETTINGS } from '@/audio/AudioSettings'
import type { AudioBankId } from '@/audio/AudioSettings.types'
import { hasLoadedAudioBank, playAudioBank } from '@/audio/SoundManager'

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
  | ComboTierGameSoundEvent
  | ComboTriggeredGameSoundEvent

let lastSwooshTimeMs = 0

function resolveComboBankByMultiplier(multiplier: number): AudioBankId | null {
  if (!(multiplier >= 2)) return null
  if (multiplier === 2) return 'comboTier2'
  if (multiplier === 3) return 'comboTier3'
  return 'comboTier4Plus'
}

function resolveComboTierEvent(multiplier: number): ComboTierGameSoundEvent | null {
  const comboBankId = resolveComboBankByMultiplier(multiplier)
  switch (comboBankId) {
    case 'comboTier2':
      return { type: 'combo_tier2' }
    case 'comboTier3':
      return { type: 'combo_tier3' }
    case 'comboTier4Plus':
      return { type: 'combo_tier4Plus' }
    default:
      return null
  }
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
      playAudioBank('comboTier2')
      return
    case 'idle_started':
      playAudioBank('felt')
      return
    case 'life_lost':
      playAudioBank('error')
      return
    case 'run_end':
      playAudioBank('bee')
      return
    case 'game_over':
      playAudioBank('bee')
      return
    case 'contagion_infection':
      playAudioBank('steel')
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
        const comboTierEvent = resolveComboTierEvent(event.multiplier)
        if (!comboTierEvent) return
        playGameSound(comboTierEvent)
      }
      return
    default:
      return
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
