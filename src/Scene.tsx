import * as THREE from 'three'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { Physics } from '@react-three/rapier'
import { KeyboardControls, Stats, type KeyboardControlsEntry } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CubeElement, CylinderElement, SplineElement, InvisibleFloor } from './SceneComponents'
import { Player, type PlayerHandle } from './Player'
import { SplineAndAnimTest } from './assets/models/SplineAndAnimTest'
import { GameEffects } from './Effects'
import { CameraFollow } from './CameraFollow'
import { SETTINGS, type PaletteName, type Vec3 } from './GameSettings'

type ControlName = 'forward' | 'backward' | 'left' | 'right' | 'jump'

const keyboardMap: KeyboardControlsEntry<ControlName>[] = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
]

const isDebug = SETTINGS.debug.enabled
const benchmarkColors: PaletteName[] = ['one', 'two', 'three', 'four', 'five']

type BenchmarkBlock = {
  id: string
  size: Vec3
  position: Vec3
  rotation: Vec3
  color: PaletteName
  physics?: 'fixed'
}

type ChunkedBenchmarkBlock = BenchmarkBlock & {
  chunkKey: string
}

type ChunkEntry = {
  key: string
  cx: number
  cz: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

type ChunkActivationState = {
  preload: Set<string>
  render: Set<string>
  physics: Set<string>
}

function buildBenchmarkBlocks(): BenchmarkBlock[] {
  const { benchmark } = SETTINGS.debug
  if (!benchmark.enabled) return []

  const blocks: BenchmarkBlock[] = []
  let index = 0

  for (let layer = 0; layer < benchmark.layers; layer++) {
    for (let x = 0; x < benchmark.gridX; x++) {
      for (let z = 0; z < benchmark.gridZ; z++) {
        const sizeX = 0.55 + ((x + layer) % 3) * 0.15
        const sizeY = 0.2 + (layer % 2) * 0.08
        const sizeZ = 0.55 + ((z + layer) % 3) * 0.15
        const rotationY = ((x * 13 + z * 7 + layer * 17) % 45) - 22
        const color = benchmarkColors[(x + z + layer) % benchmarkColors.length]

        const position: Vec3 = [
          benchmark.origin[0] + x * benchmark.spacing,
          benchmark.origin[1] + 0.15 + (layer * benchmark.heightStep),
          benchmark.origin[2] + z * benchmark.spacing,
        ]

        const block: BenchmarkBlock = {
          id: `bench-${layer}-${x}-${z}`,
          size: [sizeX, sizeY, sizeZ],
          position,
          rotation: [0, rotationY, 0],
          color,
        }

        const shouldHaveFixedPhysics = benchmark.usePhysics
          && benchmark.fixedColliderEvery > 0
          && index % benchmark.fixedColliderEvery === 0
        if (shouldHaveFixedPhysics) block.physics = 'fixed'

        blocks.push(block)
        index++
      }
    }
  }

  return blocks
}

function makeChunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

function getChunkCoord(value: number, cellSize: number): number {
  return Math.floor(value / cellSize)
}

function buildBenchmarkChunks(blocks: BenchmarkBlock[], cellSize: number): {
  chunkedBlocks: ChunkedBenchmarkBlock[]
  chunks: ChunkEntry[]
} {
  const chunkMap = new Map<string, ChunkEntry>()
  const chunkedBlocks: ChunkedBenchmarkBlock[] = blocks.map((block) => {
    const cx = getChunkCoord(block.position[0], cellSize)
    const cz = getChunkCoord(block.position[2], cellSize)
    const key = makeChunkKey(cx, cz)

    if (!chunkMap.has(key)) {
      chunkMap.set(key, {
        key,
        cx,
        cz,
        minX: cx * cellSize,
        maxX: (cx + 1) * cellSize,
        minZ: cz * cellSize,
        maxZ: (cz + 1) * cellSize,
      })
    }

    return { ...block, chunkKey: key }
  })

  return {
    chunkedBlocks,
    chunks: Array.from(chunkMap.values()),
  }
}

function distanceToChunkXZ(px: number, pz: number, chunk: ChunkEntry): number {
  const dx = Math.max(chunk.minX - px, 0, px - chunk.maxX)
  const dz = Math.max(chunk.minZ - pz, 0, pz - chunk.maxZ)
  return Math.sqrt(dx * dx + dz * dz)
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) {
    if (!b.has(value)) return false
  }
  return true
}

type StreamingDebugViewProps = {
  playerRef: RefObject<PlayerHandle | null>
  chunks: ChunkEntry[]
  chunkState: ChunkActivationState
}

