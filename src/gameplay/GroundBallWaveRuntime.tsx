import { useGroundBallWaveStore } from '@/gameplay/groundBallWaveStore'
import {
  getFrustumCornersOnFloor,
  pointOnSegment,
  type FrustumCorners,
} from '@/gameplay/frustumBounds'
import { getGameplayTimeScale, useGameplayStore } from '@/gameplay/gameplayStore'
import { BallElement } from '@/primitives/BallElement'
import { resolveMaterialColorIndex } from '@/settings/GameSettings'
import type {
  GroundBallEntrySide,
  SpawnEventActionGroundBallWave,
  Vec3,
} from '@/settings/GameSettings.types'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const FLOOR_Y = 0

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function normalizeEntrySides(sides: GroundBallEntrySide[]): GroundBallEntrySide[] {
  const next = sides.filter((side): side is GroundBallEntrySide => (
    side === 'top' || side === 'right' || side === 'bottom' || side === 'left'
  ))
  return next.length > 0 ? next : ['top', 'left', 'right', 'bottom']
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

function rotateXZ(x: number, z: number, radians: number): [number, number] {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return [
    x * cos - z * sin,
    x * sin + z * cos,
  ]
}

function buildGroundBallDescriptorsForAction(
  requestId: string,
  action: SpawnEventActionGroundBallWave,
  corners: FrustumCorners,
  nowMs: number,
): ReturnType<typeof useGroundBallWaveStore.getState>['activeBalls'] {
  const descriptors: ReturnType<typeof useGroundBallWaveStore.getState>['activeBalls'] = []
  const count = Math.max(1, Math.trunc(action.count))
  const edgeInset = clamp01(action.edgeInset)
  const spawnPadding = Math.max(0, action.spawnPadding)
  const speedBase = Math.max(0.1, action.speed)
  const speedJitter = Math.max(0, action.speedJitter)
  const angleJitterRad = (Math.max(0, action.angleJitterDeg) * Math.PI) / 180
  const lifetimeMs = Math.max(250, Math.trunc(action.lifetimeMs))
  const sides = normalizeEntrySides(action.entrySides)
  const colorPool = action.colorIndices.length > 0 ? action.colorIndices : [1]
  const frustumCenter = new THREE.Vector3()
  const spawnPoint = new THREE.Vector3()
  const targetPoint = new THREE.Vector3()
  const outward = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const edgeMid = new THREE.Vector3()

  getFrustumCenter(corners, frustumCenter)

  for (let i = 0; i < count; i += 1) {
    const side = sides[Math.floor(Math.random() * sides.length)] ?? 'top'
    const [spawnA, spawnB] = getSideSegment(corners, side)
    const [targetA, targetB] = getSideSegment(corners, getOppositeSide(side))
    const t = edgeInset + (1 - edgeInset * 2) * Math.random()
    pointOnSegment(spawnA, spawnB, t, spawnPoint)
    pointOnSegment(targetA, targetB, t, targetPoint)
    pointOnSegment(spawnA, spawnB, 0.5, edgeMid)
    outward.copy(edgeMid).sub(frustumCenter).setY(0)
    if (outward.lengthSq() > 1e-6) {
      outward.normalize()
      spawnPoint.addScaledVector(outward, spawnPadding)
    }

    direction.copy(targetPoint).sub(spawnPoint).setY(0)
    if (direction.lengthSq() <= 1e-6) {
      direction.set(0, 0, 1)
    } else {
      direction.normalize()
    }

    const speed = speedBase + (Math.random() * 2 - 1) * speedJitter
    const jitterRadians = (Math.random() * 2 - 1) * angleJitterRad
    const [dirX, dirZ] = rotateXZ(direction.x, direction.z, jitterRadians)
    const color = resolveMaterialColorIndex(
      colorPool[Math.floor(Math.random() * colorPool.length)] ?? colorPool[0] ?? 1,
    )

    descriptors.push({
      id: `${requestId}-ball-${i + 1}`,
      color,
      sizePreset: action.ballSizePreset,
      position: [spawnPoint.x, FLOOR_Y, spawnPoint.z],
      linearVelocity: [dirX * speed, 0, dirZ * speed],
      mass: action.mass,
      friction: action.friction,
      restitution: action.restitution,
      linearDamping: action.linearDamping,
      angularDamping: action.angularDamping,
      lifetimeMs,
      spawnedAtMs: nowMs,
    })
  }

  return descriptors
}

export function GroundBallWaveRuntime() {
  const flowState = useGameplayStore((state) => state.flowState)
  const paused = useGameplayStore((state) => state.paused)
  const queuedRequests = useGroundBallWaveStore((state) => state.queuedRequests)
  const activeBalls = useGroundBallWaveStore((state) => state.activeBalls)
  const consumeWaveRequests = useGroundBallWaveStore((state) => state.consumeWaveRequests)
  const addActiveBalls = useGroundBallWaveStore((state) => state.addActiveBalls)
  const removeActiveBall = useGroundBallWaveStore((state) => state.removeActiveBall)
  const clearAll = useGroundBallWaveStore((state) => state.clearAll)
  const { camera } = useThree()
  const elapsedGameplayMsByBallIdRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (flowState === 'run') return
    elapsedGameplayMsByBallIdRef.current.clear()
    clearAll()
  }, [clearAll, flowState])

  useEffect(() => {
    if (flowState !== 'run') return
    if (paused) return
    if (!(camera instanceof THREE.OrthographicCamera)) return
    if (queuedRequests.length <= 0) return

    const corners = getFrustumCornersOnFloor(camera)
    if (!corners) return

    const requests = consumeWaveRequests()
    if (requests.length <= 0) return

    const nowMs = performance.now()
    const nextBalls = requests.flatMap((request) => (
      buildGroundBallDescriptorsForAction(request.id, request.action, corners as FrustumCorners, nowMs)
    ))
    addActiveBalls(nextBalls)
  }, [addActiveBalls, camera, consumeWaveRequests, flowState, paused, queuedRequests])

  useFrame((_, deltaSeconds) => {
    if (paused) return
    if (activeBalls.length <= 0) return
    const elapsedGameplayMsByBallId = elapsedGameplayMsByBallIdRef.current
    const gameplayDeltaMs = Math.max(0, deltaSeconds * 1000 * getGameplayTimeScale())
    const activeBallIds = new Set(activeBalls.map((ball) => ball.id))
    for (const trackedId of elapsedGameplayMsByBallId.keys()) {
      if (!activeBallIds.has(trackedId)) {
        elapsedGameplayMsByBallId.delete(trackedId)
      }
    }
    for (let i = 0; i < activeBalls.length; i += 1) {
      const ball = activeBalls[i]
      if (!ball) continue
      const previousElapsedMs = elapsedGameplayMsByBallId.get(ball.id) ?? 0
      const nextElapsedMs = previousElapsedMs + gameplayDeltaMs
      if (nextElapsedMs < ball.lifetimeMs) {
        elapsedGameplayMsByBallId.set(ball.id, nextElapsedMs)
        continue
      }
      elapsedGameplayMsByBallId.delete(ball.id)
      removeActiveBall(ball.id)
    }
  })

  return (
    <>
      {activeBalls.map((ball) => (
        <BallElement
          key={ball.id}
          entityId={ball.id}
          position={ball.position}
          physics="dynamic"
          sizePreset={ball.sizePreset}
          color={ball.color}
          mass={ball.mass}
          friction={ball.friction}
          restitution={ball.restitution}
          linearVelocity={ball.linearVelocity}
          linearDamping={ball.linearDamping}
          angularDamping={ball.angularDamping}
          contagionCarrier
          contagionInfectable={false}
          contagionColor={ball.color}
        />
      ))}
    </>
  )
}
