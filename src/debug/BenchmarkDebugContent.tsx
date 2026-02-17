import { useMemo, type RefObject } from 'react'
import { CubeElement } from '../SceneComponents'
import { SETTINGS, type PaletteName, type Vec3 } from '../GameSettings'
import type { PlayerHandle } from '../Player'
import {
  getChunkCoord,
  makeChunkKey,
  type ChunkEntry,
  useChunkStreamingState,
} from '../streaming/ChunkStreamingSystem'
import { StreamingDebugOverlay } from './StreamingDebugOverlay'

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

type BenchmarkDebugContentProps = {
  playerRef: RefObject<PlayerHandle | null>
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

export function BenchmarkDebugContent({ playerRef }: BenchmarkDebugContentProps) {
  const benchmarkBlocks = useMemo(() => buildBenchmarkBlocks(), [])
  const streamingEnabled = SETTINGS.streaming.enabled && benchmarkBlocks.length > 0

  const { chunkedBlocks, chunks } = useMemo(
    () => buildBenchmarkChunks(benchmarkBlocks, SETTINGS.streaming.cellSize),
    [benchmarkBlocks],
  )

  const chunkState = useChunkStreamingState({
    playerRef,
    chunks,
    enabled: streamingEnabled,
    config: SETTINGS.streaming,
  })

  return (
    <>
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

      <StreamingDebugOverlay playerRef={playerRef} chunks={chunks} chunkState={chunkState} />
    </>
  )
}