function StreamingDebugView({ playerRef, chunks, chunkState }: StreamingDebugViewProps) {
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

export function Scene() {
  const playerRef = useRef<PlayerHandle | null>(null)
  const benchmarkBlocks = useMemo(() => buildBenchmarkBlocks(), [])
  const streamingEnabled = SETTINGS.streaming.enabled && benchmarkBlocks.length > 0

  const { chunkedBlocks, chunks } = useMemo(
    () => buildBenchmarkChunks(benchmarkBlocks, SETTINGS.streaming.cellSize),
    [benchmarkBlocks],
  )

  const initialChunkState = useMemo<ChunkActivationState>(() => {
    if (streamingEnabled) {
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
  }, [chunks, streamingEnabled])

  const [chunkState, setChunkState] = useState<ChunkActivationState>(initialChunkState)
  const chunkStateRef = useRef<ChunkActivationState>(chunkState)
  const updateTimerMsRef = useRef(SETTINGS.streaming.updateIntervalMs)

  useFrame((_state, delta) => {
    if (!streamingEnabled || !playerRef.current) return

    updateTimerMsRef.current += delta * 1000
    if (updateTimerMsRef.current < SETTINGS.streaming.updateIntervalMs) return
    updateTimerMsRef.current = 0

    const pos = playerRef.current.getPosition()
    if (!pos) return

    const previous = chunkStateRef.current
    const nextPreload = new Set(previous.preload)
    const nextRender = new Set(previous.render)
    const nextPhysics = new Set(previous.physics)

    chunks.forEach((chunk) => {
      const dist = distanceToChunkXZ(pos.x, pos.z, chunk)
      const key = chunk.key

      if (dist <= SETTINGS.streaming.preloadRadius) nextPreload.add(key)
      else nextPreload.delete(key)

      if (nextRender.has(key)) {
        if (dist > SETTINGS.streaming.renderUnloadRadius) nextRender.delete(key)
      } else if (dist <= SETTINGS.streaming.renderLoadRadius) {
        nextRender.add(key)
      }

      if (nextPhysics.has(key)) {
        if (dist > SETTINGS.streaming.physicsUnloadRadius) nextPhysics.delete(key)
      } else if (dist <= SETTINGS.streaming.physicsLoadRadius) {
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

  return (
    <KeyboardControls map={keyboardMap}>
      <Physics gravity={[0, -9.81, 0]} debug={isDebug && SETTINGS.debug.showColliders}>
        <GameEffects />
        <CameraFollow playerRef={playerRef} />

        {/* SPELAREN */}
        <Player ref={playerRef} position={[0.1, 0.27, 1.3]} />

        {/* --- NIVÅN --- */}

        {/* BLÅ RAMP */}
        <CubeElement
          size={[0.5, 2, 0.03]}
          color="two"
          physics="dynamic"
          position={[0.1, 0.5, 0.75]}
          rotation={[-61, 0, 0]}
          mass={0.3}
          friction={3}
        />

        {/* VINRÖDA ELEMENT */}
        <CubeElement
          size={[1.1, 0.48, 0.03]}
          physics="dynamic"
          position={[0.2, 0.24, 0.65]}
          mass={0.2}
          friction={0.5}
          lockRotations
        />

        <CubeElement
          size={[0.5, 1, 0.03]}
          physics="dynamic"
          position={[0.8, 0, 0]}
          mass={0.3}
        />

        {/* CYLINDER */}
        <CylinderElement
          radius={0.3}
          height={0.2}
          physics="dynamic"
          position={[2, 0.5, 0]}
          rotation={[90, 0, 0]}
          colliderSegments={16}
        />

        <SplineElement
          points={[
            [-1, 0.2, -0.5],
            [-0.3, 0.5, 0],
            [0.5, 0.15, 0.3],
            [1.3, 0.4, -0.2],
          ]}
          position={[0.5, 0.5, 1]}
          segments={40}
          physics="dynamic"
          friction={1}
        />

        {/* FBX PIPELINE TEST */}
        <SplineAndAnimTest position={[0, 2, -3]} scale={0.01} animation="Anim1" />

        {/* DEBUG BENCHMARK + STREAMING */}
        {chunkedBlocks.map((block) => {
          if (streamingEnabled && !chunkState.render.has(block.chunkKey)) return null
          const physics = streamingEnabled && !chunkState.physics.has(block.chunkKey)
            ? undefined
            : block.physics
          return (
            <CubeElement
              key={block.id}
              size={block.size}
              color={block.color}
              physics={physics}
              position={block.position}
              rotation={block.rotation}
            />
          )
        })}

        <StreamingDebugView playerRef={playerRef} chunks={chunks} chunkState={chunkState} />

        <InvisibleFloor />
      </Physics>

      {/* Debug: FPS / MS / MB overlay */}
      {isDebug && SETTINGS.debug.showStats && <Stats />}
    </KeyboardControls>
  )
}
