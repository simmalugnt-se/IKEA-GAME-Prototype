import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { WorldPosition } from '@/scene/TargetAnchor'

export type ChunkEntry = {
  key: string
  cx: number
  cz: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export type ChunkActivationState = {
  preload: Set<string>
  render: Set<string>
  physics: Set<string>
}

export type ChunkStreamingConfig = {
  updateIntervalMs: number
  preloadRadius: number
  renderLoadRadius: number
  renderUnloadRadius: number
  physicsLoadRadius: number
  physicsUnloadRadius: number
}

type UseChunkStreamingStateParams = {
  getCenterPosition: () => WorldPosition | undefined
  chunks: ChunkEntry[]
  enabled: boolean
  config: ChunkStreamingConfig
}

function createInitialChunkState(chunks: ChunkEntry[], enabled: boolean): ChunkActivationState {
  if (enabled) {
    return {
      preload: new Set<string>(),
      render: new Set<string>(),
      physics: new Set<string>(),
    }
  }

  const allChunkKeys = new Set(chunks.map((chunk) => chunk.key))
  return {
    preload: new Set(allChunkKeys),
    render: new Set(allChunkKeys),
    physics: new Set(allChunkKeys),
  }
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

export function makeChunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

export function getChunkCoord(value: number, cellSize: number): number {
  return Math.floor(value / cellSize)
}

export function distanceToChunkXZ(px: number, pz: number, chunk: ChunkEntry): number {
  const dx = Math.max(chunk.minX - px, 0, px - chunk.maxX)
  const dz = Math.max(chunk.minZ - pz, 0, pz - chunk.maxZ)
  return Math.sqrt(dx * dx + dz * dz)
}

export function useChunkStreamingState({
  getCenterPosition,
  chunks,
  enabled,
  config,
}: UseChunkStreamingStateParams): ChunkActivationState {
  const [chunkState, setChunkState] = useState<ChunkActivationState>(() => createInitialChunkState(chunks, enabled))
  const chunkStateRef = useRef<ChunkActivationState>(chunkState)
  const updateTimerMsRef = useRef(config.updateIntervalMs)

  useEffect(() => {
    const nextState = createInitialChunkState(chunks, enabled)
    chunkStateRef.current = nextState
    updateTimerMsRef.current = config.updateIntervalMs

    const frame = requestAnimationFrame(() => {
      setChunkState(nextState)
    })

    return () => cancelAnimationFrame(frame)
  }, [chunks, enabled, config.updateIntervalMs])

  useFrame((_state, delta) => {
    if (!enabled) return

    updateTimerMsRef.current += delta * 1000
    if (updateTimerMsRef.current < config.updateIntervalMs) return
    updateTimerMsRef.current = 0

    const pos = getCenterPosition()
    if (!pos) return

    const previous = chunkStateRef.current
    const nextPreload = new Set(previous.preload)
    const nextRender = new Set(previous.render)
    const nextPhysics = new Set(previous.physics)

    chunks.forEach((chunk) => {
      const dist = distanceToChunkXZ(pos.x, pos.z, chunk)
      const key = chunk.key

      if (dist <= config.preloadRadius) nextPreload.add(key)
      else nextPreload.delete(key)

      if (nextRender.has(key)) {
        if (dist > config.renderUnloadRadius) nextRender.delete(key)
      } else if (dist <= config.renderLoadRadius) {
        nextRender.add(key)
      }

      if (nextPhysics.has(key)) {
        if (dist > config.physicsUnloadRadius) nextPhysics.delete(key)
      } else if (dist <= config.physicsLoadRadius) {
        nextPhysics.add(key)
      }
    })

    nextPhysics.forEach((key) => nextRender.add(key))

    const changed = (
      !areSetsEqual(previous.preload, nextPreload)
      || !areSetsEqual(previous.render, nextRender)
      || !areSetsEqual(previous.physics, nextPhysics)
    )
    if (!changed) return

    const nextState: ChunkActivationState = {
      preload: nextPreload,
      render: nextRender,
      physics: nextPhysics,
    }
    chunkStateRef.current = nextState
    setChunkState(nextState)
  })

  return chunkState
}
