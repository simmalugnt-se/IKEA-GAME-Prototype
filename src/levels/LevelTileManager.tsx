import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useCameraSystem } from '@/camera/CameraSystemContext'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { getFrustumCornersOnFloor } from '@/gameplay/frustumBounds'
import { SETTINGS } from '@/settings/GameSettings'
import { resolveTileSpanMetrics, useLevelTilingStore, type LevelSegment, type LevelSpawnMode } from '@/levels/levelTilingStore'
import { renderNode } from '@/LevelRenderer'
import * as THREE from 'three'

const SegmentGroup = memo(function SegmentGroup({
  segment,
}: {
  segment: LevelSegment
}) {
  const groupRef = useRef<THREE.Group | null>(null)

  useLayoutEffect(() => {
    if (!TILING_DEBUG) return
    const group = groupRef.current
    if (!group) return
    group.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(group)
    if (bounds.isEmpty()) return
    console.info('[LevelTileManager] Measured segment bounds', {
      segmentId: segment.id,
      filename: segment.filename,
      zOffset: roundDebug(segment.zOffset),
      measuredWorldMinZ: roundDebug(bounds.min.z),
      measuredWorldMaxZ: roundDebug(bounds.max.z),
      measuredLocalMinZ: roundDebug(bounds.min.z - segment.zOffset),
      measuredLocalMaxZ: roundDebug(bounds.max.z - segment.zOffset),
      measuredDepth: roundDebug(bounds.max.z - bounds.min.z),
      configuredNearWorldZ: roundDebug(segment.nearWorldZ),
      configuredFarWorldZ: roundDebug(segment.farWorldZ),
      configuredDepth: roundDebug(segment.nearWorldZ - segment.farWorldZ),
    })
  }, [segment.filename, segment.farWorldZ, segment.id, segment.nearWorldZ, segment.zOffset])

  return (
    <group ref={groupRef} position={[0, 0, segment.zOffset]}>
      {segment.data.nodes.map((node) => renderNode(node, false, segment.id))}
    </group>
  )
})

function didCrossTarget(prev: number, current: number, target: number): boolean {
  const prevDelta = prev - target
  const currDelta = current - target
  if (prevDelta === 0 || currDelta === 0) return true
  return (prevDelta < 0 && currDelta > 0) || (prevDelta > 0 && currDelta < 0)
}

function computeFrontierZ(segments: LevelSegment[]): number {
  if (segments.length === 0) return 0
  let frontierZ = Number.POSITIVE_INFINITY
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (!segment) continue
    if (segment.farWorldZ < frontierZ) frontierZ = segment.farWorldZ
  }
  return frontierZ
}

const GAME_OVER_ENTRY_CULL_FRONT_PADDING = 0.25
const GAME_OVER_ENTRY_CULL_BACK_PADDING = 0.25
const TILING_DEBUG = import.meta.env.DEV

function roundDebug(value: number): number {
  return Number(value.toFixed(2))
}

