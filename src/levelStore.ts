import { create } from 'zustand'
import type { Vec3 } from '@/settings/GameSettings'

export type LevelNode = {
  id: string
  nodeType: 'object' | 'effector'
  type: string
  builder?: {
    hiddenInBuilder?: boolean
    locked?: boolean
  }
  position?: Vec3
  rotation?: Vec3
  props: Record<string, unknown>
  children?: LevelNode[]
}

export type LevelData = {
  version: 5
  nodes: LevelNode[]
}

function parseLevelFileJson(raw: unknown): LevelData {
  const data = raw as Record<string, unknown>

  if (data.version !== 5) {
    throw new Error(`Unsupported level file version ${String(data.version)}, expected 5.`)
  }

  if (!Array.isArray(data.nodes)) {
    throw new Error('Invalid level format: missing nodes array')
  }

  return { version: 5, nodes: data.nodes as LevelNode[] }
}

type LevelStoreState = {
  levelData: LevelData | null
  loading: boolean
  error: string | null
  /** Incremented on reload so LevelRenderer remounts physics bodies. */
  levelReloadKey: number
  loadLevel: (filename: string) => Promise<void>
  setLevelData: (data: LevelData) => void
  /** Re-apply current level (deep clone) and remount to reset physics positions. */
  reloadCurrentLevel: () => void
}

export const useLevelStore = create<LevelStoreState>((set, get) => ({
  levelData: null,
  loading: false,
  error: null,
  levelReloadKey: 0,
  loadLevel: async (filename: string) => {
    set({ loading: true, error: null })
    try {
      const response = await fetch(`/levels/${filename}`)
      if (!response.ok) {
        throw new Error(`Failed to load level: ${response.status} ${response.statusText}`)
      }
      const raw: unknown = await response.json()
      const data = parseLevelFileJson(raw)

      set({ levelData: data, loading: false, error: null })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error loading level'
      set({ error: errorMessage, loading: false, levelData: null })
      console.error('Level loading error:', errorMessage)
    }
  },
  setLevelData: (data: LevelData) => {
    set({ levelData: data, loading: false, error: null })
  },
  reloadCurrentLevel: () => {
    const state = get()
    if (!state.levelData) return
    set({
      levelData: structuredClone(state.levelData),
      levelReloadKey: state.levelReloadKey + 1,
    })
  },
}))
