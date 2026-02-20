import { create } from 'zustand'
import type { Vec3 } from './GameSettings'

export type LevelObject = {
  id: string
  type: string
  position: Vec3
  rotation: Vec3
  props: Record<string, unknown>
}

export type LevelData = {
  version: number
  objects: LevelObject[]
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
      const data: LevelData = await response.json()
      
      // Validate basic structure
      if (!data.objects || !Array.isArray(data.objects)) {
        throw new Error('Invalid level format: missing or invalid objects array')
      }
      
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
