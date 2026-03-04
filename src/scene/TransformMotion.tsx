import * as THREE from 'three'
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useFrame, type ThreeElements } from '@react-three/fiber'
import type { Vec3 } from '@/settings/GameSettings'
import { applyEasing, type EasingName } from '@/utils/easing'
import { isMotionSystemFlowActive } from '@/gameplay/gameplayStore'
import { getGameRunClockSeconds } from '@/game/GameRunClock'
import {
  ACCELERATION_CURVE_NAMES,
  type AccelerationCurveName,
  resolveAccelerationMultiplier as resolveCurveAccelerationMultiplier,
} from '@/utils/accelerationCurve'

export const TRANSFORM_MOTION_AXES = ['x', 'y', 'z'] as const
export const TRANSFORM_MOTION_LOOP_MODES = ['none', 'loop', 'pingpong'] as const
export const TRANSFORM_MOTION_TIME_SCALE_ACCELERATION_CURVES = ACCELERATION_CURVE_NAMES

export type AxisName = (typeof TRANSFORM_MOTION_AXES)[number]
export type LoopMode = (typeof TRANSFORM_MOTION_LOOP_MODES)[number]
export type TimeScaleAccelerationCurve = AccelerationCurveName
type AxisRange = [number, number]
type AxisValueMap = Partial<Record<AxisName, number>>
type AxisRangeMap = Partial<Record<AxisName, AxisRange>>
type Vec3Like = Vec3 | AxisValueMap
type RandomPerAxis = number | Partial<Record<AxisName, number>>
type PerAxisOverride<T> = T | Partial<Record<AxisName, T>>
type PerAxisLoopMode = [LoopMode, LoopMode, LoopMode]
type PerAxisEasing = [EasingName, EasingName, EasingName]
type AxisEnabledMap = [boolean, boolean, boolean]

export type TransformMotionProps = Omit<ThreeElements['group'], 'ref'> & {
  /** 'none' | 'loop' | 'pingpong' */
  loopMode?: LoopMode
  /** Global motion speed multiplier. 1 = normal speed, 0.5 = half speed, 10 = ten times speed. */
  timeScale?: number
  /** Additive random amplitude for `timeScale` (sampled once at mount). Requires explicit `timeScale`. */
  randomTimeScale?: number
  /** Global acceleration amount for timeScale over MotionSystem global clock. */
  timeScaleAcceleration?: number
  /** Curve used when resolving timeScaleAcceleration growth over global motion clock. */
  timeScaleAccelerationCurve?: TimeScaleAccelerationCurve
  /** Override acceleration for position channel (number = all axes, object = per-axis). */
  timeScaleAccelerationPosition?: PerAxisOverride<number>
  /** Override acceleration for rotation channel (number = all axes, object = per-axis). */
  timeScaleAccelerationRotation?: PerAxisOverride<number>
  /** Override acceleration for scale channel (number = all axes, object = per-axis). */
  timeScaleAccelerationScale?: PerAxisOverride<number>
  positionVelocity?: Vec3Like
  /** Degrees per second */
  rotationVelocity?: Vec3Like
  scaleVelocity?: Vec3Like
  /** Additive random amplitude applied once at mount: final = base + random(-a, +a). */
  randomPositionVelocity?: RandomPerAxis
  /** Additive random amplitude applied once at mount: final = base + random(-a, +a). */
  randomRotationVelocity?: RandomPerAxis
  /** Additive random amplitude applied once at mount: final = base + random(-a, +a). */
  randomScaleVelocity?: RandomPerAxis
  positionRange?: AxisRangeMap
  /** In degrees */
  rotationRange?: AxisRangeMap
  scaleRange?: AxisRangeMap
  /** Time offset in seconds. Negative = start behind, positive = start ahead. */
  offset?: number
  /** Additive random amplitude for `offset`, sampled once at mount. */
  randomOffset?: number
  /** Override loopMode for position (string = all axes, object = per-axis). */
  positionLoopMode?: PerAxisOverride<LoopMode>
  /** Override loopMode for rotation (string = all axes, object = per-axis). */
  rotationLoopMode?: PerAxisOverride<LoopMode>
  /** Override loopMode for scale (string = all axes, object = per-axis). */
  scaleLoopMode?: PerAxisOverride<LoopMode>
  /** Override offset for position in seconds (number = all axes, object = per-axis). */
  positionOffset?: PerAxisOverride<number>
  /** Additive random amplitude for `positionOffset`, sampled once at mount. */
  randomPositionOffset?: RandomPerAxis
  /** Override offset for rotation in seconds (number = all axes, object = per-axis). */
  rotationOffset?: PerAxisOverride<number>
  /** Additive random amplitude for `rotationOffset`, sampled once at mount. */
  randomRotationOffset?: RandomPerAxis
  /** Override offset for scale in seconds (number = all axes, object = per-axis). */
  scaleOffset?: PerAxisOverride<number>
  /** Additive random amplitude for `scaleOffset`, sampled once at mount. */
  randomScaleOffset?: RandomPerAxis
  /** Starting position in the range as normalized 0-1 progress. 0 = range start, 1 = range end. */
  rangeStart?: number
  /** Override rangeStart for position (number = all axes, object = per-axis). */
  positionRangeStart?: PerAxisOverride<number>
  /** Override rangeStart for rotation (number = all axes, object = per-axis). */
  rotationRangeStart?: PerAxisOverride<number>
  /** Override rangeStart for scale (number = all axes, object = per-axis). */
  scaleRangeStart?: PerAxisOverride<number>
  /** Easing curve applied when a range is active. Defaults to 'linear' (no easing). */
  easing?: EasingName
  /** Override easing for position (string = all axes, object = per-axis). */
  positionEasing?: PerAxisOverride<EasingName>
  /** Override easing for rotation (string = all axes, object = per-axis). */
  rotationEasing?: PerAxisOverride<EasingName>
  /** Override easing for scale (string = all axes, object = per-axis). */
  scaleEasing?: PerAxisOverride<EasingName>
  /** When true, the track is unregistered from the animation loop (zero CPU cost). */
  paused?: boolean
}

