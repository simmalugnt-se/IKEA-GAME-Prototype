import { playGameSound } from '@/audio/GameAudioRouter'
import { preloadAudioBanks } from '@/audio/SoundManager'
import type { ScoreboardSoundCue } from '@/ui/scoreboard/scoreboardEventRuntime.types'

let initialized = false

export function initScoreboardAudio(): void {
  if (initialized) return
  initialized = true
  void preloadAudioBanks().catch((error) => {
    console.error('[scoreboardSoundRouter] Failed to preload audio banks.', error)
  })
}

export function playScoreboardSoundCue(cue: ScoreboardSoundCue): void {
  switch (cue.kind) {
    case 'combo':
      playGameSound({ type: 'combo_triggered', multiplier: cue.multiplier })
      return
    case 'run_started':
      playGameSound({ type: 'run_started' })
      return
    case 'run_ended':
      playGameSound({ type: 'game_over' })
      return
    case 'initials_submitted':
      playGameSound({ type: 'idle_started' })
      return
    case 'contagion_points':
      playGameSound({ type: 'contagion_infection' })
      return
    case 'timebonus':
      playGameSound({ type: 'combo_tier2' })
      return
    case 'special_event':
      playGameSound({ type: 'combo_tier4Plus' })
      return
    default:
      return
  }
}
