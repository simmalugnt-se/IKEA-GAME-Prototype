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
  scale?: Vec3
  props: Record<string, unknown>
  children?: LevelNode[]
}

export type LevelSceneMetrics = {
  highestVertexY: number | null
  tileCenterZ?: number
  tileSpanZMin?: number
  tileSpanZMax?: number
}

export type LevelData = {
  version: 6
  nodes: LevelNode[]
  /** World units per grid cell; used for debug grid and level layout. */
  unitSize?: number
  /** Grid dimensions [width, height] in cells; used for debug grid. */
  gridSize?: [number, number]
  /** Optional save-time metadata from levelbuilder. */
  sceneMetrics?: LevelSceneMetrics
}

const VALID_NODE_TYPES = new Set<string>(['object', 'effector'])

function validateLevelNode(raw: unknown, path: string): LevelNode | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`Invalid level node at ${path}: not an object`)
    return null
  }

  const node = raw as Record<string, unknown>

  if (typeof node.id !== 'string' || !node.id.trim()) {
    console.warn(`Invalid level node at ${path}: missing or empty id`)
    return null
  }

  if (typeof node.type !== 'string' || !node.type.trim()) {
    console.warn(`Invalid level node at ${path} (id: ${node.id}): missing or empty type`)
    return null
  }

  if (typeof node.nodeType !== 'string' || !VALID_NODE_TYPES.has(node.nodeType)) {
    console.warn(`Invalid level node at ${path} (id: ${node.id}): nodeType must be 'object' or 'effector', got '${String(node.nodeType)}'`)
    return null
  }

  const props = (node.props && typeof node.props === 'object') ? node.props as Record<string, unknown> : {}

  let children: LevelNode[] | undefined
  if (Array.isArray(node.children)) {
    children = node.children
      .map((child, i) => validateLevelNode(child, `${path}.children[${i}]`))
      .filter((c): c is LevelNode => c !== null)
  }

  return {
    id: node.id as string,
    nodeType: node.nodeType as 'object' | 'effector',
    type: node.type as string,
    builder: node.builder as LevelNode['builder'],
    position: node.position as Vec3 | undefined,
    rotation: node.rotation as Vec3 | undefined,
    scale: node.scale as Vec3 | undefined,
    props,
    children,
  }
}

export function parseLevelFileJson(raw: unknown): LevelData {
  const data = raw as Record<string, unknown>

  if (data.version !== 6) {
    throw new Error(`Unsupported level file version ${String(data.version)}, expected 6.`)
  }

  if (!Array.isArray(data.nodes)) {
    throw new Error('Invalid level format: missing nodes array')
  }

  const validatedNodes = data.nodes
    .map((node, i) => validateLevelNode(node, `nodes[${i}]`))
    .filter((n): n is LevelNode => n !== null)

  const result: LevelData = { version: 6, nodes: validatedNodes }
  if (typeof data.unitSize === 'number') result.unitSize = data.unitSize
  if (Array.isArray(data.gridSize) && data.gridSize.length >= 2 && typeof data.gridSize[0] === 'number' && typeof data.gridSize[1] === 'number') {
    result.gridSize = [data.gridSize[0], data.gridSize[1]]
  }
  if (data.sceneMetrics && typeof data.sceneMetrics === 'object') {
    const metrics = data.sceneMetrics as Record<string, unknown>
    const nextMetrics: LevelSceneMetrics = { highestVertexY: null }
    let hasMetrics = false

    if (metrics.highestVertexY === null) {
      nextMetrics.highestVertexY = null
      hasMetrics = true
    } else if (typeof metrics.highestVertexY === 'number' && Number.isFinite(metrics.highestVertexY)) {
      nextMetrics.highestVertexY = metrics.highestVertexY
      hasMetrics = true
    }

    if (typeof metrics.tileCenterZ === 'number' && Number.isFinite(metrics.tileCenterZ)) {
      nextMetrics.tileCenterZ = metrics.tileCenterZ
      hasMetrics = true
    }

    const hasSpanMin = typeof metrics.tileSpanZMin === 'number' && Number.isFinite(metrics.tileSpanZMin)
    const hasSpanMax = typeof metrics.tileSpanZMax === 'number' && Number.isFinite(metrics.tileSpanZMax)
    if (hasSpanMin) {
      nextMetrics.tileSpanZMin = metrics.tileSpanZMin as number
      hasMetrics = true
    }
    if (hasSpanMax) {
      nextMetrics.tileSpanZMax = metrics.tileSpanZMax as number
      hasMetrics = true
    }
    if (hasSpanMin && hasSpanMax) {
      const spanMin = metrics.tileSpanZMin as number
      const spanMax = metrics.tileSpanZMax as number
      if (!(spanMax > spanMin)) {
        delete nextMetrics.tileSpanZMin
        delete nextMetrics.tileSpanZMax
        console.error('[levelStore] Invalid sceneMetrics tile span: tileSpanZMax must be greater than tileSpanZMin.')
      }
    }

    if (hasMetrics) {
      result.sceneMetrics = nextMetrics
    }
  }
  return result
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

      set((state) => ({
        levelData: data,
        loading: false,
        error: null,
        // Force remount on every loaded level so mount-based randomness
        // (e.g. GridCloner unset seeds) and physics init are reapplied.
        levelReloadKey: state.levelReloadKey + 1,
      }))
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
