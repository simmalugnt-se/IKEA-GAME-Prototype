import * as THREE from 'three'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import {
  getLatestCursorSweepSeq,
  readCursorSweepSegment,
  type CursorSweepSegment,
} from '@/input/cursorVelocity'
import {
  getFrustumCornersOnFloor,
  isPastBottomEdge,
  isPastLeftEdge,
  type FrustumCorners,
} from '@/gameplay/frustumBounds'
import { SETTINGS } from '@/settings/GameSettings'

type BalloonWorldXZ = {
  x: number
  z: number
}

export type BalloonLifecyclePopMeta = {
  worldDirX: number
  worldDirZ: number
  cursorSpeedPx: number
  sweepTimeMs: number
}

export type BalloonLifecycleTarget = {
  getWorldXZ: () => BalloonWorldXZ | undefined
  getWorldPopCenter: (out: THREE.Vector3) => boolean
  getWorldPopRadiusX: () => number
  getWorldPopRadiusY: () => number
  requestPop: (meta: BalloonLifecyclePopMeta) => void
  isPopped: () => boolean
  onMissed: () => void
}

type BalloonLifecycleEntry = {
  target: BalloonLifecycleTarget
  missApplied: boolean
}

type BalloonLifecycleRegistry = {
  register: (target: BalloonLifecycleTarget) => () => void
}

type CanvasRect = {
  left: number
  top: number
  width: number
  height: number
}

const DEFAULT_LIFE_MARGIN = 0
const SEGMENT_EPSILON = 1e-6
const _cameraRight = new THREE.Vector3()
const _cameraUp = new THREE.Vector3()

const BalloonLifecycleRegistryContext = createContext<BalloonLifecycleRegistry | null>(null)

function normalizeMargin(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

function pointSegmentDistanceSq(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0
  const dy = y1 - y0
  const segmentLengthSq = dx * dx + dy * dy
  if (segmentLengthSq <= SEGMENT_EPSILON) {
    const qx = px - x0
    const qy = py - y0
    return qx * qx + qy * qy
  }

  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / segmentLengthSq))
  const closestX = x0 + dx * t
  const closestY = y0 + dy * t
  const qx = px - closestX
  const qy = py - closestY
  return qx * qx + qy * qy
}

function segmentIntersectsEllipse(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
): boolean {
  if (!(radiusX > 0) || !(radiusY > 0)) return false
  const minX = x0 < x1 ? x0 : x1
  const maxX = x0 > x1 ? x0 : x1
  const minY = y0 < y1 ? y0 : y1
  const maxY = y0 > y1 ? y0 : y1

  if (cx < minX - radiusX || cx > maxX + radiusX) return false
  if (cy < minY - radiusY || cy > maxY + radiusY) return false

  const invRadiusX = 1 / radiusX
  const invRadiusY = 1 / radiusY
  const x0Norm = (x0 - cx) * invRadiusX
  const y0Norm = (y0 - cy) * invRadiusY
  const x1Norm = (x1 - cx) * invRadiusX
  const y1Norm = (y1 - cy) * invRadiusY

  return pointSegmentDistanceSq(0, 0, x0Norm, y0Norm, x1Norm, y1Norm) <= 1
}

export function useBalloonLifecycleRegistry(): BalloonLifecycleRegistry | null {
  return useContext(BalloonLifecycleRegistryContext)
}

