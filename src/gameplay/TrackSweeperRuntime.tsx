import { useTrackSweeperStore } from '@/gameplay/trackSweeperStore'
import {
  getFrustumCornersOnFloor,
  pointOnSegment,
  type FrustumCorners,
} from '@/gameplay/frustumBounds'
import { useGameplayStore } from '@/gameplay/gameplayStore'
import { CylinderElement } from '@/primitives/CylinderElement'
import { resolveMaterialColorIndex } from '@/settings/GameSettings'
import type {
  GroundBallEntrySide,
  SpawnEventActionTrackSweeper,
} from '@/settings/GameSettings.types'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

const FLOOR_Y = 0
const UP_AXIS = new THREE.Vector3(0, 1, 0)

function normalizeEntrySides(sides: GroundBallEntrySide[]): GroundBallEntrySide[] {
  const next = sides.filter((side): side is GroundBallEntrySide => (
    side === 'top' || side === 'right' || side === 'bottom' || side === 'left'
  ))
  return next.length > 0 ? next : ['left', 'right']
}

function getSideSegment(corners: FrustumCorners, side: GroundBallEntrySide): [THREE.Vector3, THREE.Vector3] {
  switch (side) {
    case 'top':
      return [corners[3], corners[2]]
    case 'right':
      return [corners[2], corners[1]]
    case 'bottom':
      return [corners[0], corners[1]]
    case 'left':
    default:
      return [corners[3], corners[0]]
  }
}

function getOppositeSide(side: GroundBallEntrySide): GroundBallEntrySide {
  switch (side) {
    case 'top':
      return 'bottom'
    case 'right':
      return 'left'
    case 'bottom':
      return 'top'
    case 'left':
    default:
      return 'right'
  }
}

function getFrustumCenter(corners: FrustumCorners, out: THREE.Vector3): void {
  out.set(0, FLOOR_Y, 0)
  for (let i = 0; i < 4; i += 1) {
    out.x += corners[i]?.x ?? 0
    out.z += corners[i]?.z ?? 0
  }
  out.x /= 4
  out.z /= 4
}

function resolveAxisSpanLength(corners: FrustumCorners, axis: THREE.Vector3, padding: number): number {
  let minProjection = Number.POSITIVE_INFINITY
  let maxProjection = Number.NEGATIVE_INFINITY
  for (let i = 0; i < 4; i += 1) {
    const corner = corners[i]
    if (!corner) continue
    const projection = corner.x * axis.x + corner.z * axis.z
    if (projection < minProjection) minProjection = projection
    if (projection > maxProjection) maxProjection = projection
  }
  const baseLength = Math.max(0.1, maxProjection - minProjection)
  return baseLength + Math.max(0, padding) * 2
}

