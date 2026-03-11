import type {
  ScoreboardRiveFit,
  ScoreboardSourceMode,
  ScoreboardSourceSettings,
} from '@/scoreboard/scoreBoardSettings.types'

export const SCOREBOARD_SOURCE_DIVIDER_MIN = 0.5
export const SCOREBOARD_SOURCE_DIVIDER_MAX = 32

const DEFAULT_SOURCE_SETTINGS: ScoreboardSourceSettings = {
  mode: 'fixed',
  fixedWidth: 240,
  fixedHeight: 135,
  viewportDivider: 1,
  riveFit: 'contain',
}

export type ResolvedScoreboardSource = {
  width: number
  height: number
  fit: ScoreboardRiveFit
  mode: ScoreboardSourceMode
  divider: number
}

function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
}

function clampRange(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function resolveMode(value: unknown): ScoreboardSourceMode {
  return value === 'viewport_divider' ? 'viewport_divider' : 'fixed'
}

function resolveFit(value: unknown): ScoreboardRiveFit {
  if (value === 'cover' || value === 'fill') return value
  return 'contain'
}

export function normalizeScoreboardSourceSettings(
  source: Partial<ScoreboardSourceSettings> | ScoreboardSourceSettings,
): ScoreboardSourceSettings {
  const mode = resolveMode(source?.mode)
  return {
    mode,
    fixedWidth: Math.max(1, Math.floor(finiteNumber(source?.fixedWidth, DEFAULT_SOURCE_SETTINGS.fixedWidth))),
    fixedHeight: Math.max(1, Math.floor(finiteNumber(source?.fixedHeight, DEFAULT_SOURCE_SETTINGS.fixedHeight))),
    viewportDivider: clampRange(
      finiteNumber(source?.viewportDivider, DEFAULT_SOURCE_SETTINGS.viewportDivider),
      SCOREBOARD_SOURCE_DIVIDER_MIN,
      SCOREBOARD_SOURCE_DIVIDER_MAX,
    ),
    riveFit: resolveFit(source?.riveFit),
  }
}

export function resolveScoreboardSourceSize(
  viewportW: number,
  viewportH: number,
  source: Partial<ScoreboardSourceSettings> | ScoreboardSourceSettings,
): ResolvedScoreboardSource {
  const normalized = normalizeScoreboardSourceSettings(source)
  const viewportWidth = Math.max(1, Math.floor(finiteNumber(viewportW, DEFAULT_SOURCE_SETTINGS.fixedWidth)))
  const viewportHeight = Math.max(1, Math.floor(finiteNumber(viewportH, DEFAULT_SOURCE_SETTINGS.fixedHeight)))

  if (normalized.mode === 'viewport_divider') {
    return {
      width: Math.max(1, Math.round(viewportWidth / normalized.viewportDivider)),
      height: Math.max(1, Math.round(viewportHeight / normalized.viewportDivider)),
      fit: normalized.riveFit,
      mode: normalized.mode,
      divider: normalized.viewportDivider,
    }
  }

  return {
    width: normalized.fixedWidth,
    height: normalized.fixedHeight,
    fit: normalized.riveFit,
    mode: normalized.mode,
    divider: normalized.viewportDivider,
  }
}

export function isSameResolvedScoreboardSource(
  a: ResolvedScoreboardSource,
  b: ResolvedScoreboardSource,
): boolean {
  return a.width === b.width
    && a.height === b.height
    && a.fit === b.fit
    && a.mode === b.mode
    && a.divider === b.divider
}
