import type {
  ScoreboardRiveFit,
  ScoreboardSourceSettings,
} from '@/scoreboard/scoreBoardSettings.types'

export const SCOREBOARD_SOURCE_SIZE_MIN = 16
export const SCOREBOARD_SOURCE_SIZE_MAX = 4096

const DEFAULT_SOURCE_SETTINGS: ScoreboardSourceSettings = {
  size: 400,
  riveFit: 'cover',
}

export type ResolvedScoreboardSource = {
  width: number
  height: number
  fit: ScoreboardRiveFit
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

function resolveFit(value: unknown): ScoreboardRiveFit {
  if (value === 'cover' || value === 'fill') return value
  return 'contain'
}

export function normalizeScoreboardSourceSettings(
  source: Partial<ScoreboardSourceSettings> | ScoreboardSourceSettings,
): ScoreboardSourceSettings {
  const size = Math.floor(clampRange(
    finiteNumber(source?.size, DEFAULT_SOURCE_SETTINGS.size),
    SCOREBOARD_SOURCE_SIZE_MIN,
    SCOREBOARD_SOURCE_SIZE_MAX,
  ))
  return {
    size,
    riveFit: resolveFit(source?.riveFit),
  }
}

export function resolveScoreboardSource(
  source: Partial<ScoreboardSourceSettings> | ScoreboardSourceSettings,
): ResolvedScoreboardSource {
  const normalized = normalizeScoreboardSourceSettings(source)
  return {
    width: normalized.size,
    height: normalized.size,
    fit: normalized.riveFit,
  }
}

export function isSameResolvedScoreboardSource(
  a: ResolvedScoreboardSource,
  b: ResolvedScoreboardSource,
): boolean {
  return a.width === b.width && a.height === b.height && a.fit === b.fit
}
