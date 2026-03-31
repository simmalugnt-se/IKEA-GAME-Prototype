import { create } from 'zustand'
import { SETTINGS } from '@/settings/GameSettings'
import type { QueuedSpawnRequest } from '@/gameplay/spawnItemSettings'
import type { SpawnItemDefinition } from '@/settings/GameSettings.types'

export type SpawnedItemDescriptor = {
  id: string
  itemId: string
  spawnItem: SpawnItemDefinition
  radius: number
  templateIndex: number
  position: [number, number, number]
}

type PoolSlot = {
  active: boolean
  descriptor: SpawnedItemDescriptor
}

function normalizePoolSize(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return Math.max(1, Math.trunc(fallback))
  return Math.max(1, Math.trunc(value))
}

function createPool(size: number): PoolSlot[] {
  const normalizedSize = normalizePoolSize(size, 1)
  return Array.from({ length: normalizedSize }, () => ({
    active: false,
    descriptor: {
      id: '',
      itemId: '',
      spawnItem: {
        id: '',
        label: '',
        enabled: false,
        includeInDefaultPool: false,
        weight: 0,
        color: 0,
        randomizeColor: false,
        randomizeDropType: false,
        dropType: 'block',
        lifeLossEnabled: false,
        scoreMode: 'balloon_combo',
        scoreDelta: 0,
        timeDeltaMs: 0,
      },
      radius: 0,
      templateIndex: 0,
      position: [0, 0, 0],
    },
  }))
}

function ensurePoolCapacity(pool: PoolSlot[], targetSize: number): void {
  const normalizedTargetSize = normalizePoolSize(targetSize, pool.length)
  while (pool.length < normalizedTargetSize) {
    pool.push({
      active: false,
      descriptor: {
        id: '',
        itemId: '',
        spawnItem: {
          id: '',
          label: '',
          enabled: false,
          includeInDefaultPool: false,
          weight: 0,
          color: 0,
          randomizeColor: false,
          randomizeDropType: false,
          dropType: 'block',
          lifeLossEnabled: false,
          scoreMode: 'balloon_combo',
          scoreDelta: 0,
          timeDeltaMs: 0,
        },
        radius: 0,
        templateIndex: 0,
        position: [0, 0, 0],
      },
    })
  }
}

type SpawnerState = {
  pool: PoolSlot[]
  activeCount: number
  epoch: number
  items: SpawnedItemDescriptor[]
  queuedSpawns: QueuedSpawnRequest[]
  addItem: (descriptor: SpawnedItemDescriptor, maxActiveItems?: number) => boolean
  removeItem: (id: string) => void
  enqueueSpawns: (requests: QueuedSpawnRequest[]) => void
  consumeQueuedSpawns: (maxCount: number) => QueuedSpawnRequest[]
  clearAll: () => void
}

function deriveItems(pool: PoolSlot[]): SpawnedItemDescriptor[] {
  const result: SpawnedItemDescriptor[] = []
  for (const slot of pool) {
    if (slot.active) result.push(slot.descriptor)
  }
  return result
}

export const useSpawnerStore = create<SpawnerState>((set, get) => ({
  pool: createPool(SETTINGS.spawner.maxItemsCap),
  activeCount: 0,
  epoch: 0,
  items: [],
  queuedSpawns: [],

  addItem: (descriptor, maxActiveItems) => {
    const state = get()
    const maxActive = normalizePoolSize(maxActiveItems, SETTINGS.spawner.maxItems)
    if (state.activeCount >= maxActive) return false
    ensurePoolCapacity(state.pool, SETTINGS.spawner.maxItemsCap)

    const slot = state.pool.find((s) => !s.active)
    if (!slot) return false

    slot.active = true
    slot.descriptor.id = descriptor.id
    slot.descriptor.itemId = descriptor.itemId
    slot.descriptor.spawnItem = descriptor.spawnItem
    slot.descriptor.radius = descriptor.radius
    slot.descriptor.templateIndex = descriptor.templateIndex
    slot.descriptor.position = descriptor.position

    set({
      activeCount: state.activeCount + 1,
      epoch: state.epoch + 1,
      items: deriveItems(state.pool),
    })
    return true
  },

  removeItem: (id) => {
    const state = get()
    const slot = state.pool.find((s) => s.active && s.descriptor.id === id)
    if (!slot) return

    slot.active = false

    set({
      activeCount: state.activeCount - 1,
      epoch: state.epoch + 1,
      items: deriveItems(state.pool),
    })
  },

  enqueueSpawns: (requests) => {
    if (requests.length <= 0) return
    set((state) => ({
      queuedSpawns: [...state.queuedSpawns, ...requests],
    }))
  },

  consumeQueuedSpawns: (maxCount) => {
    const state = get()
    const normalizedCount = Math.max(0, Math.trunc(maxCount))
    if (normalizedCount <= 0 || state.queuedSpawns.length <= 0) return []

    const consumed = state.queuedSpawns.slice(0, normalizedCount)
    set({
      queuedSpawns: state.queuedSpawns.slice(consumed.length),
    })
    return consumed
  },

  clearAll: () => {
    const state = get()
    for (const slot of state.pool) {
      slot.active = false
    }
    set({ activeCount: 0, epoch: state.epoch + 1, items: [], queuedSpawns: [] })
  },
}))
