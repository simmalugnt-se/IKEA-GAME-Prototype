export const AUDIO_BANK_IDS = [
  'pop',
  'felt',
  'steel',
  'error',
  'bee',
  'swoosh',
  'comboTier2',
  'comboTier3',
  'comboTier4Plus',
] as const

export type AudioBankId = (typeof AUDIO_BANK_IDS)[number]

export type AudioBankSettings = {
  files: string[]
  volume: number
}

export type AudioSwooshRules = {
  minVelocity: number
  maxVelocity: number
  cooldownMs: number
}

export type AudioMusicLoopSettings = {
  file: string
  volume: number
  switchMarkersSec: number[]
}

export type AudioMusicRunTimelineEntry = {
  atSec: number
  loopId: string
}

export type AudioMusicEventTimelineEntry = {
  atLoop: number
  loopId: string
}

export type AudioMusicRunSequenceSettings = {
  volume: number
  timeline: AudioMusicRunTimelineEntry[]
}

export type AudioMusicEventSequenceSettings = {
  volume: number
  timelineByLoop: AudioMusicEventTimelineEntry[]
}

export type AudioMixSettings = {
  masterVolume: number
  sfxMasterVolume: number
  musicMasterVolume: number
}

export type AudioMusicSettings = {
  enabled: boolean
  loops: Record<string, AudioMusicLoopSettings>
  idleSequence: AudioMusicRunSequenceSettings
  runSequence: AudioMusicRunSequenceSettings
  eventSequences: Record<string, AudioMusicEventSequenceSettings>
}

export type AudioSettings = {
  enabled: boolean
  mix: AudioMixSettings
  banks: Record<AudioBankId, AudioBankSettings>
  music: AudioMusicSettings
  rules: {
    swoosh: AudioSwooshRules
  }
}
