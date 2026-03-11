export type ScoreboardDmdPalette = [string, string, string, string]
export type ScoreboardCurvePoint = { x: number; y: number }
export type ScoreboardSourceMode = 'fixed' | 'viewport_divider'
export type ScoreboardRiveFit = 'contain' | 'cover' | 'fill'

export type ScoreboardSourceSettings = {
  mode: ScoreboardSourceMode
  fixedWidth: number
  fixedHeight: number
  viewportDivider: number
  riveFit: ScoreboardRiveFit
}

export type ScoreboardSettings = {
  debug: {
    showOverlayByDefault: boolean
  }
  dmd: {
    source: ScoreboardSourceSettings
    grid: {
      dotFill: number
      resolutionMultiplier: number
    }
    curve: {
      points: ScoreboardCurvePoint[]
      antiAliasCrush: number
    }
    edge: {
      enabled: boolean
      detectRange: number
      compressStrength: number
      midBandMin: number
      midBandMax: number
    }
    timing: {
      targetFps: number
    }
    palette: ScoreboardDmdPalette
  }
}
