import { create } from 'zustand'
import type {
  MaterialColorIndex,
  SpawnEventActionTrackSweeper,
  Vec3,
} from '@/settings/GameSettings.types'

export type QueuedTrackSweeperRequest = {
  id: string
  action: SpawnEventActionTrackSweeper
}

export type ActiveTrackSweeperDescriptor = {
  id: string
  color: MaterialColorIndex
  position: Vec3
  rotation: Vec3
  linearVelocity: Vec3
  angularVelocity: Vec3
  radius: number
  height: number
  friction?: number
  restitution?: number
  linearDamping?: number
  angularDamping?: number
  lifetimeMs: number
  spawnedAtMs: number
}

type TrackSweeperStoreState = {
  queuedRequests: QueuedTrackSweeperRequest[]
  activeSweepers: ActiveTrackSweeperDescriptor[]
  enqueueRequest: (action: SpawnEventActionTrackSweeper) => void
  consumeRequests: () => QueuedTrackSweeperRequest[]
  addActiveSweepers: (sweepers: ActiveTrackSweeperDescriptor[]) => void
  removeActiveSweeper: (id: string) => void
  clearAll: () => void
}

let requestCounter = 0

function nextRequestId(): string {
  requestCounter += 1
  return `track-sweeper-${requestCounter}`
}

export const useTrackSweeperStore = create<TrackSweeperStoreState>((set, get) => ({
  queuedRequests: [],
  activeSweepers: [],

  enqueueRequest: (action) => {
    set((state) => ({
      queuedRequests: [...state.queuedRequests, { id: nextRequestId(), action }],
    }))
  },

  consumeRequests: () => {
    const requests = get().queuedRequests
    if (requests.length <= 0) return []
    set({ queuedRequests: [] })
    return requests
  },

  addActiveSweepers: (sweepers) => {
    if (sweepers.length <= 0) return
    set((state) => ({
      activeSweepers: [...state.activeSweepers, ...sweepers],
    }))
  },

  removeActiveSweeper: (id) => {
    set((state) => ({
      activeSweepers: state.activeSweepers.filter((sweeper) => sweeper.id !== id),
    }))
  },

  clearAll: () => {
    set({ queuedRequests: [], activeSweepers: [] })
  },
}))