export function LevelTileManager() {
  const { camera, viewport } = useThree()
  const { getCameraFocus, getTargetPosition } = useCameraSystem()
  const segments = useLevelTilingStore((state) => state.segments)
  const initialized = useLevelTilingStore((state) => state.initialized)
  const initialize = useLevelTilingStore((state) => state.initialize)
  const setSpawnMode = useLevelTilingStore((state) => state.setSpawnMode)
  const spawnNextSegment = useLevelTilingStore((state) => state.spawnNextSegment)
  const cullSegments = useLevelTilingStore((state) => state.cullSegments)
  const rebaseNextAttachWorldZ = useLevelTilingStore((state) => state.rebaseNextAttachWorldZ)
  const setNextAttachWorldZ = useLevelTilingStore((state) => state.setNextAttachWorldZ)

  const flowState = useGameplayStore((state) => state.flowState)
  const gameOverTravelTargetZ = useGameplayStore((state) => state.gameOverTravelTargetZ)
  const onGameOverTileCentered = useGameplayStore((state) => state.onGameOverTileCentered)
  const setGameOverTravelTargetZ = useGameplayStore((state) => state.setGameOverTravelTargetZ)

  const lastTravelZRef = useRef<number | null>(null)
  const gameOverCenterTriggeredRef = useRef(false)
  const missingGameOverConfigLoggedRef = useRef(false)
  const previousFlowStateRef = useRef(flowState)
  const deferredSpawnModeRef = useRef<LevelSpawnMode | null>(null)
  const cullIdsRef = useRef<string[]>([])
  const lastSpawnAtMsRef = useRef<number | null>(null)
  const lastHeartbeatAtMsRef = useRef<number>(0)
  const loadedConfigLoggedRef = useRef(false)

  const tiling = SETTINGS.level.tiling
  useEffect(() => {
    if (!tiling.enabled) return
    void initialize({
      runFiles: tiling.runFiles,
      idleFiles: tiling.idleFiles,
      gameOverFiles: tiling.gameOverFiles,
    })
  }, [
    initialize,
    tiling.enabled,
    tiling.gameOverFiles,
    tiling.idleFiles,
    tiling.runFiles,
  ])

  useEffect(() => {
    if (!TILING_DEBUG || !initialized || loadedConfigLoggedRef.current) return
    const state = useLevelTilingStore.getState()
    const files = Array.from(state.availableLevels.keys())
    const spans = files.map((filename) => {
      const data = state.availableLevels.get(filename)
      if (!data) return null
      const span = resolveTileSpanMetrics(data)
      return {
        filename,
        centerOffsetZ: roundDebug(span.centerOffsetZ),
        spanZMin: roundDebug(span.spanZMin),
        spanZMax: roundDebug(span.spanZMax),
        depth: roundDebug(span.spanZMax - span.spanZMin),
      }
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    console.info('[LevelTileManager] Loaded tiling config', {
      runFiles: tiling.runFiles,
      idleFiles: tiling.idleFiles,
      gameOverFiles: tiling.gameOverFiles,
      lookAheadDistance: tiling.lookAheadDistance,
      cullBehindDistance: tiling.cullBehindDistance,
      spans,
    })
    loadedConfigLoggedRef.current = true
  }, [
    initialized,
    tiling.cullBehindDistance,
    tiling.gameOverFiles,
    tiling.idleFiles,
    tiling.lookAheadDistance,
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
    }
  }, [flowState, initialized, setSpawnMode])

  useFrame(() => {
    if (!tiling.enabled || !initialized) return

    const cameraFocus = getCameraFocus()
    const followOffsetZ = SETTINGS.camera.mode === 'follow' ? SETTINGS.camera.follow.offset[2] : 0
    const viewCenterZ = cameraFocus?.z ?? (camera.position.z - followOffsetZ)
    const followTargetId = SETTINGS.camera.follow.targetId
    const travelZ = getTargetPosition(followTargetId)?.z ?? cameraFocus?.z ?? viewCenterZ

    const { lookAheadDistance, cullBehindDistance } = tiling
    let frontVisibleZ: number
    let backVisibleZ: number
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const corners = getFrustumCornersOnFloor(camera as THREE.OrthographicCamera)
      if (corners) {
        let minZ = corners[0]!.z
        let maxZ = corners[0]!.z
        for (let i = 1; i < corners.length; i += 1) {
          const z = corners[i]!.z
          if (z < minZ) minZ = z
          if (z > maxZ) maxZ = z
        }
        frontVisibleZ = minZ
        backVisibleZ = maxZ
      } else {
        const visibleHalfDepth = Math.max(0, Math.hypot(viewport.height, viewport.width) * 0.5)
        frontVisibleZ = viewCenterZ - visibleHalfDepth
        backVisibleZ = viewCenterZ + visibleHalfDepth
      }
    } else {
      const visibleHalfDepth = Math.max(0, Math.hypot(viewport.height, viewport.width) * 0.5)
      frontVisibleZ = viewCenterZ - visibleHalfDepth
      backVisibleZ = viewCenterZ + visibleHalfDepth
    }

    let currentSegments = useLevelTilingStore.getState().segments

    const previousFlowState = previousFlowStateRef.current
    const wasGameOverTravel = previousFlowState === 'game_over_travel'
    const enteringGameOverTravel = flowState === 'game_over_travel' && !wasGameOverTravel
    const enteringRunFromIdle = flowState === 'run' && previousFlowState === 'idle'
    const enteringIdleFromGameOverInput = flowState === 'idle' && previousFlowState === 'game_over_input'
    previousFlowStateRef.current = flowState

    if (enteringRunFromIdle) {
      deferredSpawnModeRef.current = 'run'
    }
    if (enteringIdleFromGameOverInput) {
      deferredSpawnModeRef.current = 'idle'
    }
    if (flowState === 'game_over_travel' || flowState === 'game_over_input') {
      deferredSpawnModeRef.current = null
    }

    if (enteringGameOverTravel) {
      setSpawnMode('idle', true)
      const immediateCullIds = cullIdsRef.current
      immediateCullIds.length = 0
      const attachBeforeCull = useLevelTilingStore.getState().nextAttachWorldZ

      for (let i = 0; i < currentSegments.length; i += 1) {
        const segment = currentSegments[i]
        if (!segment) continue
        const outsideVisibleSlab = (
          segment.nearWorldZ < frontVisibleZ - GAME_OVER_ENTRY_CULL_FRONT_PADDING
          || segment.farWorldZ > backVisibleZ + GAME_OVER_ENTRY_CULL_BACK_PADDING
        )
        if (outsideVisibleSlab) {
          immediateCullIds.push(segment.id)
        }
      }

      if (immediateCullIds.length > 0) {
        cullSegments(immediateCullIds)
        immediateCullIds.length = 0
        rebaseNextAttachWorldZ()
      }
      currentSegments = useLevelTilingStore.getState().segments
      if (currentSegments.length === 0) {
        setNextAttachWorldZ(attachBeforeCull)
      }

      const gameOverFiles = tiling.gameOverFiles
        .map((file) => file.trim())
        .filter((file) => file.length > 0)
      if (gameOverFiles.length > 0) {
        const nextTarget = useLevelTilingStore.getState().previewForcedFinalCenterZ(gameOverFiles)
        setGameOverTravelTargetZ(nextTarget)
      }
    }

    let frontierZ = computeFrontierZ(currentSegments)
    let shouldSpawnAhead = true
    if (
      (flowState === 'run' || flowState === 'idle')
      && deferredSpawnModeRef.current === flowState
    ) {
      if (currentSegments.length === 0) {
        deferredSpawnModeRef.current = null
      } else if (frontierZ > frontVisibleZ) {
        shouldSpawnAhead = false
      } else {
        deferredSpawnModeRef.current = null
      }
      frontierZ = computeFrontierZ(useLevelTilingStore.getState().segments)
    }

    let spawnSafety = 0
    while (shouldSpawnAhead && frontierZ > viewCenterZ - lookAheadDistance && spawnSafety < 16) {
      if (flowState === 'game_over_input') break
      spawnNextSegment()
      spawnSafety += 1
      currentSegments = useLevelTilingStore.getState().segments
      if (TILING_DEBUG) {
        const nowMs = performance.now()
        const spawnedSegment = currentSegments[currentSegments.length - 1]
        const previousSpawnAtMs = lastSpawnAtMsRef.current
        const secondsSincePreviousSpawn = previousSpawnAtMs === null
          ? null
          : roundDebug((nowMs - previousSpawnAtMs) / 1000)
        lastSpawnAtMsRef.current = nowMs
        console.info('[LevelTileManager] Spawned segment', {
          flowState,
          segmentId: spawnedSegment?.id ?? null,
          filename: spawnedSegment?.filename ?? null,
          secondsSincePreviousSpawn,
          viewCenterZ: roundDebug(viewCenterZ),
          frontVisibleZ: roundDebug(frontVisibleZ),
          backVisibleZ: roundDebug(backVisibleZ),
          frontierZBeforeNextIteration: roundDebug(frontierZ),
          lookAheadDistance: roundDebug(lookAheadDistance),
          activeSegments: currentSegments.length,
          spawnedNearWorldZ: spawnedSegment ? roundDebug(spawnedSegment.nearWorldZ) : null,
          spawnedFarWorldZ: spawnedSegment ? roundDebug(spawnedSegment.farWorldZ) : null,
        })
      }
      frontierZ = computeFrontierZ(currentSegments)
    }

    const cullIds = cullIdsRef.current
    cullIds.length = 0
    for (let i = 0; i < currentSegments.length; i += 1) {
      const segment = currentSegments[i]
      if (!segment) continue
      if (segment.farWorldZ > backVisibleZ + cullBehindDistance) {
        cullIds.push(segment.id)
      }
    }
    if (cullIds.length > 0) {
      if (TILING_DEBUG) {
        console.info('[LevelTileManager] Culled segments', {
          flowState,
          culledIds: [...cullIds],
          viewCenterZ: roundDebug(viewCenterZ),
          frontVisibleZ: roundDebug(frontVisibleZ),
          backVisibleZ: roundDebug(backVisibleZ),
          cullBehindDistance: roundDebug(cullBehindDistance),
          activeSegmentsBeforeCull: currentSegments.length,
        })
      }
      cullSegments(cullIds)
      cullIds.length = 0
    }

    if (TILING_DEBUG) {
      const nowMs = performance.now()
      if (nowMs - lastHeartbeatAtMsRef.current >= 5000) {
        lastHeartbeatAtMsRef.current = nowMs
        console.info('[LevelTileManager] Heartbeat', {
          flowState,
          viewCenterZ: roundDebug(viewCenterZ),
          travelZ: roundDebug(travelZ),
          frontVisibleZ: roundDebug(frontVisibleZ),
          backVisibleZ: roundDebug(backVisibleZ),
          lookAheadDistance: roundDebug(lookAheadDistance),
          cullBehindDistance: roundDebug(cullBehindDistance),
          frontierZ: Number.isFinite(frontierZ) ? roundDebug(frontierZ) : null,
          activeSegments: useLevelTilingStore.getState().segments.length,
        })
      }
    }

    if (flowState !== 'game_over_travel') {
      gameOverCenterTriggeredRef.current = false
      missingGameOverConfigLoggedRef.current = false
      lastTravelZRef.current = travelZ
      return
    }

    if (gameOverCenterTriggeredRef.current) {
      lastTravelZRef.current = travelZ
      return
    }

    const prevTravelZ = lastTravelZRef.current
    if (prevTravelZ !== null) {
      let shouldCenter = false

      if (typeof gameOverTravelTargetZ === 'number' && Number.isFinite(gameOverTravelTargetZ)) {
        shouldCenter = didCrossTarget(prevTravelZ, travelZ, gameOverTravelTargetZ)
      } else {
        const finalGameOverFilename = tiling.gameOverFiles[tiling.gameOverFiles.length - 1]?.trim() ?? ''
        if (!finalGameOverFilename) {
          if (!missingGameOverConfigLoggedRef.current) {
            missingGameOverConfigLoggedRef.current = true
            console.error('[LevelTileManager] Missing SETTINGS.level.tiling.gameOverFiles final entry during game_over_travel.')
          }
        } else {
          for (let i = currentSegments.length - 1; i >= 0; i -= 1) {
            const segment = currentSegments[i]
            if (!segment || segment.filename !== finalGameOverFilename) continue
            const segmentCenterZ = segment.zOffset + segment.centerOffsetZ
            if (!didCrossTarget(prevTravelZ, travelZ, segmentCenterZ)) continue
            shouldCenter = true
            break
          }
        }
      }

      if (shouldCenter) {
        gameOverCenterTriggeredRef.current = true
        onGameOverTileCentered()
      }
    }

    lastTravelZRef.current = travelZ
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
