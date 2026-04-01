import { SETTINGS } from '@/settings/GameSettings'
import type {
  SpawnEventActionSpawnBurst,
  SpawnEventRule,
  SpawnItemDefinition,
} from '@/settings/GameSettings.types'
import { resolveAccelerationMultiplier } from '@/utils/accelerationCurve'

export type QueuedSpawnRequest = {
  itemId: string
  xOffset: number
  yOffset: number
}

function normalizeId(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeWeight(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, value)
}

function normalizeWeightMaxMultiplier(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, value)
}

function normalizeConcurrentCap(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.trunc(value))
}

function normalizeCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

function normalizeMinScoreToSpawn(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

export function getSpawnItemDefinitions(): SpawnItemDefinition[] {
  return SETTINGS.spawner.itemDefinitions
}

export function resolveSpawnItemDefinitionById(itemId: string | undefined): SpawnItemDefinition | null {
  const normalizedId = normalizeId(itemId)
  if (!normalizedId) return null

  const definitions = getSpawnItemDefinitions()
  for (let i = 0; i < definitions.length; i += 1) {
    const definition = definitions[i]
    if (!definition || definition.enabled !== true) continue
    if (normalizeId(definition.id) === normalizedId) return definition
  }

  return null
}

export function getDefaultSpawnItemPool(): SpawnItemDefinition[] {
  return getSpawnItemDefinitions().filter((definition) => (
    definition.enabled === true
    && definition.includeInDefaultPool === true
  ))
}

function normalizeMaxConcurrent(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.trunc(value))
}

export function resolveSpawnItemMaxConcurrent(
  definition: SpawnItemDefinition,
  runSeconds = 0,
): number | null {
  const baseMaxConcurrent = normalizeMaxConcurrent(definition.maxConcurrent)
  if (baseMaxConcurrent === null) return null

  const concurrentMultiplier = resolveAccelerationMultiplier(
    typeof definition.maxConcurrentAcceleration === 'number' ? definition.maxConcurrentAcceleration : 0,
    definition.maxConcurrentAccelerationCurve ?? 'linear',
    runSeconds,
  )
  const scaledMaxConcurrent = Math.max(
    baseMaxConcurrent,
    Math.round(baseMaxConcurrent * Math.max(0, concurrentMultiplier)),
  )
  const concurrentCap = normalizeConcurrentCap(definition.maxConcurrentCap)
  return concurrentCap === null
    ? scaledMaxConcurrent
    : Math.min(scaledMaxConcurrent, concurrentCap)
}

export function resolveSpawnItemWeight(
  definition: SpawnItemDefinition,
  runSeconds = 0,
): number {
  const baseWeight = normalizeWeight(definition.weight)
  if (!(baseWeight > 0)) return 0

  const weightMultiplier = resolveAccelerationMultiplier(
    typeof definition.weightAcceleration === 'number' ? definition.weightAcceleration : 0,
    definition.weightAccelerationCurve ?? 'linear',
    runSeconds,
  )
  const weightMaxMultiplier = normalizeWeightMaxMultiplier(definition.weightMaxMultiplier)
  const clampedMultiplier = weightMaxMultiplier === null
    ? weightMultiplier
    : Math.min(weightMultiplier, weightMaxMultiplier)

  return baseWeight * Math.max(0, clampedMultiplier)
}

export function pickWeightedSpawnItemDefinition(
  activeCountsByItemId: Record<string, number> = {},
  runSeconds = 0,
  currentScore = 0,
): SpawnItemDefinition | null {
  const pool = getDefaultSpawnItemPool().filter((definition) => {
    const minScoreToSpawn = normalizeMinScoreToSpawn(definition.minScoreToSpawn)
    if (currentScore < minScoreToSpawn) return false
    const maxConcurrent = resolveSpawnItemMaxConcurrent(definition, runSeconds)
    if (maxConcurrent === null) return true
    const activeCount = Math.max(0, Math.trunc(activeCountsByItemId[definition.id] ?? 0))
    return activeCount < maxConcurrent
  }).filter((definition) => resolveSpawnItemWeight(definition, runSeconds) > 0)
  if (pool.length <= 0) return null

  let totalWeight = 0
  for (let i = 0; i < pool.length; i += 1) {
    const definition = pool[i]
    if (!definition) continue
    totalWeight += resolveSpawnItemWeight(definition, runSeconds)
  }
  if (!(totalWeight > 0)) return null

  let remaining = Math.random() * totalWeight
  for (let i = 0; i < pool.length; i += 1) {
    const definition = pool[i]
    if (!definition) continue
    remaining -= resolveSpawnItemWeight(definition, runSeconds)
    if (remaining <= 0) return definition
  }

  return pool[pool.length - 1] ?? null
}

