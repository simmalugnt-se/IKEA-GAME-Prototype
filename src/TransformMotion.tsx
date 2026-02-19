import * as THREE from 'three'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vec3 } from './GameSettings'

type AxisName = 'x' | 'y' | 'z'
type LoopMode = 'none' | 'loop' | 'pingpong'
type AxisRange = [number, number]
type AxisValueMap = Partial<Record<AxisName, number>>
type AxisRangeMap = Partial<Record<AxisName, AxisRange>>
type Vec3Like = Vec3 | AxisValueMap

type TransformMotionProps = {
  children: ReactNode
  loopMode?: LoopMode
  positionVelocity?: Vec3Like
  rotationVelocity?: Vec3Like
  scaleVelocity?: Vec3Like
  positionRange?: AxisRangeMap
  rotationRange?: AxisRangeMap
  scaleRange?: AxisRangeMap
}

type MotionTrackConfig = {
  loopMode: LoopMode
  positionVelocity: Vec3
  rotationVelocity: Vec3
  scaleVelocity: Vec3
  positionRange?: AxisRangeMap
  rotationRange?: AxisRangeMap
  scaleRange?: AxisRangeMap
}

type MotionTrackState = {
  positionDirection: Vec3
  rotationDirection: Vec3
  scaleDirection: Vec3
}

type MotionTrack = {
  ref: MutableRefObject<THREE.Group | null>
  configRef: MutableRefObject<MotionTrackConfig>
  state: MotionTrackState
}

type MotionRegistry = {
  register(track: MotionTrack): () => void
}

const ZERO_VEC3: Vec3 = [0, 0, 0]

function normalizeVec3Like(input?: Vec3Like): Vec3 {
  if (!input) return [...ZERO_VEC3]
  if (Array.isArray(input)) return [input[0] ?? 0, input[1] ?? 0, input[2] ?? 0]
  return [input.x ?? 0, input.y ?? 0, input.z ?? 0]
}

function normalizeRange(range: AxisRange): AxisRange {
  const min = Math.min(range[0], range[1])
  const max = Math.max(range[0], range[1])
  return [min, max]
}

function applyLoop(current: number, range: AxisRange): number {
  const [min, max] = normalizeRange(range)
  const span = max - min
  if (span <= 0) return min

  let wrapped = current
  while (wrapped > max) wrapped -= span
  while (wrapped < min) wrapped += span
  return wrapped
}

function applyPingPong(current: number, direction: number, range: AxisRange): { value: number; direction: number } {
  const [min, max] = normalizeRange(range)
  if (max <= min) return { value: min, direction }

  let value = current
  let dir = direction

  // Handle overshoot robustly even on large frame deltas.
  while (value > max || value < min) {
    if (value > max) {
      value = max - (value - max)
      dir = -Math.abs(dir)
    } else if (value < min) {
      value = min + (min - value)
      dir = Math.abs(dir)
    }
  }

  return { value, direction: dir }
}

type XYZLike = {
  x: number
  y: number
  z: number
}

function hasAxisRange(range: AxisRangeMap | undefined): boolean {
  return Boolean(range?.x || range?.y || range?.z)
}

function updateVector(
  vector: XYZLike,
  velocity: Vec3,
  range: AxisRangeMap | undefined,
  direction: Vec3,
  loopMode: LoopMode,
  delta: number,
) {
  const axes: AxisName[] = ['x', 'y', 'z']

  axes.forEach((axis, index) => {
    const speed = velocity[index] ?? 0
    if (speed === 0) return

    const directionValue = direction[index] ?? 1
    const step = speed * directionValue * delta
    let next = vector[axis] + step

    const axisRange = range?.[axis]
    if (!axisRange || loopMode === 'none') {
      vector[axis] = next
      return
    }

    if (loopMode === 'loop') {
      vector[axis] = applyLoop(next, axisRange)
      return
    }

    const pingPongResult = applyPingPong(next, directionValue, axisRange)
    direction[index] = pingPongResult.direction
    vector[axis] = pingPongResult.value
  })
}

const MotionRegistryContext = createContext<MotionRegistry | null>(null)

export function MotionSystemProvider({ children }: { children: ReactNode }) {
  const tracksRef = useRef<Set<MotionTrack>>(new Set())

  const registry = useMemo<MotionRegistry>(() => ({
    register(track) {
      tracksRef.current.add(track)
      return () => {
        tracksRef.current.delete(track)
      }
    },
  }), [])

  useFrame((_, delta) => {
    tracksRef.current.forEach((track) => {
      const object = track.ref.current
      if (!object) return

      const config = track.configRef.current
      updateVector(
        object.position,
        config.positionVelocity,
        config.positionRange,
        track.state.positionDirection,
        config.loopMode,
        delta,
      )
      updateVector(
        object.rotation,
        config.rotationVelocity,
        config.rotationRange,
        track.state.rotationDirection,
        config.loopMode,
        delta,
      )
      updateVector(
        object.scale,
        config.scaleVelocity,
        config.scaleRange,
        track.state.scaleDirection,
        config.loopMode,
        delta,
      )
    })
  })

  return (
    <MotionRegistryContext.Provider value={registry}>
      {children}
    </MotionRegistryContext.Provider>
  )
}

export function TransformMotion({
  children,
  loopMode,
  positionVelocity,
  rotationVelocity,
  scaleVelocity,
  positionRange,
  rotationRange,
  scaleRange,
}: TransformMotionProps) {
  const registry = useContext(MotionRegistryContext)
  if (!registry) {
    throw new Error('TransformMotion must be used inside MotionSystemProvider')
  }

  const effectiveLoopMode: LoopMode = loopMode ?? (hasAxisRange(positionRange) ? 'loop' : 'none')
  const ref = useRef<THREE.Group | null>(null)
  const computedConfig = useMemo<MotionTrackConfig>(() => ({
    loopMode: effectiveLoopMode,
    positionVelocity: normalizeVec3Like(positionVelocity),
    rotationVelocity: normalizeVec3Like(rotationVelocity),
    scaleVelocity: normalizeVec3Like(scaleVelocity),
    positionRange,
    rotationRange,
    scaleRange,
  }), [
    effectiveLoopMode,
    positionVelocity,
    rotationVelocity,
    scaleVelocity,
    positionRange,
    rotationRange,
    scaleRange,
  ])
  const configRef = useRef<MotionTrackConfig>(computedConfig)
  const stateRef = useRef<MotionTrackState>({
    positionDirection: [1, 1, 1],
    rotationDirection: [1, 1, 1],
    scaleDirection: [1, 1, 1],
  })

  useEffect(() => {
    configRef.current = computedConfig
  }, [computedConfig])

  useEffect(() => {
    return registry.register({
      ref,
      configRef,
      state: stateRef.current,
    })
  }, [registry])

  return <group ref={ref}>{children}</group>
}
