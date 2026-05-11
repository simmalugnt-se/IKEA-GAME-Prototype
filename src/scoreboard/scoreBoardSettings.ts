import type { ScoreboardSettings } from '@/scoreboard/scoreBoardSettings.types'

export const SCOREBOARD_SETTINGS: ScoreboardSettings = {
  debug: {
    showOverlayByDefault: false,
    logRiveEvents: false,
  },
  display: {
    // CSS-pixlar in från viewport-kanterna. Negativa värden tillåtna för
    // mask-offset utanför viewport.
    safeAreaPx: { left: 140, right: 240, top: 0, bottom: 0 },
  },
  dmd: {
    source: {
      // Kvadratisk source-canvas i pixlar. Ska matcha Rive-artboardens enhetsstorlek
      // 1:1 (eller en integer-multiplikator av den) för knivskarp pixel-rendering.
      size: 400,
      riveFit: 'cover',
    },
    grid: {
      dotFill: 0.8,
      // Antal DMD-dots per sida i den kvadratiska griden. Sätter dot-densiteten.
      // 200 ≈ dagens visuella täthet på en 1600px-viewport.
      dotsPerSide: 200,
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
    palette: ['#669E10', '#006B18', '#0E3420', '#000000'],
  },

}