export type TransformMotionVelocitySnapshot = {
  linearVelocity: Vec3
  angularVelocity: Vec3
}

export type TransformMotionHandle = {
  getVelocitySnapshot: () => TransformMotionVelocitySnapshot
}

type MotionTrackConfig = {
  positionLoopMode: PerAxisLoopMode
  rotationLoopMode: PerAxisLoopMode
  scaleLoopMode: PerAxisLoopMode
  positionEasing: PerAxisEasing
  rotationEasing: PerAxisEasing
  scaleEasing: PerAxisEasing
  positionVelocity: Vec3
  rotationVelocity: Vec3
  scaleVelocity: Vec3
  timeScale: number
  timeScaleAccelerationCurve: TimeScaleAccelerationCurve
  positionTimeScaleAcceleration: Vec3
  rotationTimeScaleAcceleration: Vec3
  scaleTimeScaleAcceleration: Vec3
  positionRange?: AxisRangeMap
  rotationRange?: AxisRangeMap
  scaleRange?: AxisRangeMap
}

type MotionTrackState = {
  positionDirection: Vec3
  rotationDirection: Vec3
  scaleDirection: Vec3
  positionProgress: Vec3
  rotationProgress: Vec3
  scaleProgress: Vec3
  positionVelocityScratch: Vec3
  rotationVelocityScratch: Vec3
  scaleVelocityScratch: Vec3
  positionAccelerationMultiplierScratch: Vec3
  rotationAccelerationMultiplierScratch: Vec3
  scaleAccelerationMultiplierScratch: Vec3
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
const DEG2RAD = Math.PI / 180

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

function rangeMapToRadians(range?: AxisRangeMap): AxisRangeMap | undefined {
  if (!range) return undefined
  const result: AxisRangeMap = {}
  for (const axis of TRANSFORM_MOTION_AXES) {
    const ar = range[axis]
    if (ar) result[axis] = [ar[0] * DEG2RAD, ar[1] * DEG2RAD]
  }
  return result
}

function resolvePerAxisLoopMode(global: LoopMode, override?: PerAxisOverride<LoopMode>): PerAxisLoopMode {
  if (!override) return [global, global, global]
  if (typeof override === 'string') return [override, override, override]
  return TRANSFORM_MOTION_AXES.map(a => override[a] ?? global) as PerAxisLoopMode
}

function resolvePerAxisEasing(global: EasingName, override?: PerAxisOverride<EasingName>): PerAxisEasing {
  if (!override) return [global, global, global]
  if (typeof override === 'string') return [override, override, override]
  return TRANSFORM_MOTION_AXES.map(a => override[a] ?? global) as PerAxisEasing
}

function resolvePerAxisOffset(global: number, override?: PerAxisOverride<number>): Vec3 {
  if (override === undefined) return [global, global, global]
  if (typeof override === 'number') return [override, override, override]
  return TRANSFORM_MOTION_AXES.map(a => override[a] ?? global) as Vec3
}

function hasOwnAxis(input: object, axis: AxisName): boolean {
  return Object.prototype.hasOwnProperty.call(input, axis)
}

function resolveExplicitAxesForVec3Like(input?: Vec3Like): AxisEnabledMap {
  if (input === undefined) return [false, false, false]
  if (Array.isArray(input)) return [true, true, true]
  return TRANSFORM_MOTION_AXES.map((axis) => hasOwnAxis(input, axis)) as AxisEnabledMap
}

function resolveExplicitAxesForPerAxisOverride(input?: PerAxisOverride<number>): AxisEnabledMap {
  if (input === undefined) return [false, false, false]
  if (typeof input === 'number') return [true, true, true]
  return TRANSFORM_MOTION_AXES.map((axis) => hasOwnAxis(input, axis)) as AxisEnabledMap
}

function resolveRandomAmplitude(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.abs(value)
}

function resolveTimeScale(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.max(0, value)
}

function resolveTimeScaleAcceleration(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return value
}

function resolvePerAxisAcceleration(
  globalAcceleration: number,
  override?: PerAxisOverride<number>,
): Vec3 {
  if (override === undefined) {
    return [globalAcceleration, globalAcceleration, globalAcceleration]
  }
  if (typeof override === 'number') {
    const value = resolveTimeScaleAcceleration(override)
    return [value, value, value]
  }
  return TRANSFORM_MOTION_AXES.map((axis) => (
    resolveTimeScaleAcceleration(override[axis] ?? globalAcceleration)
  )) as Vec3
}

function resolveAccelerationMultipliers(
  accelerationByAxis: Vec3,
  curve: TimeScaleAccelerationCurve,
  clockSeconds: number,
  out: Vec3,
): void {
  out[0] = resolveCurveAccelerationMultiplier(accelerationByAxis[0], curve, clockSeconds)
  out[1] = resolveCurveAccelerationMultiplier(accelerationByAxis[1], curve, clockSeconds)
  out[2] = resolveCurveAccelerationMultiplier(accelerationByAxis[2], curve, clockSeconds)
}

function applyAxisMultipliers(base: Vec3, multipliers: Vec3, out: Vec3): void {
  out[0] = base[0] * multipliers[0]
  out[1] = base[1] * multipliers[1]
  out[2] = base[2] * multipliers[2]
}

function sampleSignedRandom(amplitude: number): number {
  if (!(amplitude > 0)) return 0
  return (Math.random() * 2 - 1) * amplitude
}

function sampleRandomPerAxis(input?: RandomPerAxis): Vec3 {
  if (input === undefined) return [0, 0, 0]
  if (typeof input === 'number') {
    const sampled = sampleSignedRandom(resolveRandomAmplitude(input))
    return [sampled, sampled, sampled]
  }
  return TRANSFORM_MOTION_AXES.map((axis) => (
    sampleSignedRandom(resolveRandomAmplitude(input[axis]))
  )) as Vec3
}

function applyRandomDelta(base: Vec3, delta: Vec3, enabledAxes: AxisEnabledMap): Vec3 {
  return base.map((baseValue, index) => (
    enabledAxes[index] ? baseValue + (delta[index] ?? 0) : baseValue
  )) as Vec3
}

function scaleVec3(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar]
}

