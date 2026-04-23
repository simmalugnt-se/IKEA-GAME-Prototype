import type { CSSProperties } from 'react'
import type { ScoreboardVisualCue } from '@/ui/scoreboard/scoreboardEventRuntime.types'
import './scoreboardFxOverlay.css'

type ScoreboardFxOverlayProps = {
  cues: readonly ScoreboardVisualCue[]
}

function cueKindClass(cue: ScoreboardVisualCue): string {
  switch (cue.kind) {
    case 'combo':
      return 'sbfx-kind-combo'
    case 'points':
      return 'sbfx-kind-points'
    case 'game_started':
      return 'sbfx-kind-game-started'
    case 'game_over':
      return 'sbfx-kind-game-over'
    case 'initials_submitted':
      return 'sbfx-kind-initials-submitted'
    case 'timebonus':
      return 'sbfx-kind-timebonus'
    case 'special':
      return 'sbfx-kind-special'
    default:
      return 'sbfx-kind-points'
  }
}

function resolvePeakOpacity(intensity: number): number {
  if (!Number.isFinite(intensity)) return 0.6
  return Math.max(0.32, Math.min(0.95, 0.42 + intensity * 0.3))
}

export function ScoreboardFxOverlay({ cues }: ScoreboardFxOverlayProps) {
  return (
    <div className="sbfx-root" aria-hidden="true">
      {cues.map((cue) => {
        const cueStyle: CSSProperties = {
          animationDuration: `${cue.durationMs}ms`,
        }
        ;(cueStyle as Record<string, string>)['--sbfx-peak-opacity'] = `${resolvePeakOpacity(cue.intensity)}`

        const labelStyle = {
          animationDuration: `${Math.max(300, cue.durationMs * 0.92)}ms`,
        } satisfies CSSProperties

        return (
          <div key={cue.id} className={`sbfx-cue ${cueKindClass(cue)}`} style={cueStyle}>
            <div className="sbfx-vignette" />
            <div className="sbfx-label" style={labelStyle}>{cue.label}</div>
          </div>
        )
      })}
    </div>
  )
}
