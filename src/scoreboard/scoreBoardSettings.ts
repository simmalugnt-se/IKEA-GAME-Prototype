import type { ScoreboardSettings } from '@/scoreboard/scoreBoardSettings.types'

export const SCOREBOARD_SETTINGS: ScoreboardSettings = {
  debug: {
    showOverlayByDefault: false,
  },
  dmd: {
    source: {
      mode: 'viewport_divider',
      fixedWidth: 240,
      fixedHeight: 135,
      viewportDivider: 8,
      riveFit: 'cover',
    },
    grid: {
      dotFill: 0.8,
      resolutionMultiplier: 2,
    },
    curve: {
      points: [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.5 },
        { x: 0.75, y: 0.75 },
        { x: 1, y: 1 },
      ],
      antiAliasCrush: 0.35,
    },
    edge: {
      enabled: true,
      detectRange: 0.28,
      compressStrength: 0.82,
      midBandMin: 0.10,
      midBandMax: 0.90,
    },
    timing: {
      targetFps: 8,
    },
    // lightest -> darkest
    palette: ['#669E10', '#006B18', '#0E3420', '#141414'],
  },
}
