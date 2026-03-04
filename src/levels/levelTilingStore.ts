import { create } from 'zustand'
import type { LevelData } from '@/levelStore'
import { parseLevelFileJson } from '@/levelStore'

const DEFAULT_TILE_DEPTH = 12.8

export type LevelSpawnMode = 'idle' | 'run'

export type LevelSegment = {
  id: string
  filename: string
  data: LevelData
  zOffset: number
}

export type LevelTilingInitializeConfig = {
  runFiles: string[]
  idleFiles: string[]
  gameOverFile: string
}

export function getTileDepth(data: LevelData): number {
  const unitSize = data.unitSize ?? 0.1
  const gridZ = data.gridSize?.[1] ?? 128
  return gridZ * unitSize
}

type LevelTilingState = {
  availableLevels: Map<string, LevelData>
  segments: LevelSegment[]
  nextZOffset: number
  segmentIdCounter: number
  initialized: boolean
  error: string | null
  runFiles: string[]
  idleFiles: string[]
  gameOverFile: string
  spawnMode: LevelSpawnMode
  runFileIndex: number
  idleFileIndex: number
  forcedNextFilename: string | null
  initialize: (config: LevelTilingInitializeConfig) => Promise<void>
  setSpawnMode: (mode: LevelSpawnMode, resetIndex?: boolean) => void
  queueForcedNextTile: (filename: string) => void
  spawnNextSegment: () => void
  cullSegment: (id: string) => void
  cullSegments: (ids: string[]) => void
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
  const gameOverFile = typeof config.gameOverFile === 'string'
    ? config.gameOverFile.trim()
    : ''

  for (let i = 0; i < runFiles.length; i += 1) {
    set.add(runFiles[i]!)
  }
  for (let i = 0; i < idleFiles.length; i += 1) {
    set.add(idleFiles[i]!)
  }
  if (gameOverFile) set.add(gameOverFile)

  return Array.from(set)
}

export const useLevelTilingStore = create<LevelTilingState>((set, get) => ({
  availableLevels: new Map(),
  segments: [],
  nextZOffset: 0,
  segmentIdCounter: 0,
  initialized: false,
  error: null,
  runFiles: [],
  idleFiles: [],
  gameOverFile: '',
  spawnMode: 'idle',
  runFileIndex: 0,
  idleFileIndex: 0,
  forcedNextFilename: null,

  initialize: async (config) => {
    const runFiles = normalizeFileList(config.runFiles)
    const idleFiles = normalizeFileList(config.idleFiles)
    const gameOverFile = typeof config.gameOverFile === 'string'
      ? config.gameOverFile.trim()
      : ''

    const filesToLoad = getUnionFileList(config)
    if (filesToLoad.length === 0) {
      set({
        availableLevels: new Map(),
        initialized: true,
        error: 'No level files configured for tiling',
        runFiles,
        idleFiles,
        gameOverFile,
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
          gameOverFile,
        })
        console.error('Level tiling load error:', msg)
        return
      }
    }

    set((state) => ({
      availableLevels: next,
      segments: state.initialized ? state.segments : [],
      nextZOffset: state.initialized ? state.nextZOffset : 0,
      segmentIdCounter: state.initialized ? state.segmentIdCounter : 0,
      initialized: true,
      error: null,
      runFiles,
      idleFiles,
      gameOverFile,
      runFileIndex: 0,
      idleFileIndex: 0,
      forcedNextFilename: state.forcedNextFilename,
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

  queueForcedNextTile: (filename) => {
    const value = typeof filename === 'string' ? filename.trim() : ''
    if (!value) {
      console.error('[levelTilingStore] queueForcedNextTile called with empty filename.')
      return
    }
    set({ forcedNextFilename: value })
  },

  spawnNextSegment: () => {
    set((state) => {
      if (state.availableLevels.size === 0) return state

      let nextRunFileIndex = state.runFileIndex
      let nextIdleFileIndex = state.idleFileIndex
      let nextForcedFilename: string | null = state.forcedNextFilename
      let filename: string | null = null

      if (nextForcedFilename) {
        filename = nextForcedFilename
        nextForcedFilename = null
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
          forcedNextFilename: nextForcedFilename,
        }
      }

      const depth = getTileDepth(data)
      const id = `seg-${state.segmentIdCounter}`
      const segment: LevelSegment = {
        id,
        filename,
        data,
        zOffset: state.nextZOffset,
      }

      return {
        ...state,
        segments: [...state.segments, segment],
        nextZOffset: state.nextZOffset - depth,
        segmentIdCounter: state.segmentIdCounter + 1,
        runFileIndex: nextRunFileIndex,
        idleFileIndex: nextIdleFileIndex,
        forcedNextFilename: nextForcedFilename,
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
}))

export function getDefaultTileDepth(): number {
  return DEFAULT_TILE_DEPTH
}