function wrapProgress(t: number): number {
  let v = t % 1
  if (v < 0) v += 1
  return v
}

function bounceProgress(t: number, direction: number): { t: number; direction: number } {
  let v = t
  let dir = direction
  while (v > 1 || v < 0) {
    if (v > 1) {
      v = 2 - v
      dir = -Math.abs(dir)
    } else if (v < 0) {
      v = -v
      dir = Math.abs(dir)
    }
  }
  return { t: v, direction: dir }
}

function updateVector(
  vector: XYZLike,
  velocity: Vec3,
  range: AxisRangeMap | undefined,
  direction: Vec3,
  loopModes: PerAxisLoopMode,
  easings: PerAxisEasing,
  progress: Vec3,
  delta: number,
) {
  TRANSFORM_MOTION_AXES.forEach((axis, index) => {
    const speed = velocity[index] ?? 0
    if (speed === 0) return

    const lm = loopModes[index]
    const easing = easings[index]
    const axisRange = range?.[axis]

    if (easing !== 'linear' && axisRange && lm !== 'none') {
      const [min, max] = normalizeRange(axisRange)
      const span = max - min
      if (span <= 0) return

      const dt = (Math.abs(speed) / span) * delta
      const dirValue = direction[index] ?? 1
      let t = progress[index] + dt * dirValue

      if (lm === 'loop') {
        t = wrapProgress(t)
      } else {
        const result = bounceProgress(t, dirValue)
        t = result.t
        direction[index] = result.direction
      }

      progress[index] = t
      vector[axis] = min + applyEasing(t, easing) * span
      return
    }

    const directionValue = direction[index] ?? 1
    const step = speed * directionValue * delta
    const next = vector[axis] + step

    if (!axisRange || lm === 'none') {
      vector[axis] = next
      return
    }

    if (lm === 'loop') {
      vector[axis] = applyLoop(next, axisRange)
      return
    }

    const pingPongResult = applyPingPong(next, directionValue, axisRange)
    direction[index] = pingPongResult.direction
    vector[axis] = pingPongResult.value
  })
}

