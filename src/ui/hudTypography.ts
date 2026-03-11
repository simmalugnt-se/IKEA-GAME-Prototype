import type { CSSProperties } from 'react'

type PopdotAxes = {
  wght: number
  slnt: number
  wdth: number
}

export type PopdotStyleKey = 'style1' | 'style2' | 'style3' | 'style4'
export const POPDOT_SHADOW_COLOR = '#141414'
export const POPDOT_SHADOW_STYLE: CSSProperties = {
  textShadow: `0.5px 0.5px 0 ${POPDOT_SHADOW_COLOR}, 1px 1px 0 ${POPDOT_SHADOW_COLOR}, 1.5px 1.5px 0 ${POPDOT_SHADOW_COLOR}, 2px 2px 0 ${POPDOT_SHADOW_COLOR}`,
}

const POPDOT_BASE: CSSProperties = {
  fontFamily: '"popdot", "Instrument Sans", sans-serif',
  lineHeight: '0.75em',
  letterSpacing: '0.08em',
}

export const POPDOT_LIGATURES_BASE: CSSProperties = {
  fontVariantLigatures: 'common-ligatures discretionary-ligatures contextual',
  fontFeatureSettings: '"liga" 1, "clig" 1, "calt" 1, "dlig" 1',
}

function resolveFontVariationSettings(axes: PopdotAxes): string {
  return `"wght" ${axes.wght}, "slnt" ${axes.slnt}, "wdth" ${axes.wdth}`
}

function createPopdotStyle(axes: PopdotAxes): CSSProperties {
  return {
    ...POPDOT_BASE,
    ...POPDOT_LIGATURES_BASE,
    fontVariationSettings: resolveFontVariationSettings(axes),
    fontWeight: `${axes.wght}`,
  }
}

export const POPDOT_STYLE_1: CSSProperties = createPopdotStyle({ wght: 350, slnt: 100, wdth: 0 })
export const POPDOT_STYLE_2: CSSProperties = createPopdotStyle({ wght: 200, slnt: 100, wdth: 100 })
export const POPDOT_STYLE_3: CSSProperties = createPopdotStyle({ wght: 200, slnt: 0, wdth: 0 })
export const POPDOT_STYLE_4: CSSProperties = createPopdotStyle({ wght: 150, slnt: 0, wdth: 0 })

export const POPDOT_STYLE_BY_KEY: Record<PopdotStyleKey, CSSProperties> = {
  style1: POPDOT_STYLE_1,
  style2: POPDOT_STYLE_2,
  style3: POPDOT_STYLE_3,
  style4: POPDOT_STYLE_4,
}
