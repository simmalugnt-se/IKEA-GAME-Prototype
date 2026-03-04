import { create } from 'zustand'
import type { LevelData } from '@/levelStore'
import { parseLevelFileJson } from '@/levelStore'

const DEFAULT_TILE_DEPTH = 12.8
const SEGMENT_EDGE_EPSILON = 0.0001

export type LevelSpawnMode = 'idle' | 'run'

type ResolvedTileSpanMetrics = {
  centerOffsetZ: number
  spanZMin: number
  spanZMax: number
}

const tileSpanMetricsCache = new WeakMap<LevelData, ResolvedTileSpanMetrics>()

export type LevelSegment = {
  id: string
  filename: string
  data: LevelData
  zOffset: number
  centerOffsetZ: number
  spanZMin: number
  spanZMax: number
  nearWorldZ: number
  farWorldZ: number
}

export type LevelTilingInitializeConfig = {
  runFiles: string[]
  idleFiles: string[]
  gameOverFiles: string[]
}

function resolveFallbackDepth(data: LevelData): number {
  const unitSize = data.unitSize
  const gridZ = data.gridSize?.[1]
  if (typeof unitSize === 'number' && Number.isFinite(unitSize) && unitSize > 0 && typeof gridZ === 'number' && Number.isFinite(gridZ) && gridZ > 0) {
    return gridZ * unitSize
  }
  return DEFAULT_TILE_DEPTH
}

export function resolveTileSpanMetrics(data: LevelData): ResolvedTileSpanMetrics {
  const cached = tileSpanMetricsCache.get(data)
  if (cached) return cached

  const metrics = data.sceneMetrics
  const centerOffsetZ = (
    typeof metrics?.tileCenterZ === 'number' && Number.isFinite(metrics.tileCenterZ)
      ? metrics.tileCenterZ
      : 0
  )

  const hasSpanMin = typeof metrics?.tileSpanZMin === 'number' && Number.isFinite(metrics.tileSpanZMin)
  const hasSpanMax = typeof metrics?.tileSpanZMax === 'number' && Number.isFinite(metrics.tileSpanZMax)
  if (hasSpanMin && hasSpanMax && metrics!.tileSpanZMax! > metrics!.tileSpanZMin!) {
    const resolved = {
      centerOffsetZ,
      spanZMin: metrics!.tileSpanZMin!,
      spanZMax: metrics!.tileSpanZMax!,
    }
    tileSpanMetricsCache.set(data, resolved)
    return resolved
  }

  const depth = resolveFallbackDepth(data)
  const halfDepth = depth * 0.5
  if (!(depth > 0)) {
    console.error('[levelTilingStore] Invalid level depth for tile span fallback. Using DEFAULT_TILE_DEPTH.', {
      gridSize: data.gridSize,
      unitSize: data.unitSize,
    })
  }
  const resolved = {
    centerOffsetZ,
    spanZMin: centerOffsetZ - halfDepth,
    spanZMax: centerOffsetZ + halfDepth,
  }
  tileSpanMetricsCache.set(data, resolved)
  return resolved
}

export function getTileDepth(data: LevelData): number {
  const span = resolveTileSpanMetrics(data)
  return span.spanZMax - span.spanZMin
}

type LevelTilingState = {
  availableLevels: Map<string, LevelData>
  segments: LevelSegment[]
  nextAttachWorldZ: number
  segmentIdCounter: number
  initialized: boolean
  error: string | null
  runFiles: string[]
  idleFiles: string[]
  gameOverFiles: string[]
  spawnMode: LevelSpawnMode
  runFileIndex: number
  idleFileIndex: number
  forcedFilenames: string[]
  initialize: (config: LevelTilingInitializeConfig) => Promise<void>
  setSpawnMode: (mode: LevelSpawnMode, resetIndex?: boolean) => void
  setForcedTiles: (filenames: string[]) => void
  previewForcedFinalCenterZ: (filenames: string[]) => number | null
  spawnNextSegment: () => void
  cullSegment: (id: string) => void
  cullSegments: (ids: string[]) => void
  rebaseNextAttachWorldZ: () => void
  setNextAttachWorldZ: (z: number) => void
}

function normalizeFileList(files: string[]): string[] {
  const normalized: string[] = []
  for (let i = 0; i < files.length; i += 1) {
    const raw = files[i]
    if (typeof raw !== 'string') continue
    const value = raw.trim()
    if (!value) continue
    normalized.push(value)
  }
  return normalized
}

