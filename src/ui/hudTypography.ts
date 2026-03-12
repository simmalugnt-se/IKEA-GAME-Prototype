import type { CSSProperties } from 'react'
import {
  POPDOT_SHADOW_COLOR_FALLBACK,
  POPDOT_STYLE_AXES,
  POPDOT_TEXT_BASE,
  resolveFontVariationSettings,
  resolvePopdotShadowOffsets as resolvePopdotShadowOffsetsFromTokens,
  type PopdotAxes,
  type PopdotShadowSize,
  type PopdotStyleKey,
} from '@/ui/typography/popdotTokens'

export type { PopdotShadowSize, PopdotStyleKey }
export const POPDOT_SHADOW_COLOR = POPDOT_SHADOW_COLOR_FALLBACK

const SHADOW_OFFSETS_BY_SIZE: Record<PopdotShadowSize, number[]> = {
  2: resolvePopdotShadowOffsetsFromTokens(2),
  4: resolvePopdotShadowOffsetsFromTokens(4),
  8: resolvePopdotShadowOffsetsFromTokens(8),
  12: resolvePopdotShadowOffsetsFromTokens(12),
  16: resolvePopdotShadowOffsetsFromTokens(16),
}

export function resolvePopdotShadowOffsets(size: PopdotShadowSize): number[] {
  return SHADOW_OFFSETS_BY_SIZE[size]
}

export function createPopdotShadowStyle(size: PopdotShadowSize): CSSProperties {
  const offsets = resolvePopdotShadowOffsets(size)
  return {
    textShadow: offsets
      .map((shadowOffset) => `${shadowOffset}px ${shadowOffset}px 0 ${POPDOT_SHADOW_COLOR}`)
      .join(', '),
  }
}

export const POPDOT_SHADOW_STYLE = createPopdotShadowStyle(4)

const POPDOT_BASE: CSSProperties = {
  fontFamily: POPDOT_TEXT_BASE.fontFamily,
  lineHeight: POPDOT_TEXT_BASE.lineHeight,
  letterSpacing: POPDOT_TEXT_BASE.letterSpacing,
}

export const POPDOT_LIGATURES_BASE: CSSProperties = {
  fontVariantLigatures: POPDOT_TEXT_BASE.fontVariantLigatures,
  fontFeatureSettings: POPDOT_TEXT_BASE.fontFeatureSettings,
}

function createPopdotStyle(axes: PopdotAxes): CSSProperties {
  return {
    ...POPDOT_BASE,
    ...POPDOT_LIGATURES_BASE,
    fontVariationSettings: resolveFontVariationSettings(axes),
    fontWeight: `${axes.wght}`,
  }
}

export const POPDOT_STYLE_1: CSSProperties = createPopdotStyle(POPDOT_STYLE_AXES.style1)
export const POPDOT_STYLE_2: CSSProperties = createPopdotStyle(POPDOT_STYLE_AXES.style2)
export const POPDOT_STYLE_3: CSSProperties = createPopdotStyle(POPDOT_STYLE_AXES.style3)
export const POPDOT_STYLE_4: CSSProperties = createPopdotStyle(POPDOT_STYLE_AXES.style4)
export const POPDOT_STYLE_5: CSSProperties = createPopdotStyle(POPDOT_STYLE_AXES.style5)

export const POPDOT_STYLE_BY_KEY: Record<PopdotStyleKey, CSSProperties> = {
  style1: POPDOT_STYLE_1,
  style2: POPDOT_STYLE_2,
  style3: POPDOT_STYLE_3,
  style4: POPDOT_STYLE_4,
  style5: POPDOT_STYLE_5,
}