export function getSpawnEventRules(): SpawnEventRule[] {
  return SETTINGS.spawner.eventRules
}

function buildQueuedSpawnRequestsForSpawnBurstAction(
  action: SpawnEventActionSpawnBurst,
): QueuedSpawnRequest[] {
  const requests: QueuedSpawnRequest[] = []
  const spawnBandHalfWidth = Number.isFinite(SETTINGS.spawner.spawnXRange)
    ? Math.max(0, SETTINGS.spawner.spawnXRange)
    : 0
  const spawnBandCenter = Number.isFinite(SETTINGS.spawner.spawnXRangeOffset)
    ? SETTINGS.spawner.spawnXRangeOffset
    : 0
  const burstCenterX = spawnBandCenter + (Math.random() * 2 - 1) * spawnBandHalfWidth
  const spacingX = Number.isFinite(action.spacingX) ? action.spacingX : 0
  const spacingY = Number.isFinite(action.spacingY) ? action.spacingY : spacingX
  const jitterX = Number.isFinite(action.randomXJitter) ? Math.max(0, action.randomXJitter) : 0
  const jitterY = Number.isFinite(action.randomYJitter) ? Math.max(0, action.randomYJitter) : 0
  const spawnXOffset = Number.isFinite(action.spawnXOffset) ? action.spawnXOffset : 0

  const flatItemIds: string[] = []
  for (let entryIndex = 0; entryIndex < action.entries.length; entryIndex += 1) {
    const entry = action.entries[entryIndex]
    if (!entry) continue
    const count = normalizeCount(entry.count)
    const itemId = normalizeId(entry.itemId)
    if (!itemId || count <= 0) continue
    if (!resolveSpawnItemDefinitionById(itemId)) continue
    for (let i = 0; i < count; i += 1) {
      flatItemIds.push(itemId)
    }
  }

  const totalCount = flatItemIds.length
  if (totalCount <= 0) return requests

  const useBouquetLayout = action.layout === 'bouquet'
  const bouquetPattern: Array<[number, number]> = [
    [0, 0],
    [-0.75, 0.2],
    [0.75, 0.2],
    [-0.35, 0.75],
    [0.35, 0.85],
    [-1.05, 0.95],
    [1.05, 0.95],
  ]
  const centerOffset = (totalCount - 1) * 0.5
  for (let i = 0; i < totalCount; i += 1) {
    const itemId = flatItemIds[i]
    if (!itemId) continue
    const pattern = useBouquetLayout
      ? (bouquetPattern[i] ?? [i - centerOffset, Math.max(0, Math.floor(i / 2)) * 0.55])
      : [i - centerOffset, 0]
    const baseOffsetX = pattern[0] * spacingX
    const baseOffsetY = pattern[1] * spacingY
    const jitterOffsetX = jitterX > 0 ? (Math.random() * 2 - 1) * jitterX : 0
    const jitterOffsetY = jitterY > 0 ? (Math.random() * 2 - 1) * jitterY : 0
    requests.push({
      itemId,
      xOffset: burstCenterX + spawnXOffset + baseOffsetX + jitterOffsetX,
      yOffset: baseOffsetY + jitterOffsetY,
    })
  }

  return requests
}

export function buildQueuedSpawnRequestsForSpawnEvent(
  rule: SpawnEventRule,
): QueuedSpawnRequest[] {
  if (rule.action.type !== 'spawn_burst') return []
  return buildQueuedSpawnRequestsForSpawnBurstAction(rule.action)
}
