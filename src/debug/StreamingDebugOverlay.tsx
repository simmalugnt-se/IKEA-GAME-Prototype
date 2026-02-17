import * as THREE from 'three'
import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { SETTINGS } from '../GameSettings'
import type { PlayerHandle } from '../Player'
import type { ChunkActivationState, ChunkEntry } from '../streaming/ChunkStreamingSystem'

type StreamingDebugOverlayProps = {
  playerRef: RefObject<PlayerHandle | null>
  chunks: ChunkEntry[]
  chunkState: ChunkActivationState
}

export function StreamingDebugOverlay({ playerRef, chunks, chunkState }: StreamingDebugOverlayProps) {
  const showStreamingDebug = SETTINGS.debug.enabled && SETTINGS.debug.streaming.enabled
  const ringGroupRef = useRef<THREE.Group | null>(null)
  const streamingDebug = SETTINGS.debug.streaming
  const streaming = SETTINGS.streaming

  useFrame(() => {
    if (!showStreamingDebug || !streamingDebug.showRadii || !ringGroupRef.current || !playerRef.current) return
    const pos = playerRef.current.getPosition()
    if (!pos) return
    ringGroupRef.current.position.set(pos.x, 0, pos.z)
  })

  if (!showStreamingDebug) return null

  const chunksToDraw = streamingDebug.showAllChunkBounds
    ? chunks
    : chunks.filter((chunk) => (
      chunkState.preload.has(chunk.key)
      || chunkState.render.has(chunk.key)
      || chunkState.physics.has(chunk.key)
    ))

  const getChunkColor = (key: string): string => {
    if (chunkState.physics.has(key)) return '#ff4d4f'
    if (chunkState.render.has(key)) return '#4dabf7'
    if (chunkState.preload.has(key)) return '#ffd166'
    return '#666666'
  }

  return (
    <>
      {streamingDebug.showRadii && (
        <group ref={ringGroupRef}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} userData={{ excludeFromOutlines: true }}>
            <ringGeometry args={[Math.max(streaming.preloadRadius - 0.06, 0.01), streaming.preloadRadius + 0.06, 96]} />
            <meshBasicMaterial color="#ffd166" transparent opacity={0.6} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} userData={{ excludeFromOutlines: true }}>
            <ringGeometry args={[Math.max(streaming.renderLoadRadius - 0.06, 0.01), streaming.renderLoadRadius + 0.06, 96]} />
            <meshBasicMaterial color="#4dabf7" transparent opacity={0.65} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} userData={{ excludeFromOutlines: true }}>
            <ringGeometry args={[Math.max(streaming.physicsLoadRadius - 0.06, 0.01), streaming.physicsLoadRadius + 0.06, 96]} />
            <meshBasicMaterial color="#ff4d4f" transparent opacity={0.7} depthWrite={false} />
          </mesh>
        </group>
      )}

      {streamingDebug.showChunkBounds && chunksToDraw.map((chunk) => {
        const centerX = (chunk.minX + chunk.maxX) * 0.5
        const centerZ = (chunk.minZ + chunk.maxZ) * 0.5
        return (
          <mesh
            key={`chunk-debug-${chunk.key}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[centerX, 0.015, centerZ]}
            userData={{ excludeFromOutlines: true }}
          >
            <planeGeometry args={[streaming.cellSize, streaming.cellSize]} />
            <meshBasicMaterial color={getChunkColor(chunk.key)} wireframe transparent opacity={0.4} depthWrite={false} />
          </mesh>
        )
      })}
    </>
  )
}
