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
    case 'idle_started':
      playGameSound({ type: 'idle_started' })
      return
    case 'high_score_entry':
      playGameSound({ type: 'high_score_entry' })
      return
    case 'high_score_entry_lock':
      playGameSound({ type: 'high_score_entry_lock' })
      return
    case 'initials_submitted':
      playGameSound({ type: 'idle_started' })
      return
    case 'contagion_points':
      playGameSound({ type: 'contagion_infection' })
      return
    case 'timebonus':
      playGameSound({ type: 'time_bonus' })
      return
    case 'roller':
      playGameSound({ type: 'roller' })
      return
    case 'slowmo':
      playGameSound({ type: 'slowmo' })
      return
    case 'zero_gravity':
      playGameSound({ type: 'zero_gravity' })
      return
    case 'multi_balls':
      playGameSound({ type: 'multi_balls' })
      return
    default:
      return
  }
}