const EASING_DERIVATIVE_EPSILON = 1e-4

function estimateEasingSlope(progress: number, easing: EasingName): number {
  const t = Math.max(0, Math.min(1, progress))
  const h = EASING_DERIVATIVE_EPSILON

  if (t <= h) {
    return (applyEasing(t + h, easing) - applyEasing(t, easing)) / h
  }
  if (t >= 1 - h) {
    return (applyEasing(t, easing) - applyEasing(t - h, easing)) / h
  }

  return (applyEasing(t + h, easing) - applyEasing(t - h, easing)) / (2 * h)
}

function resolveInstantAxisVelocity(
  speed: number,
  direction: number,
  axisRange: AxisRange | undefined,
  loopMode: LoopMode,
  easing: EasingName,
  progress: number,
): number {
  if (speed === 0) return 0

  const dir = direction === 0 ? 1 : direction
  if (easing !== 'linear' && axisRange && loopMode !== 'none') {
    const [min, max] = normalizeRange(axisRange)
    const span = max - min
    if (span <= 0) return 0

    const slope = estimateEasingSlope(progress, easing)
    const progressRate = (Math.abs(speed) / span) * dir
    return slope * span * progressRate
  }

  return speed * dir
}

function resolveInstantVelocityVector(
  velocity: Vec3,
  range: AxisRangeMap | undefined,
  direction: Vec3,
  loopModes: PerAxisLoopMode,
  easings: PerAxisEasing,
  progress: Vec3,
): Vec3 {
  const result: Vec3 = [0, 0, 0]
  TRANSFORM_MOTION_AXES.forEach((axis, index) => {
    result[index] = resolveInstantAxisVelocity(
      velocity[index] ?? 0,
      direction[index] ?? 1,
      range?.[axis],
      loopModes[index],
      easings[index],
      progress[index] ?? 0,
    )
  })
  return result
}

