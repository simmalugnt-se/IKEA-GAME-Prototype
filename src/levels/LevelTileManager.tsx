import { memo, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { SETTINGS } from '@/settings/GameSettings'
import { useLevelTilingStore, getTileDepth, type LevelSegment } from '@/levels/levelTilingStore'
import { renderNode } from '@/LevelRenderer'

const SegmentGroup = memo(function SegmentGroup({ segment }: { segment: LevelSegment }) {
  return (
    <group position={[0, 0, segment.zOffset]}>
      {segment.data.nodes.map((node) => renderNode(node))}
    </group>
  )
})

function didCrossTarget(prev: number, current: number, target: number): boolean {
  const prevDelta = prev - target
  const currDelta = current - target
  if (prevDelta === 0 || currDelta === 0) return true
  return (prevDelta < 0 && currDelta > 0) || (prevDelta > 0 && currDelta < 0)
}

export function LevelTileManager() {
  const { camera } = useThree()
  const segments = useLevelTilingStore((state) => state.segments)
  const initialized = useLevelTilingStore((state) => state.initialized)
  const initialize = useLevelTilingStore((state) => state.initialize)
  const setSpawnMode = useLevelTilingStore((state) => state.setSpawnMode)
  const spawnNextSegment = useLevelTilingStore((state) => state.spawnNextSegment)
  const cullSegments = useLevelTilingStore((state) => state.cullSegments)
  const flowState = useGameplayStore((state) => state.flowState)
  const onGameOverTileCentered = useGameplayStore((state) => state.onGameOverTileCentered)

  const lastViewCenterZRef = useRef<number | null>(null)
  const centeredGameOverSegmentIdRef = useRef<string | null>(null)
  const cullIdsRef = useRef<string[]>([])

  const tiling = SETTINGS.level.tiling

  useEffect(() => {
    if (!tiling.enabled) return
    void initialize({
      runFiles: tiling.runFiles,
      idleFiles: tiling.idleFiles,
      gameOverFile: tiling.gameOverFile,
    })
  }, [
    initialize,
    tiling.enabled,
    tiling.gameOverFile,
    tiling.idleFiles,
    tiling.runFiles,
  ])

  useEffect(() => {
    if (!initialized) return
    if (flowState === 'run') {
      setSpawnMode('run', true)
      return
    }
    if (flowState === 'idle') {
      setSpawnMode('idle', true)
      return
    }
  }, [flowState, initialized, setSpawnMode])

  useFrame(() => {
    if (!tiling.enabled || !initialized) return

    // Tiling spawn/cull uses camera-derived center. If camera backtracking is allowed
    // (see SETTINGS.camera.follow.zClampMode), this center can move backwards and expose
    // already-culled segments. Keep this coupling explicit in camera settings.
    const followOffsetZ = SETTINGS.camera.mode === 'follow' ? SETTINGS.camera.follow.offset[2] : 0
    const viewCenterZ = camera.position.z - followOffsetZ
    const { lookAheadDistance, cullBehindDistance } = tiling

    const state = useLevelTilingStore.getState()
    const currentSegments = state.segments

    let frontierZ = 0
    if (currentSegments.length > 0) {
      frontierZ = Number.POSITIVE_INFINITY
      for (let i = 0; i < currentSegments.length; i += 1) {
        const segment = currentSegments[i]
        if (!segment) continue
        const farEdge = segment.zOffset - getTileDepth(segment.data)
        if (farEdge < frontierZ) frontierZ = farEdge
      }
    }

    if (frontierZ > viewCenterZ - lookAheadDistance) {
      spawnNextSegment()
    }

    const cullIds = cullIdsRef.current
    cullIds.length = 0
    for (let i = 0; i < currentSegments.length; i += 1) {
      const segment = currentSegments[i]
      if (!segment) continue
      const segmentFarEdge = segment.zOffset - getTileDepth(segment.data)
      if (segmentFarEdge > viewCenterZ + cullBehindDistance) {
        cullIds.push(segment.id)
      }
    }
    if (cullIds.length > 0) {
      cullSegments(cullIds)
      cullIds.length = 0
    }

    if (flowState !== 'game_over_travel') {
      centeredGameOverSegmentIdRef.current = null
      lastViewCenterZRef.current = viewCenterZ
      return
    }

    const gameOverFilename = tiling.gameOverFile
    const prevViewCenterZ = lastViewCenterZRef.current
    if (prevViewCenterZ !== null) {
      for (let i = 0; i < currentSegments.length; i += 1) {
        const segment = currentSegments[i]
        if (!segment || segment.filename !== gameOverFilename) continue
        if (centeredGameOverSegmentIdRef.current === segment.id) continue

        const segmentCenterZ = segment.zOffset - getTileDepth(segment.data) * 0.5
        if (!didCrossTarget(prevViewCenterZ, viewCenterZ, segmentCenterZ)) continue

        centeredGameOverSegmentIdRef.current = segment.id
        onGameOverTileCentered()
        break
      }
    }

    lastViewCenterZRef.current = viewCenterZ
  })

  if (!tiling.enabled) return null
  if (!initialized || segments.length === 0) return null

  return (
    <>
      {segments.map((segment) => (
        <SegmentGroup key={segment.id} segment={segment} />
      ))}
    </>
  )
}
