export type ScoreboardDmdPalette = [string, string, string, string]
export type ScoreboardCurvePoint = { x: number; y: number }
export type ScoreboardRiveFit = 'contain' | 'cover' | 'fill'

export type ScoreboardSourceSettings = {
  size: number
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
      dotsPerSide: number
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