function toWorldVelocity(
  localVelocity: Vec3,
  object: THREE.Object3D,
  parentQuaternion: THREE.Quaternion,
  scratch: THREE.Vector3,
): Vec3 {
  parentQuaternion.identity()
  object.parent?.getWorldQuaternion(parentQuaternion)
  scratch.set(localVelocity[0], localVelocity[1], localVelocity[2]).applyQuaternion(parentQuaternion)
  return [scratch.x, scratch.y, scratch.z]
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
    if (!isMotionSystemFlowActive()) return
    if (!(delta > 0)) return
    const clockSeconds = getGameRunClockSeconds()

    tracksRef.current.forEach((track) => {
      const object = track.ref.current
      if (!object) return

      const config = track.configRef.current
      const baseDelta = delta * config.timeScale
      if (baseDelta === 0) return

      resolveAccelerationMultipliers(
        config.positionTimeScaleAcceleration,
        config.timeScaleAccelerationCurve,
        clockSeconds,
        track.state.positionAccelerationMultiplierScratch,
      )
      resolveAccelerationMultipliers(
        config.rotationTimeScaleAcceleration,
        config.timeScaleAccelerationCurve,
        clockSeconds,
        track.state.rotationAccelerationMultiplierScratch,
      )
      resolveAccelerationMultipliers(
        config.scaleTimeScaleAcceleration,
        config.timeScaleAccelerationCurve,
        clockSeconds,
        track.state.scaleAccelerationMultiplierScratch,
      )
      applyAxisMultipliers(
        config.positionVelocity,
        track.state.positionAccelerationMultiplierScratch,
        track.state.positionVelocityScratch,
      )
      applyAxisMultipliers(
        config.rotationVelocity,
        track.state.rotationAccelerationMultiplierScratch,
        track.state.rotationVelocityScratch,
      )
      applyAxisMultipliers(
        config.scaleVelocity,
        track.state.scaleAccelerationMultiplierScratch,
        track.state.scaleVelocityScratch,
      )

      updateVector(
        object.position,
        track.state.positionVelocityScratch,
        config.positionRange,
        track.state.positionDirection,
        config.positionLoopMode,
        config.positionEasing,
        track.state.positionProgress,
        baseDelta,
      )
      updateVector(
        object.rotation,
        track.state.rotationVelocityScratch,
        config.rotationRange,
        track.state.rotationDirection,
        config.rotationLoopMode,
        config.rotationEasing,
        track.state.rotationProgress,
        baseDelta,
      )
      updateVector(
        object.scale,
        track.state.scaleVelocityScratch,
        config.scaleRange,
        track.state.scaleDirection,
        config.scaleLoopMode,
        config.scaleEasing,
        track.state.scaleProgress,
        baseDelta,
      )
    })
  })

  return (
    <MotionRegistryContext.Provider value={registry}>
      {children}
    </MotionRegistryContext.Provider>
  )
}