function getUnionFileList(config: LevelTilingInitializeConfig): string[] {
  const set = new Set<string>()
  const runFiles = normalizeFileList(config.runFiles)
  const idleFiles = normalizeFileList(config.idleFiles)
  const gameOverFiles = normalizeFileList(config.gameOverFiles)

  for (let i = 0; i < runFiles.length; i += 1) {
    set.add(runFiles[i]!)
  }
  for (let i = 0; i < idleFiles.length; i += 1) {
    set.add(idleFiles[i]!)
  }
  for (let i = 0; i < gameOverFiles.length; i += 1) {
    set.add(gameOverFiles[i]!)
  }

  return Array.from(set)
}

export const useLevelTilingStore = create<LevelTilingState>((set, get) => ({
  availableLevels: new Map(),
  segments: [],
  nextAttachWorldZ: 0,
  segmentIdCounter: 0,
  initialized: false,
  error: null,
  runFiles: [],
  idleFiles: [],
  gameOverFiles: [],
  spawnMode: 'idle',
  runFileIndex: 0,
  idleFileIndex: 0,
  forcedFilenames: [],

  initialize: async (config) => {
    const runFiles = normalizeFileList(config.runFiles)
    const idleFiles = normalizeFileList(config.idleFiles)
    const gameOverFiles = normalizeFileList(config.gameOverFiles)

    const filesToLoad = getUnionFileList(config)
    if (filesToLoad.length === 0) {
      set({
        availableLevels: new Map(),
        initialized: true,
        error: 'No level files configured for tiling',
        runFiles,
        idleFiles,
        gameOverFiles,
      })
      return
    }

    const next = new Map<string, LevelData>()
    for (let i = 0; i < filesToLoad.length; i += 1) {
      const filename = filesToLoad[i]!
      try {
        const response = await fetch(`/levels/${filename}`)
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
        const raw: unknown = await response.json()
        const data = parseLevelFileJson(raw)
        next.set(filename, data)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        set({
          availableLevels: new Map(),
          initialized: true,
          error: `Failed to load ${filename}: ${msg}`,
          runFiles,
          idleFiles,
          gameOverFiles,
        })
        console.error('Level tiling load error:', msg)
        return
      }
    }

    set((state) => ({
      availableLevels: next,
      segments: state.initialized ? state.segments : [],
      nextAttachWorldZ: state.initialized ? state.nextAttachWorldZ : 0,
      segmentIdCounter: state.initialized ? state.segmentIdCounter : 0,
      initialized: true,
      error: null,
      runFiles,
      idleFiles,
      gameOverFiles,
      runFileIndex: 0,
      idleFileIndex: 0,
      forcedFilenames: state.forcedFilenames,
    }))
  },

  setSpawnMode: (mode, resetIndex = true) => {
    set((state) => {
      if (state.spawnMode === mode && !resetIndex) return state
      return {
        ...state,
        spawnMode: mode,
        runFileIndex: resetIndex ? 0 : state.runFileIndex,
        idleFileIndex: resetIndex ? 0 : state.idleFileIndex,
      }
    })
  },

  setForcedTiles: (filenames) => {
    const normalized = normalizeFileList(filenames)
    if (normalized.length === 0) {
      console.error('[levelTilingStore] setForcedTiles called with empty file list.')
      return
    }
    set({ forcedFilenames: normalized })
  },

  previewForcedFinalCenterZ: (filenames) => {
    const normalized = normalizeFileList(filenames)
    if (normalized.length === 0) return null

    const state = get()
    if (state.availableLevels.size === 0) {
      console.error('[levelTilingStore] Cannot preview forced tiles before levels are loaded.')
      return null
    }

    let attachWorldZ = state.nextAttachWorldZ
    let finalCenterZ: number | null = null

    for (let i = 0; i < normalized.length; i += 1) {
      const filename = normalized[i]!
      const data = state.availableLevels.get(filename)
      if (!data) {
        console.error(`[levelTilingStore] Missing loaded level data for "${filename}" while previewing forced tiles.`)
        return null
      }

      const span = resolveTileSpanMetrics(data)
      const zOffset = attachWorldZ - span.spanZMax
      finalCenterZ = zOffset + span.centerOffsetZ
      attachWorldZ = zOffset + span.spanZMin
    }

    return finalCenterZ
  },

  spawnNextSegment: () => {
    set((state) => {
      if (state.availableLevels.size === 0) return state

      let nextRunFileIndex = state.runFileIndex
      let nextIdleFileIndex = state.idleFileIndex
      const nextForcedFilenames = state.forcedFilenames.slice()
      let filename: string | null = null

      if (nextForcedFilenames.length > 0) {
        filename = nextForcedFilenames.shift() ?? null
      } else if (state.spawnMode === 'run') {
        if (state.runFiles.length === 0) {
          console.error('[levelTilingStore] No runFiles configured for run spawn mode.')
          return state
        }
        filename = state.runFiles[nextRunFileIndex % state.runFiles.length] ?? null
        nextRunFileIndex += 1
      } else {
        if (state.idleFiles.length === 0) {
          console.error('[levelTilingStore] No idleFiles configured for idle spawn mode.')
          return state
        }
        filename = state.idleFiles[nextIdleFileIndex % state.idleFiles.length] ?? null
        nextIdleFileIndex += 1
      }

      if (!filename) {
        console.error('[levelTilingStore] Failed to resolve filename for next segment.')
        return state
      }

      const data = state.availableLevels.get(filename)
      if (!data) {
        console.error(`[levelTilingStore] Missing loaded level data for "${filename}".`)
        return {
          ...state,
          forcedFilenames: nextForcedFilenames,
        }
      }

      const span = resolveTileSpanMetrics(data)
      const zOffset = state.nextAttachWorldZ - span.spanZMax
      const nearWorldZ = zOffset + span.spanZMax
      const farWorldZ = zOffset + span.spanZMin

      const id = `seg-${state.segmentIdCounter}`
      const segment: LevelSegment = {
        id,
        filename,
        data,
        zOffset,
        centerOffsetZ: span.centerOffsetZ,
        spanZMin: span.spanZMin,
        spanZMax: span.spanZMax,
        nearWorldZ,
        farWorldZ,
      }

      if (import.meta.env.DEV && state.segments.length > 0) {
        const previousSegment = state.segments[state.segments.length - 1]
        if (previousSegment) {
          const edgeDelta = Math.abs(segment.nearWorldZ - previousSegment.farWorldZ)
          if (edgeDelta > SEGMENT_EDGE_EPSILON) {
            console.error('[levelTilingStore] Segment edge invariant broken (gap/overlap detected).', {
              previousId: previousSegment.id,
              nextId: segment.id,
              previousFarWorldZ: previousSegment.farWorldZ,
              nextNearWorldZ: segment.nearWorldZ,
              edgeDelta,
            })
          }
        }
      }

      return {
        ...state,
        segments: [...state.segments, segment],
        nextAttachWorldZ: farWorldZ,
        segmentIdCounter: state.segmentIdCounter + 1,
        runFileIndex: nextRunFileIndex,
        idleFileIndex: nextIdleFileIndex,
        forcedFilenames: nextForcedFilenames,
      }
    })
  },

  cullSegment: (id) => {
    set((state) => ({
      segments: state.segments.filter((s) => s.id !== id),
    }))
  },

  cullSegments: (ids) => {
    if (ids.length === 0) return
    const cullSet = new Set(ids)
    set((state) => ({
      segments: state.segments.filter((s) => !cullSet.has(s.id)),
    }))
  },

  rebaseNextAttachWorldZ: () => {
    set((state) => {
      if (state.segments.length === 0) return state

      let frontierZ = Number.POSITIVE_INFINITY
      for (let i = 0; i < state.segments.length; i += 1) {
        const segment = state.segments[i]
        if (!segment) continue
        if (segment.farWorldZ < frontierZ) frontierZ = segment.farWorldZ
      }
      if (!Number.isFinite(frontierZ) || state.nextAttachWorldZ === frontierZ) {
        return state
      }

      return {
        ...state,
        nextAttachWorldZ: frontierZ,
      }
    })
  },

  setNextAttachWorldZ: (z) => {
    if (!Number.isFinite(z)) return
    set((state) => ({
      ...state,
      nextAttachWorldZ: z,
    }))
  },
}))

export function getDefaultTileDepth(): number {
  return DEFAULT_TILE_DEPTH
}
