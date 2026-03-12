export type PopdotStyleKey = 'style1' | 'style2' | 'style3' | 'style4' | 'style5'
export type PopdotShadowSize = 2 | 4 | 8 | 12 | 16

export type PopdotAxes = {
  wght: number
  slnt: number
  wdth: number
  SQRE: number
}

export const POPDOT_SHADOW_COLOR_FALLBACK = '#141414'

export const POPDOT_TEXT_BASE = {
  fontFamily: '"popdot", "Instrument Sans", sans-serif',
  lineHeight: '0.75em',
  letterSpacing: '0.08em',
  fontVariantLigatures: 'common-ligatures discretionary-ligatures contextual',
  fontFeatureSettings: '"liga" 1, "clig" 1, "calt" 1, "dlig" 1',
} as const

export const POPDOT_STYLE_AXES: Record<PopdotStyleKey, PopdotAxes> = {
  style1: { wght: 350, slnt: 100, wdth: 0, SQRE: 0 },
  style2: { wght: 200, slnt: 100, wdth: 100, SQRE: 0 },
  style3: { wght: 200, slnt: 0, wdth: 0, SQRE: 0 },
  style4: { wght: 150, slnt: 0, wdth: 0, SQRE: 0 },
  style5: { wght: 375, slnt: 100, wdth: 100, SQRE: 0 },
}

export const POPDOT_CANVAS_STYLE5_WEIGHT_RANGE = {
  min: 25,
  max: 600,
} as const

export const POPDOT_SHADOW_DENSITY_BY_SIZE: Record<PopdotShadowSize, number> = {
  2: 0.5,
  4: 0.5,
  8: 1,
  12: 2,
  16: 2,
}

export function resolvePopdotShadowOffsets(size: PopdotShadowSize): number[] {
  const density = POPDOT_SHADOW_DENSITY_BY_SIZE[size]
  const offsets: number[] = []
  for (let shadowOffset = density; shadowOffset <= size; shadowOffset += density) {
    offsets.push(shadowOffset)
  }
  return offsets
}

export function resolveFontVariationSettings(axes: PopdotAxes): string {
  return `"wght" ${axes.wght}, "slnt" ${axes.slnt}, "wdth" ${axes.wdth}, "SQRE" ${axes.SQRE}`
}