export const TransformMotion = forwardRef<TransformMotionHandle, TransformMotionProps>(function TransformMotion({
  children,
  loopMode,
  timeScale,
  randomTimeScale,
  timeScaleAcceleration,
  timeScaleAccelerationCurve,
  timeScaleAccelerationPosition,
  timeScaleAccelerationRotation,
  timeScaleAccelerationScale,
  positionVelocity,
  rotationVelocity,
  scaleVelocity,
  randomPositionVelocity,
  randomRotationVelocity,
  randomScaleVelocity,
  positionRange,
  rotationRange,
  scaleRange,
  offset,
  randomOffset,
  positionLoopMode,
  rotationLoopMode,
  scaleLoopMode,
  positionOffset,
  randomPositionOffset,
  rotationOffset,
  randomRotationOffset,
  scaleOffset,
  randomScaleOffset,
  rangeStart,
  positionRangeStart,
  rotationRangeStart,
  scaleRangeStart,
  easing,
  positionEasing,
  rotationEasing,
  scaleEasing,
  paused,
  ...groupProps
}, forwardedRef) {
  const registry = useContext(MotionRegistryContext)
  if (!registry) {
    throw new Error('TransformMotion must be used inside MotionSystemProvider')
  }

  const effectiveLoopMode: LoopMode = loopMode ?? (hasAxisRange(positionRange) ? 'loop' : 'none')
  const ref = useRef<THREE.Group | null>(null)
  const effectiveEasing: EasingName = easing ?? 'linear'
  const randomProfileRef = useRef<{
    positionVelocityDelta: Vec3
    rotationVelocityDelta: Vec3
    scaleVelocityDelta: Vec3
    timeScaleDelta: number
    offsetDelta: number
    positionOffsetDelta: Vec3
    rotationOffsetDelta: Vec3
    scaleOffsetDelta: Vec3
  } | null>(null)
  if (!randomProfileRef.current) {
    randomProfileRef.current = {
      positionVelocityDelta: sampleRandomPerAxis(randomPositionVelocity),
      rotationVelocityDelta: sampleRandomPerAxis(randomRotationVelocity),
      scaleVelocityDelta: sampleRandomPerAxis(randomScaleVelocity),
      timeScaleDelta: timeScale === undefined ? 0 : sampleSignedRandom(resolveRandomAmplitude(randomTimeScale)),
      offsetDelta: sampleSignedRandom(resolveRandomAmplitude(randomOffset)),
      positionOffsetDelta: sampleRandomPerAxis(randomPositionOffset),
      rotationOffsetDelta: sampleRandomPerAxis(randomRotationOffset),
      scaleOffsetDelta: sampleRandomPerAxis(randomScaleOffset),
    }
  }
  const randomProfile = randomProfileRef.current

  const positionVelocityAxes = resolveExplicitAxesForVec3Like(positionVelocity)
  const rotationVelocityAxes = resolveExplicitAxesForVec3Like(rotationVelocity)
  const scaleVelocityAxes = resolveExplicitAxesForVec3Like(scaleVelocity)
  const positionOffsetAxes = resolveExplicitAxesForPerAxisOverride(positionOffset)
  const rotationOffsetAxes = resolveExplicitAxesForPerAxisOverride(rotationOffset)
  const scaleOffsetAxes = resolveExplicitAxesForPerAxisOverride(scaleOffset)

  const randomizedPositionVelocity = applyRandomDelta(
    normalizeVec3Like(positionVelocity),
    randomProfile.positionVelocityDelta,
    positionVelocityAxes,
  )
  const randomizedRotationVelocityDeg = applyRandomDelta(
    normalizeVec3Like(rotationVelocity),
    randomProfile.rotationVelocityDelta,
    rotationVelocityAxes,
  )
  const randomizedScaleVelocity = applyRandomDelta(
    normalizeVec3Like(scaleVelocity),
    randomProfile.scaleVelocityDelta,
    scaleVelocityAxes,
  )
  const baseTimeScale = resolveTimeScale(timeScale ?? 1)
  const effectiveTimeScale = Math.max(0, baseTimeScale + randomProfile.timeScaleDelta)
  const effectiveTimeScaleAccelerationCurve: TimeScaleAccelerationCurve = timeScaleAccelerationCurve ?? 'linear'
  const globalTimeScaleAcceleration = resolveTimeScaleAcceleration(timeScaleAcceleration)
  const resolvedPositionTimeScaleAcceleration = resolvePerAxisAcceleration(
    globalTimeScaleAcceleration,
    timeScaleAccelerationPosition,
  )
  const resolvedRotationTimeScaleAcceleration = resolvePerAxisAcceleration(
    globalTimeScaleAcceleration,
    timeScaleAccelerationRotation,
  )
  const resolvedScaleTimeScaleAcceleration = resolvePerAxisAcceleration(
    globalTimeScaleAcceleration,
    timeScaleAccelerationScale,
  )

  const computedConfig = useMemo<MotionTrackConfig>(() => ({
    positionLoopMode: resolvePerAxisLoopMode(effectiveLoopMode, positionLoopMode),
    rotationLoopMode: resolvePerAxisLoopMode(effectiveLoopMode, rotationLoopMode),
    scaleLoopMode: resolvePerAxisLoopMode(effectiveLoopMode, scaleLoopMode),
    positionEasing: resolvePerAxisEasing(effectiveEasing, positionEasing),
    rotationEasing: resolvePerAxisEasing(effectiveEasing, rotationEasing),
    scaleEasing: resolvePerAxisEasing(effectiveEasing, scaleEasing),
    positionVelocity: randomizedPositionVelocity,
    rotationVelocity: randomizedRotationVelocityDeg.map(v => v * DEG2RAD) as Vec3,
    scaleVelocity: randomizedScaleVelocity,
    timeScale: effectiveTimeScale,
    timeScaleAccelerationCurve: effectiveTimeScaleAccelerationCurve,
    positionTimeScaleAcceleration: resolvedPositionTimeScaleAcceleration,
    rotationTimeScaleAcceleration: resolvedRotationTimeScaleAcceleration,
    scaleTimeScaleAcceleration: resolvedScaleTimeScaleAcceleration,
    positionRange,
    rotationRange: rangeMapToRadians(rotationRange),
    scaleRange,
  }), [
    effectiveLoopMode,
    effectiveEasing,
    randomizedPositionVelocity,
    randomizedRotationVelocityDeg,
    randomizedScaleVelocity,
    effectiveTimeScale,
    effectiveTimeScaleAccelerationCurve,
    resolvedPositionTimeScaleAcceleration,
    resolvedRotationTimeScaleAcceleration,
    resolvedScaleTimeScaleAcceleration,
    positionRange,
    rotationRange,
    scaleRange,
    positionLoopMode,
    rotationLoopMode,
    scaleLoopMode,
    positionEasing,
    rotationEasing,
    scaleEasing,
  ])
  const configRef = useRef<MotionTrackConfig>(computedConfig)
  const stateRef = useRef<MotionTrackState>({
    positionDirection: [1, 1, 1],
    rotationDirection: [1, 1, 1],
    scaleDirection: [1, 1, 1],
    positionProgress: [0, 0, 0],
    rotationProgress: [0, 0, 0],
    scaleProgress: [0, 0, 0],
    positionVelocityScratch: [0, 0, 0],
    rotationVelocityScratch: [0, 0, 0],
    scaleVelocityScratch: [0, 0, 0],
    positionAccelerationMultiplierScratch: [1, 1, 1],
    rotationAccelerationMultiplierScratch: [1, 1, 1],
    scaleAccelerationMultiplierScratch: [1, 1, 1],
  })
  const parentWorldQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const worldLinearVelocityScratch = useMemo(() => new THREE.Vector3(), [])
  const worldAngularVelocityScratch = useMemo(() => new THREE.Vector3(), [])

  useImperativeHandle(forwardedRef, () => ({
    getVelocitySnapshot: () => {
      const object = ref.current
      if (!object) {
        return {
          linearVelocity: [0, 0, 0],
          angularVelocity: [0, 0, 0],
        }
      }

      const config = configRef.current
      const state = stateRef.current
      const localLinearVelocity = resolveInstantVelocityVector(
        config.positionVelocity,
        config.positionRange,
        state.positionDirection,
        config.positionLoopMode,
        config.positionEasing,
        state.positionProgress,
      )
      const localAngularVelocity = resolveInstantVelocityVector(
        config.rotationVelocity,
        config.rotationRange,
        state.rotationDirection,
        config.rotationLoopMode,
        config.rotationEasing,
        state.rotationProgress,
      )
      const clockSeconds = getGameRunClockSeconds()
      resolveAccelerationMultipliers(
        config.positionTimeScaleAcceleration,
        config.timeScaleAccelerationCurve,
        clockSeconds,
        state.positionAccelerationMultiplierScratch,
      )
      resolveAccelerationMultipliers(
        config.rotationTimeScaleAcceleration,
        config.timeScaleAccelerationCurve,
        clockSeconds,
        state.rotationAccelerationMultiplierScratch,
      )
      applyAxisMultipliers(
        localLinearVelocity,
        state.positionAccelerationMultiplierScratch,
        state.positionVelocityScratch,
      )
      applyAxisMultipliers(
        localAngularVelocity,
        state.rotationAccelerationMultiplierScratch,
        state.rotationVelocityScratch,
      )
      const scaledLinearVelocity = scaleVec3(state.positionVelocityScratch, config.timeScale)
      const scaledAngularVelocity = scaleVec3(state.rotationVelocityScratch, config.timeScale)

      return {
        linearVelocity: toWorldVelocity(scaledLinearVelocity, object, parentWorldQuaternion, worldLinearVelocityScratch),
        angularVelocity: toWorldVelocity(scaledAngularVelocity, object, parentWorldQuaternion, worldAngularVelocityScratch),
      }
    },
  }), [parentWorldQuaternion, worldLinearVelocityScratch, worldAngularVelocityScratch])

  useEffect(() => {
    configRef.current = computedConfig
  }, [computedConfig])

  useEffect(() => {
    if (paused) return
    return registry.register({
      ref,
      configRef,
      state: stateRef.current,
    })
  }, [registry, paused])

  useEffect(() => {
    const object = ref.current
    if (!object) return
    const config = configRef.current
    const state = stateRef.current

    const globalRangeStart = rangeStart ?? 0
    const posStarts = resolvePerAxisOffset(globalRangeStart, positionRangeStart)
    const rotStarts = resolvePerAxisOffset(globalRangeStart, rotationRangeStart)
    const sclStarts = resolvePerAxisOffset(globalRangeStart, scaleRangeStart)

    const globalOffset = offset === undefined ? 0 : offset + randomProfile.offsetDelta
    const posOffsets = applyRandomDelta(
      resolvePerAxisOffset(globalOffset, positionOffset),
      randomProfile.positionOffsetDelta,
      positionOffsetAxes,
    )
    const rotOffsets = applyRandomDelta(
      resolvePerAxisOffset(globalOffset, rotationOffset),
      randomProfile.rotationOffsetDelta,
      rotationOffsetAxes,
    )
    const sclOffsets = applyRandomDelta(
      resolvePerAxisOffset(globalOffset, scaleOffset),
      randomProfile.scaleOffsetDelta,
      scaleOffsetAxes,
    )

    const hasAnyStart = posStarts.some(v => v !== 0) || rotStarts.some(v => v !== 0) || sclStarts.some(v => v !== 0)
    const hasAnyOffset = posOffsets.some(v => v !== 0) || rotOffsets.some(v => v !== 0) || sclOffsets.some(v => v !== 0)
    if (!hasAnyStart && !hasAnyOffset) return

    TRANSFORM_MOTION_AXES.forEach((axis, i) => {
      const initAxis = (
        target: XYZLike,
        velocity: Vec3,
        range: AxisRangeMap | undefined,
        lm: LoopMode,
        dirArr: Vec3,
        easingName: EasingName,
        progressArr: Vec3,
        axisRangeStart: number,
        axisOffset: number,
      ) => {
        if (axisRangeStart === 0 && axisOffset === 0) return
        const axisRange = range?.[axis]

        if (easingName !== 'linear' && axisRange && lm !== 'none') {
          const [min, max] = normalizeRange(axisRange)
          const span = max - min
          if (span <= 0) return

          let t = Math.max(0, Math.min(1, axisRangeStart))
          if (axisOffset !== 0) {
            t += (Math.abs(velocity[i]) / span) * axisOffset
          }
          if (lm === 'loop') {
            t = wrapProgress(t)
          } else {
            const result = bounceProgress(t, dirArr[i])
            t = result.t
            dirArr[i] = result.direction
          }
          progressArr[i] = t
          target[axis] = min + applyEasing(t, easingName) * span
          return
        }

        if (axisRange && lm !== 'none' && axisRangeStart !== 0) {
          const [min, max] = normalizeRange(axisRange)
          const span = max - min
          target[axis] = min + Math.max(0, Math.min(1, axisRangeStart)) * span
        }

        if (axisOffset !== 0) {
          target[axis] += velocity[i] * axisOffset
        }

        if (!axisRange || lm === 'none') return
        if (lm === 'loop') {
          target[axis] = applyLoop(target[axis], axisRange)
        } else {
          const r = applyPingPong(target[axis], dirArr[i], axisRange)
          target[axis] = r.value
          dirArr[i] = r.direction
        }
      }

      initAxis(object.position, config.positionVelocity, config.positionRange, config.positionLoopMode[i], state.positionDirection, config.positionEasing[i], state.positionProgress, posStarts[i], posOffsets[i])
      initAxis(object.rotation, config.rotationVelocity, config.rotationRange, config.rotationLoopMode[i], state.rotationDirection, config.rotationEasing[i], state.rotationProgress, rotStarts[i], rotOffsets[i])
      initAxis(object.scale, config.scaleVelocity, config.scaleRange, config.scaleLoopMode[i], state.scaleDirection, config.scaleEasing[i], state.scaleProgress, sclStarts[i], sclOffsets[i])
    })
  }, [])

  return (
    <group {...groupProps}>
      <group ref={ref}>{children}</group>
    </group>
  )
})

TransformMotion.displayName = 'TransformMotion'