export function BalloonLifecycleRuntime({ children }: { children: ReactNode }) {
  const { camera, gl } = useThree()
  const loseLives = useGameplayStore((state) => state.loseLives)
  const gameOver = useGameplayStore((state) => state.gameOver)
  const entriesRef = useRef<Set<BalloonLifecycleEntry>>(new Set())
  const missQueueRef = useRef<Array<() => void>>([])
  const popQueueRef = useRef<Array<BalloonLifecycleTarget>>([])
  const lastSweepSeqRef = useRef(0)
  const sweepSegmentRef = useRef<CursorSweepSegment>({
    seq: 0,
    timeMs: 0,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    velocityPx: 0,
    velocityScreenXPx: 0,
    velocityScreenYPx: 0,
  })
  const popMetaRef = useRef<BalloonLifecyclePopMeta>({
    worldDirX: 0,
    worldDirZ: -1,
    cursorSpeedPx: 0,
    sweepTimeMs: 0,
  })
  const frozenScreenRightOnFloorRef = useRef({ x: 0, z: 0 })
  const frozenScreenUpOnFloorRef = useRef({ x: 0, z: 0 })
  const frozenMappingReadyRef = useRef(false)
  const popCenterWorldRef = useRef(new THREE.Vector3())
  const popCenterNdcRef = useRef(new THREE.Vector3())
  const canvasRectRef = useRef<CanvasRect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })

  const registry = useMemo<BalloonLifecycleRegistry>(() => ({
    register(target) {
      const entry: BalloonLifecycleEntry = { target, missApplied: false }
      entriesRef.current.add(entry)
      return () => { entriesRef.current.delete(entry) }
    },
  }), [])

  useEffect(() => {
    const domElement = gl.domElement
    const cachedRect = canvasRectRef.current

    const updateCanvasRect = () => {
      const rect = domElement.getBoundingClientRect()
      cachedRect.left = rect.left
      cachedRect.top = rect.top
      cachedRect.width = rect.width
      cachedRect.height = rect.height
    }

    updateCanvasRect()

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateCanvasRect)
      resizeObserver.observe(domElement)
    }

    window.addEventListener('resize', updateCanvasRect, { passive: true })
    window.addEventListener('scroll', updateCanvasRect, { passive: true })

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateCanvasRect)
      window.removeEventListener('scroll', updateCanvasRect)
    }
  }, [gl])

  useFrame(() => {
    if (gameOver) return
    const entries = entriesRef.current
    if (entries.size === 0) return

    const rawCorners = getFrustumCornersOnFloor(camera as THREE.OrthographicCamera)
    if (!rawCorners || rawCorners.length !== 4) return
    const corners = rawCorners as FrustumCorners

    const lifeMargin = normalizeMargin(SETTINGS.gameplay.balloons.sensors.lifeMargin, DEFAULT_LIFE_MARGIN)
    const lifeLoss = Math.max(0, Math.trunc(SETTINGS.gameplay.lives.lossPerMiss))

    const missQueue = missQueueRef.current
    missQueue.length = 0

    entries.forEach((entry) => {
      if (entry.missApplied) return
      if (entry.target.isPopped()) return

      const worldPosition = entry.target.getWorldXZ()
      if (!worldPosition) return

      const pastLife = (
        isPastLeftEdge(corners, worldPosition.x, worldPosition.z, lifeMargin)
        || isPastBottomEdge(corners, worldPosition.x, worldPosition.z, lifeMargin)
      )

      if (pastLife) {
        entry.missApplied = true
        if (lifeLoss > 0) loseLives(lifeLoss, 'balloon_missed')
        missQueue.push(entry.target.onMissed)
      }
    })

    const latestSweepSeq = getLatestCursorSweepSeq()
    if (latestSweepSeq > lastSweepSeqRef.current) {
      if (!frozenMappingReadyRef.current) {
        camera.updateMatrixWorld()
        _cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
        _cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion)

        const rightX = _cameraRight.x
        const rightZ = _cameraRight.z
        const rightLength = Math.hypot(rightX, rightZ)
        const upX = _cameraUp.x
        const upZ = _cameraUp.z
        const upLength = Math.hypot(upX, upZ)

        if (
          rightLength > SEGMENT_EPSILON
          && upLength > SEGMENT_EPSILON
          && Number.isFinite(rightLength)
          && Number.isFinite(upLength)
        ) {
          const frozenScreenRightOnFloor = frozenScreenRightOnFloorRef.current
          const frozenScreenUpOnFloor = frozenScreenUpOnFloorRef.current
          frozenScreenRightOnFloor.x = rightX / rightLength
          frozenScreenRightOnFloor.z = rightZ / rightLength
          frozenScreenUpOnFloor.x = upX / upLength
          frozenScreenUpOnFloor.z = upZ / upLength
          frozenMappingReadyRef.current = true
        }
      }

      const canvasRect = canvasRectRef.current
      const canvasWidth = canvasRect.width
      const canvasHeight = canvasRect.height

      if (canvasWidth > 0 && canvasHeight > 0 && frozenMappingReadyRef.current) {
        const orthographicCamera = camera as THREE.OrthographicCamera
        const visibleWorldHeight = (orthographicCamera.top - orthographicCamera.bottom) / orthographicCamera.zoom

        if (!(visibleWorldHeight > SEGMENT_EPSILON) || !Number.isFinite(visibleWorldHeight)) {
          lastSweepSeqRef.current = latestSweepSeq
          missQueue.forEach((callback) => callback())
          return
        }

        const pixelsPerWorld = canvasHeight / visibleWorldHeight
        const popQueue = popQueueRef.current
        const popCenterWorld = popCenterWorldRef.current
        const popCenterNdc = popCenterNdcRef.current
        const sweepSegment = sweepSegmentRef.current

        for (
          let sweepSeq = lastSweepSeqRef.current + 1;
          sweepSeq <= latestSweepSeq;
          sweepSeq += 1
        ) {
          if (!readCursorSweepSegment(sweepSeq, sweepSegment)) continue
          if (sweepSegment.velocityPx < SETTINGS.cursor.minPopVelocity) continue

          const x0Local = sweepSegment.x0 - canvasRect.left
          const y0Local = sweepSegment.y0 - canvasRect.top
          const x1Local = sweepSegment.x1 - canvasRect.left
          const y1Local = sweepSegment.y1 - canvasRect.top

          const segmentMinX = x0Local < x1Local ? x0Local : x1Local
          const segmentMaxX = x0Local > x1Local ? x0Local : x1Local
          const segmentMinY = y0Local < y1Local ? y0Local : y1Local
          const segmentMaxY = y0Local > y1Local ? y0Local : y1Local
          if (
            segmentMaxX < 0
            || segmentMinX > canvasWidth
            || segmentMaxY < 0
            || segmentMinY > canvasHeight
          ) {
            continue
          }

          popQueue.length = 0
          entries.forEach((entry) => {
            if (entry.target.isPopped()) return
            if (!entry.target.getWorldPopCenter(popCenterWorld)) return

            const radiusWorldX = entry.target.getWorldPopRadiusX()
            const radiusWorldY = entry.target.getWorldPopRadiusY()
            if (!(radiusWorldX > 0) || !Number.isFinite(radiusWorldX)) return
            if (!(radiusWorldY > 0) || !Number.isFinite(radiusWorldY)) return

            popCenterNdc.copy(popCenterWorld).project(camera)
            if (
              !Number.isFinite(popCenterNdc.x)
              || !Number.isFinite(popCenterNdc.y)
              || !Number.isFinite(popCenterNdc.z)
            ) {
              return
            }

            const centerX = ((popCenterNdc.x + 1) * 0.5) * canvasWidth
            const centerY = ((1 - popCenterNdc.y) * 0.5) * canvasHeight
            const radiusPxX = radiusWorldX * pixelsPerWorld
            const radiusPxY = radiusWorldY * pixelsPerWorld
            if (!(radiusPxX > 0) || !Number.isFinite(radiusPxX)) return
            if (!(radiusPxY > 0) || !Number.isFinite(radiusPxY)) return

            if (
              segmentIntersectsEllipse(
                x0Local,
                y0Local,
                x1Local,
                y1Local,
                centerX,
                centerY,
                radiusPxX * 1.01,
                radiusPxY * 1.01,
              )
            ) {
              popQueue.push(entry.target)
            }
          })

          if (popQueue.length > 0) {
            const frozenScreenRightOnFloor = frozenScreenRightOnFloorRef.current
            const frozenScreenUpOnFloor = frozenScreenUpOnFloorRef.current
            const sx = sweepSegment.velocityScreenXPx
            const sy = -sweepSegment.velocityScreenYPx
            const worldX = (
              sx * frozenScreenRightOnFloor.x
              + sy * frozenScreenUpOnFloor.x
            )
            const worldZ = (
              sx * frozenScreenRightOnFloor.z
              + sy * frozenScreenUpOnFloor.z
            )
            const worldLength = Math.hypot(worldX, worldZ)
            const popMeta = popMetaRef.current
            if (worldLength > SEGMENT_EPSILON && Number.isFinite(worldLength)) {
              const invWorldLength = 1 / worldLength
              popMeta.worldDirX = worldX * invWorldLength
              popMeta.worldDirZ = worldZ * invWorldLength
            } else {
              popMeta.worldDirX = frozenScreenUpOnFloor.x
              popMeta.worldDirZ = frozenScreenUpOnFloor.z
            }
            popMeta.cursorSpeedPx = sweepSegment.velocityPx
            popMeta.sweepTimeMs = sweepSegment.timeMs
            for (let i = 0; i < popQueue.length; i += 1) {
              popQueue[i]?.requestPop(popMeta)
            }
          }
        }
      }

      lastSweepSeqRef.current = latestSweepSeq
    }

    missQueue.forEach((callback) => callback())
  })

  return (
    <BalloonLifecycleRegistryContext.Provider value={registry}>
      {children}
    </BalloonLifecycleRegistryContext.Provider>
  )
}
