import { create } from 'zustand'
import type {
  GroundBallEntrySide,
  MaterialColorIndex,
  SpawnEventActionGroundBallWave,
  SpawnEventBallSizePreset,
  Vec3,
} from '@/settings/GameSettings.types'

export type QueuedGroundBallWaveRequest = {
  id: string
  action: SpawnEventActionGroundBallWave
}

export type ActiveGroundBallDescriptor = {
  id: string
  color: MaterialColorIndex
  sizePreset: SpawnEventBallSizePreset
  position: Vec3
  linearVelocity: Vec3
  mass?: number
  friction?: number
  restitution?: number
  linearDamping?: number
  angularDamping?: number
  lifetimeMs: number
  spawnedAtMs: number
}

type GroundBallWaveStoreState = {
  queuedRequests: QueuedGroundBallWaveRequest[]
  activeBalls: ActiveGroundBallDescriptor[]
  enqueueWaveRequest: (action: SpawnEventActionGroundBallWave) => void
  consumeWaveRequests: () => QueuedGroundBallWaveRequest[]
  addActiveBalls: (balls: ActiveGroundBallDescriptor[]) => void
  removeActiveBall: (id: string) => void
  clearAll: () => void
}

let waveRequestCounter = 0

function nextWaveRequestId(): string {
  waveRequestCounter += 1
  return `ground-ball-wave-${waveRequestCounter}`
}

export const useGroundBallWaveStore = create<GroundBallWaveStoreState>((set, get) => ({
  queuedRequests: [],
  activeBalls: [],

  enqueueWaveRequest: (action) => {
    set((state) => ({
      queuedRequests: [...state.queuedRequests, { id: nextWaveRequestId(), action }],
    }))
  },

  consumeWaveRequests: () => {
    const requests = get().queuedRequests
    if (requests.length <= 0) return []
    set({ queuedRequests: [] })
    return requests
  },

  addActiveBalls: (balls) => {
    if (balls.length <= 0) return
    set((state) => ({
      activeBalls: [...state.activeBalls, ...balls],
    }))
  },

  removeActiveBall: (id) => {
    set((state) => ({
      activeBalls: state.activeBalls.filter((ball) => ball.id !== id),
    }))
  },

  clearAll: () => {
    set({ queuedRequests: [], activeBalls: [] })
  },
}))