function buildTrackSweeperDescriptors(
  requestId: string,
  action: SpawnEventActionTrackSweeper,
  corners: FrustumCorners,
  nowMs: number,
): ReturnType<typeof useTrackSweeperStore.getState>['activeSweepers'] {
  const descriptors: ReturnType<typeof useTrackSweeperStore.getState>['activeSweepers'] = []
  const sides = normalizeEntrySides(action.entrySides)
  const side = sides[Math.floor(Math.random() * sides.length)] ?? 'left'
  const [spawnA, spawnB] = getSideSegment(corners, side)
  const [targetA, targetB] = getSideSegment(corners, getOppositeSide(side))
  const frustumCenter = new THREE.Vector3()
  const spawnPoint = new THREE.Vector3()
  const targetPoint = new THREE.Vector3()
  const edgeMid = new THREE.Vector3()
  const outward = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const axis = new THREE.Vector3()
  const rotationEuler = new THREE.Euler()
  const rotationQuaternion = new THREE.Quaternion()

  getFrustumCenter(corners, frustumCenter)
  pointOnSegment(spawnA, spawnB, 0.5, spawnPoint)
  pointOnSegment(targetA, targetB, 0.5, targetPoint)
  pointOnSegment(spawnA, spawnB, 0.5, edgeMid)

  outward.copy(edgeMid).sub(frustumCenter).setY(0)
  if (outward.lengthSq() > 1e-6) {
    outward.normalize()
    spawnPoint.addScaledVector(outward, Math.max(0, action.spawnPadding))
  }

  direction.copy(targetPoint).sub(spawnPoint).setY(0)
  if (direction.lengthSq() <= 1e-6) {
    direction.set(1, 0, 0)
  } else {
    direction.normalize()
  }

  axis.crossVectors(UP_AXIS, direction).normalize()
  if (axis.lengthSq() <= 1e-6) {
    axis.set(0, 0, 1)
  }

  rotationQuaternion.setFromUnitVectors(UP_AXIS, axis)
  rotationEuler.setFromQuaternion(rotationQuaternion)

  const radius = Math.max(0.05, action.radius)
  const height = resolveAxisSpanLength(corners, axis, action.spanPadding)
  const speed = Math.max(0.1, action.speed)
  const rollSpeed = (speed / Math.max(radius, 1e-3)) * Math.max(0, action.rollAngularSpeedMultiplier)
  const color = resolveMaterialColorIndex(action.colorIndex)

  descriptors.push({
    id: requestId,
    color,
    position: [spawnPoint.x, FLOOR_Y + radius, spawnPoint.z],
    rotation: [
      THREE.MathUtils.radToDeg(rotationEuler.x),
      THREE.MathUtils.radToDeg(rotationEuler.y),
      THREE.MathUtils.radToDeg(rotationEuler.z),
    ],
    linearVelocity: [direction.x * speed, 0, direction.z * speed],
    angularVelocity: [axis.x * rollSpeed, axis.y * rollSpeed, axis.z * rollSpeed],
    radius,
    height,
    friction: action.friction,
    restitution: action.restitution,
    linearDamping: action.linearDamping,
    angularDamping: action.angularDamping,
    lifetimeMs: Math.max(250, Math.trunc(action.lifetimeMs)),
    spawnedAtMs: nowMs,
  })

  return descriptors
}

export function TrackSweeperRuntime() {
  const flowState = useGameplayStore((state) => state.flowState)
  const queuedRequests = useTrackSweeperStore((state) => state.queuedRequests)
  const activeSweepers = useTrackSweeperStore((state) => state.activeSweepers)
  const consumeRequests = useTrackSweeperStore((state) => state.consumeRequests)
  const addActiveSweepers = useTrackSweeperStore((state) => state.addActiveSweepers)
  const removeActiveSweeper = useTrackSweeperStore((state) => state.removeActiveSweeper)
  const clearAll = useTrackSweeperStore((state) => state.clearAll)
  const { camera } = useThree()

  useEffect(() => {
    if (flowState === 'run') return
    clearAll()
  }, [clearAll, flowState])

  useEffect(() => {
    if (flowState !== 'run') return
    if (!(camera instanceof THREE.OrthographicCamera)) return
    if (queuedRequests.length <= 0) return

    const corners = getFrustumCornersOnFloor(camera)
    if (!corners) return

    const requests = consumeRequests()
    if (requests.length <= 0) return

    const nowMs = performance.now()
    const nextSweepers = requests.flatMap((request) => (
      buildTrackSweeperDescriptors(request.id, request.action, corners as FrustumCorners, nowMs)
    ))
    addActiveSweepers(nextSweepers)
  }, [addActiveSweepers, camera, consumeRequests, flowState, queuedRequests])

  useFrame(() => {
    if (activeSweepers.length <= 0) return
    const nowMs = performance.now()
    for (let i = 0; i < activeSweepers.length; i += 1) {
      const sweeper = activeSweepers[i]
      if (!sweeper) continue
      if (nowMs - sweeper.spawnedAtMs < sweeper.lifetimeMs) continue
      removeActiveSweeper(sweeper.id)
    }
  })

  return (
    <>
      {activeSweepers.map((sweeper) => (
        <CylinderElement
          key={sweeper.id}
          entityId={sweeper.id}
          physics="kinematicVelocity"
          color={sweeper.color}
          radius={sweeper.radius}
          height={sweeper.height}
          position={sweeper.position}
          rotation={sweeper.rotation}
          linearVelocity={sweeper.linearVelocity}
          angularVelocity={sweeper.angularVelocity}
          friction={sweeper.friction}
          restitution={sweeper.restitution}
          linearDamping={sweeper.linearDamping}
          angularDamping={sweeper.angularDamping}
          contagionCarrier
          contagionInfectable={false}
          contagionColor={sweeper.color}
        />
      ))}
    </>
  )
}
