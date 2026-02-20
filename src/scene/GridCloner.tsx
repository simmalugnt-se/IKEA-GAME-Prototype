import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RigidBodyProps } from '@react-three/rapier'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import { SETTINGS, type Vec3 } from '@/settings/GameSettings'
import { applyEasing, clamp01, type EasingName } from '@/utils/easing'
import { GameRigidBody } from '@/physics/GameRigidBody'
import { isCollisionActivatedPhysicsType, type GamePhysicsBodyType } from '@/physics/physicsTypes'
import { getAlignOffset, type Align3 } from '@/geometry/align'
import { BlockElement, resolveBlockSize, type BlockHeightPreset, type BlockPlane, type BlockSizePreset } from '@/primitives/BlockElement'
import { CubeElement } from '@/primitives/CubeElement'
import { CylinderElement } from '@/primitives/CylinderElement'
import { PhysicsWrapper } from '@/physics/PhysicsWrapper'
import { SphereElement } from '@/primitives/SphereElement'
import { toRadians } from '@/scene/SceneHelpers'

export const GRID_CLONER_AXES = ['x', 'y', 'z'] as const
export const GRID_CLONER_TRANSFORM_MODES = ['child', 'cloner'] as const
export const GRID_CLONER_LOOP_MODES = ['none', 'loop', 'pingpong'] as const
export const GRID_CLONER_UNIT_PRESETS = ['lg', 'md', 'sm', 'xs'] as const
export const GRID_CLONER_CONTOUR_BASE_MODES = ['none', 'quadratic', 'step', 'quantize', 'curve'] as const

export type GridCount = [number, number, number]
export type AxisName = (typeof GRID_CLONER_AXES)[number]
export type TransformMode = (typeof GRID_CLONER_TRANSFORM_MODES)[number]
export type LoopMode = (typeof GRID_CLONER_LOOP_MODES)[number]
type PhysicsBodyType = GamePhysicsBodyType
export type GridUnitPreset = (typeof GRID_CLONER_UNIT_PRESETS)[number]
export type GridUnit = GridUnitPreset | number
export type ContourBaseMode = (typeof GRID_CLONER_CONTOUR_BASE_MODES)[number]
export type ContourMode = ContourBaseMode | EasingName
type RemapCurvePoint = [number, number]

export type GridCollider =
  | {
      shape: 'cuboid'
      halfExtents: Vec3
    }
  | {
      shape: 'ball'
      radius: number
    }
  | {
      shape: 'cylinder'
      halfHeight: number
      radius: number
    }
  | {
      shape: 'auto'
    }

export type GridPhysicsConfig = {
  /**
   * Physics mode:
   * 'fixed' | 'dynamic' | 'kinematicPosition' | 'kinematicVelocity'
   * | 'noneToDynamicOnCollision' | 'solidNoneToDynamicOnCollision' | 'animNoneToDynamicOnCollision'
   */
  type?: PhysicsBodyType
  mass?: number
  friction?: number
  lockRotations?: boolean
  collider?: GridCollider
  colliderOffset?: Vec3
}
export type GridPhysics = PhysicsBodyType | GridPhysicsConfig

export type LinearFieldEffectorConfig = {
  type: 'linear'
  enabled?: boolean
  strength?: number
  axis?: AxisName
  center?: number
  size?: number
  invert?: boolean
  easing?: EasingName
  enableRemap?: boolean
  innerOffset?: number
  remapMin?: number
  remapMax?: number
  clampMin?: boolean
  clampMax?: boolean
  contourMode?: ContourMode
  contourSteps?: number
  contourMultiplier?: number
  contourCurve?: RemapCurvePoint[]
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  hidden?: boolean
  hideThreshold?: number
  color?: number
  materialColors?: Record<string, number>
}

export type RandomEffectorConfig = {
  type: 'random'
  enabled?: boolean
  seed?: number
  strength?: number
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  hidden?: boolean
  hideProbability?: number
  color?: number | number[]
  materialColors?: Record<string, number | number[]>
}

export type NoiseEffectorConfig = {
  type: 'noise'
  enabled?: boolean
  seed?: number
  strength?: number
  frequency?: number | Vec3
  offset?: Vec3
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  hidden?: boolean
  hideThreshold?: number
  color?: number | number[]
  materialColors?: Record<string, number | number[]>
}

export type TimeEffectorConfig = {
  type: 'time'
  enabled?: boolean
  strength?: number
  loopMode?: LoopMode
  easing?: EasingName
  duration?: number
  speed?: number
  timeOffset?: number
  cloneOffset?: number
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  hidden?: boolean
  hideThreshold?: number
  color?: number | number[]
  materialColors?: Record<string, number | number[]>
}

export type GridEffector = LinearFieldEffectorConfig | RandomEffectorConfig | NoiseEffectorConfig | TimeEffectorConfig
export type LinearFieldEffectorProps = Omit<LinearFieldEffectorConfig, 'type'>
export type RandomEffectorProps = Omit<RandomEffectorConfig, 'type'>
export type NoiseEffectorProps = Omit<NoiseEffectorConfig, 'type'>
export type TimeEffectorProps = Omit<TimeEffectorConfig, 'type'>
type EffectorComponentType = 'linear' | 'random' | 'noise' | 'time'

type EffectorMarkerComponent = {
  __gridEffectorType?: EffectorComponentType
}

export type GridClonerProps = {
  children: ReactNode
  count?: GridCount
  spacing?: Vec3
  offset?: Vec3
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  centered?: boolean
  /** 'child' | 'cloner' */
  transformMode?: TransformMode
  enabled?: boolean
  stepOffset?: Vec3
  /** Grid size preset ('lg' | 'md' | 'sm' | 'xs') or explicit multiplier. */
  gridUnit?: GridUnit
  effectors?: GridEffector[]
  /**
   * Either a physics mode string or a physics config object.
   * String modes:
   * 'fixed' | 'dynamic' | 'kinematicPosition' | 'kinematicVelocity'
   * | 'noneToDynamicOnCollision' | 'solidNoneToDynamicOnCollision' | 'animNoneToDynamicOnCollision'
   */
  physics?: GridPhysics
  mass?: number
  friction?: number
  lockRotations?: boolean
  collider?: GridCollider
  colliderOffset?: Vec3
  showDebugEffectors?: boolean
}

type ResolvedGridPhysics =
  | {
      mode: 'auto'
      type: PhysicsBodyType
      mass?: number
      friction?: number
      lockRotations?: boolean
    }
  | {
      mode: 'manual'
      type: PhysicsBodyType
      mass?: number
      friction?: number
      lockRotations?: boolean
      collider: Exclude<GridCollider, { shape: 'auto' }>
      colliderOffset: Vec3
    }

type CloneTransform = {
  key: string
  index: number
  localPosition: Vec3
  position: Vec3
  rotation: Vec3
  scale: Vec3
  hidden: boolean
  color?: number
  materialColors?: Record<string, number>
}

const IDENTITY_POSITION: Vec3 = [0, 0, 0]
const IDENTITY_ROTATION: Vec3 = [0, 0, 0]
const IDENTITY_SCALE: Vec3 = [1, 1, 1]
const GRID_UNIT_PRESET_VALUES: Record<GridUnitPreset, number> = {
  lg: 0.2,
  md: 0.1,
  sm: 0.05,
  xs: 0.025,
}

function clampCount(n: number | undefined): number {
  if (n === undefined || Number.isNaN(n)) return 1
  return Math.max(1, Math.floor(n))
}

function resolveGridUnitMultiplier(gridUnit: GridUnit | undefined): number {
  if (gridUnit === undefined) return 1
  if (typeof gridUnit === 'number') {
    if (!Number.isFinite(gridUnit) || gridUnit === 0) return 1
    return Math.abs(gridUnit)
  }
  return GRID_UNIT_PRESET_VALUES[gridUnit] ?? 1
}

function getEffectorComponentType(type: unknown): EffectorComponentType | null {
  const marker = (type as EffectorMarkerComponent | undefined)?.__gridEffectorType
  if (marker === 'linear' || marker === 'random' || marker === 'noise' || marker === 'time') return marker
  return null
}

function isLinearEffector(effector: GridEffector): effector is LinearFieldEffectorConfig {
  return effector.type === 'linear'
}

function isPhysicsBodyType(value: unknown): value is PhysicsBodyType {
  return value === 'fixed'
    || value === 'dynamic'
    || value === 'kinematicPosition'
    || value === 'kinematicVelocity'
    || value === 'noneToDynamicOnCollision'
    || value === 'solidNoneToDynamicOnCollision'
    || value === 'animNoneToDynamicOnCollision'
}

function isGridPhysicsConfig(value: unknown): value is GridPhysicsConfig {
  if (!value || typeof value !== 'object') return false
  return true
}

function toColliderType(collider: GridCollider): 'cuboid' | 'ball' | 'cylinder' {
  if (collider.shape === 'auto') return 'cuboid'
  if (collider.shape === 'ball') return 'ball'
  if (collider.shape === 'cylinder') return 'cylinder'
  return 'cuboid'
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scaleVec3(value: Vec3, multiplier: number): Vec3 {
  if (multiplier === 1) return value
  return [
    value[0] * multiplier,
    value[1] * multiplier,
    value[2] * multiplier,
  ]
}

function scaleOptionalVec3(value: Vec3 | undefined, multiplier: number): Vec3 | undefined {
  if (!value) return undefined
  return scaleVec3(value, multiplier)
}

function addScaledVec3(base: Vec3, delta: Vec3, amount: number): Vec3 {
  return [
    base[0] + (delta[0] * amount),
    base[1] + (delta[1] * amount),
    base[2] + (delta[2] * amount),
  ]
}

function hasNonZeroVec3(value: Vec3 | undefined, epsilon = 1e-6): boolean {
  if (!value) return false
  return Math.abs(value[0]) > epsilon || Math.abs(value[1]) > epsilon || Math.abs(value[2]) > epsilon
}

function wrap01(value: number): number {
  const wrapped = value % 1
  return wrapped < 0 ? wrapped + 1 : wrapped
}

function pingPong01(value: number): number {
  const wrapped = value % 2
  const positive = wrapped < 0 ? wrapped + 2 : wrapped
  return positive <= 1 ? positive : 2 - positive
}

function normalizeFrequency(frequency: number | Vec3 | undefined): Vec3 {
  if (typeof frequency === 'number') return [frequency, frequency, frequency]
  if (isVec3(frequency)) return frequency
  return [1, 1, 1]
}

function axisToIndex(axis: AxisName): 0 | 1 | 2 {
  if (axis === 'x') return 0
  if (axis === 'z') return 2
  return 1
}

function applyContour(
  value: number,
  mode: ContourMode,
  steps: number,
  curve: RemapCurvePoint[] | undefined,
): number {
  if (mode === 'none') {
    return value
  }

  if (mode === 'quadratic') {
    const sign = value < 0 ? -1 : 1
    const abs = Math.abs(value)
    return sign * abs * abs
  }

  if (mode === 'step') {
    return clamp01(value) >= 0.5 ? 1 : 0
  }

  if (mode === 'quantize') {
    const quantSteps = Math.max(2, Math.round(steps))
    const normalized = clamp01(value)
    return Math.round(normalized * (quantSteps - 1)) / (quantSteps - 1)
  }

  if (mode === 'curve') {
    const points = (curve && curve.length >= 2)
      ? [...curve].sort((a, b) => a[0] - b[0])
      : [[0, 0], [1, 1]]

    const x = clamp01(value)
    if (x <= points[0][0]) return points[0][1]
    if (x >= points[points.length - 1][0]) return points[points.length - 1][1]

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const next = points[i]
      if (x <= next[0]) {
        const span = Math.max(0.00001, next[0] - prev[0])
        const t = (x - prev[0]) / span
        return prev[1] + ((next[1] - prev[1]) * t)
      }
    }

    return points[points.length - 1][1]
  }

  // If mode is not one of the contour base modes above, we treat it as an easing name.
  return applyEasing(value, mode)
}

function remapLinearWeight(progress: number, effector: LinearFieldEffectorConfig): number {
  if (!(effector.enableRemap ?? false)) {
    return applyEasing(clamp01(progress), effector.easing ?? 'smooth')
  }

  let value = progress
  const innerOffset = clamp01(effector.innerOffset ?? 0)
  if (innerOffset > 0) {
    value = (value - innerOffset) / Math.max(0.00001, 1 - innerOffset)
  }

  const remapMin = effector.remapMin ?? 0
  const remapMax = effector.remapMax ?? 1
  const remapSpan = remapMax - remapMin
  if (Math.abs(remapSpan) > 0.00001) {
    value = (value - remapMin) / remapSpan
  } else {
    value = 0
  }

  const shouldClampMin = effector.clampMin ?? true
  const shouldClampMax = effector.clampMax ?? true
  if (shouldClampMin && value < 0) value = 0
  if (shouldClampMax && value > 1) value = 1

  const contourMode = effector.contourMode ?? 'none'
  const contourSteps = effector.contourSteps ?? 6
  value = applyContour(value, contourMode, contourSteps, effector.contourCurve)

  const contourMultiplier = effector.contourMultiplier ?? 1
  return value * contourMultiplier
}

function evaluateTimeWeight(timeSeconds: number, cloneIndex: number, effector: TimeEffectorConfig): number {
  const speed = effector.speed ?? 1
  const duration = Math.max(0.0001, effector.duration ?? 1)
  const timeOffset = effector.timeOffset ?? 0
  const cloneOffset = effector.cloneOffset ?? 0
  const loopMode = effector.loopMode ?? 'loop'
  const easing = effector.easing ?? 'linear'
  const progress = ((timeSeconds * speed) + timeOffset + (cloneIndex * cloneOffset)) / duration

  if (loopMode === 'none') {
    return applyEasing(clamp01(progress), easing)
  }

  if (loopMode === 'pingpong') {
    return applyEasing(pingPong01(progress), easing)
  }

  return applyEasing(wrap01(progress), easing)
}

function random01(seed: number, a: number, b = 0, c = 0): number {
  let h = seed ^ (a * 374761393) ^ (b * 668265263) ^ (c * 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function randomSigned(seed: number, a: number, b = 0, c = 0): number {
  return (random01(seed, a, b, c) * 2) - 1
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value)
    && value.length === 3
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && typeof value[2] === 'number'
}

function isAlign3(value: unknown): value is Align3 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  const isNumber = (x: unknown) => x === undefined || typeof x === 'number'
  return isNumber(candidate.x) && isNumber(candidate.y) && isNumber(candidate.z)
}

function isBlockSizePreset(value: unknown): value is BlockSizePreset {
  return value === 'lg' || value === 'md' || value === 'sm' || value === 'xs' || value === 'xxs'
}

function isBlockHeightPreset(value: unknown): value is BlockHeightPreset {
  return value === 'sm' || value === 'md' || value === 'lg'
}

function isBlockPlane(value: unknown): value is BlockPlane {
  return value === 'x' || value === 'y' || value === 'z'
}

function isPrimitiveType(type: unknown): boolean {
  return type === CubeElement
    || type === SphereElement
    || type === CylinderElement
    || type === BlockElement
}

function resolveAutoColliderFromChild(
  primaryChild: ReactElement<Record<string, unknown>> | null,
  transformMode: TransformMode,
  childLocalPosition: Vec3,
): { collider: Exclude<GridCollider, { shape: 'auto' }>; colliderOffset: Vec3 } {
  if (!primaryChild) {
    return {
      collider: { shape: 'cuboid', halfExtents: [0.5, 0.5, 0.5] },
      colliderOffset: transformMode === 'child' ? childLocalPosition : IDENTITY_POSITION,
    }
  }

  const props = (primaryChild.props ?? {}) as Record<string, unknown>
  const includeChildPosition = transformMode === 'child'

  if (primaryChild.type === CubeElement) {
    const size: Vec3 = isVec3(props.size) ? props.size : [1, 1, 1]
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset(size, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (primaryChild.type === SphereElement) {
    const radius = typeof props.radius === 'number' ? props.radius : 0.5
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([radius * 2, radius * 2, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'ball', radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (primaryChild.type === CylinderElement) {
    const radius = typeof props.radius === 'number' ? props.radius : 0.5
    const height = typeof props.height === 'number' ? props.height : 1
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([radius * 2, height, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'cylinder', halfHeight: height / 2, radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (primaryChild.type === BlockElement) {
    const sizePreset = isBlockSizePreset(props.sizePreset) ? props.sizePreset : 'lg'
    const heightPreset = isBlockHeightPreset(props.heightPreset) ? props.heightPreset : 'sm'
    const plane = isBlockPlane(props.plane) ? props.plane : 'y'
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)

    const size = resolveBlockSize(sizePreset, heightPreset, plane)
    const alignOffset = getAlignOffset(size, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  return {
    collider: { shape: 'cuboid', halfExtents: [0.5, 0.5, 0.5] },
    colliderOffset: includeChildPosition ? childLocalPosition : IDENTITY_POSITION,
  }
}

function scaleColliderArgs(
  collider: Exclude<GridCollider, { shape: 'auto' }>,
  scale: Vec3,
): [number] | [number, number] | [number, number, number] {
  const sx = Math.abs(scale[0])
  const sy = Math.abs(scale[1])
  const sz = Math.abs(scale[2])

  if (collider.shape === 'ball') {
    const maxScale = Math.max(sx, sy, sz)
    return [collider.radius * maxScale]
  }

  if (collider.shape === 'cylinder') {
    return [collider.halfHeight * sy, collider.radius * Math.max(sx, sz)]
  }

  return [
    collider.halfExtents[0] * sx,
    collider.halfExtents[1] * sy,
    collider.halfExtents[2] * sz,
  ]
}

function normalizeScale(scale: Vec3): Vec3 {
  return [
    Math.max(0.0001, scale[0]),
    Math.max(0.0001, scale[1]),
    Math.max(0.0001, scale[2]),
  ]
}

function evaluateLinearFieldWeight(localPosition: Vec3, effector: LinearFieldEffectorConfig): number {
  const axis = effector.axis ?? 'y'
  const axisIndex = axisToIndex(axis)
  const center = effector.center ?? 0
  const size = Math.max(0.00001, Math.abs(effector.size ?? 1))
  const start = center - (size / 2)
  const strength = clamp01(effector.strength ?? 1)

  let progress = (localPosition[axisIndex] - start) / size

  if (effector.invert) {
    progress = 1 - progress
  }

  return remapLinearWeight(progress, effector) * strength
}

function getPlaneDebugSize(axis: AxisName, size: number, bounds: Vec3): Vec3 {
  const clamped = Math.max(0.001, Math.abs(size))
  if (axis === 'x') return [clamped, bounds[1], bounds[2]]
  if (axis === 'z') return [bounds[0], bounds[1], clamped]
  return [bounds[0], clamped, bounds[2]]
}

function getAxisDirection(axis: AxisName): Vec3 {
  if (axis === 'x') return [1, 0, 0]
  if (axis === 'z') return [0, 0, 1]
  return [0, 1, 0]
}

function getArrowHeadRotation(axis: AxisName, positiveDirection: boolean): Vec3 {
  if (axis === 'x') return [0, 0, positiveDirection ? -Math.PI / 2 : Math.PI / 2]
  if (axis === 'z') return [positiveDirection ? Math.PI / 2 : -Math.PI / 2, 0, 0]
  return [positiveDirection ? 0 : Math.PI, 0, 0]
}

function scaleEffectorByUnit(effector: GridEffector, unitMultiplier: number): GridEffector {
  if (unitMultiplier === 1) return effector

  if (isLinearEffector(effector)) {
    return {
      ...effector,
      center: effector.center !== undefined ? effector.center * unitMultiplier : undefined,
      size: effector.size !== undefined ? effector.size * unitMultiplier : undefined,
      position: scaleOptionalVec3(effector.position, unitMultiplier),
    }
  }

  if (effector.type === 'random') {
    return {
      ...effector,
      position: scaleOptionalVec3(effector.position, unitMultiplier),
    }
  }

  if (effector.type === 'noise') {
    return {
      ...effector,
      offset: scaleOptionalVec3(effector.offset, unitMultiplier),
      position: scaleOptionalVec3(effector.position, unitMultiplier),
    }
  }

  return {
    ...effector,
    position: scaleOptionalVec3(effector.position, unitMultiplier),
  }
}

function cloneTransformState(transform: CloneTransform): CloneTransform {
  return {
    ...transform,
    localPosition: [...transform.localPosition] as Vec3,
    position: [...transform.position] as Vec3,
    rotation: [...transform.rotation] as Vec3,
    scale: [...transform.scale] as Vec3,
    materialColors: transform.materialColors ? { ...transform.materialColors } : undefined,
  }
}

/**
 * Linear field effector (C4D-like). Use with `GridCloner` as child.
 * Provides directional falloff with optional remap/contour shaping.
 */
export function LinearFieldEffector(_props: LinearFieldEffectorProps) {
  return null
}

;(LinearFieldEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'linear'

/** Deterministisk random-effector. */
export function RandomEffector(_props: RandomEffectorProps) {
  return null
}

;(RandomEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'random'

/** Spatialt sammanhängande 3D-noise-effector. */
export function NoiseEffector(_props: NoiseEffectorProps) {
  return null
}

;(NoiseEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'noise'

/** Tidsdriven effector med loop/pingpong och clone-offset. */
export function TimeEffector(_props: TimeEffectorProps) {
  return null
}

;(TimeEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'time'

/** GridCloner duplicerar valfria barn i ett 3D-grid med optional effectors/fysik. */
export function GridCloner({
  children,
  count = [1, 1, 1],
  spacing = [1, 1, 1],
  offset = [0, 0, 0],
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  centered = true,
  transformMode = 'cloner',
  enabled = true,
  stepOffset = [0, 0, 0],
  gridUnit,
  effectors = [],
  physics,
  mass,
  friction,
  lockRotations,
  collider,
  colliderOffset,
  showDebugEffectors,
}: GridClonerProps) {
  const unitMultiplier = useMemo(
    () => resolveGridUnitMultiplier(gridUnit),
    [gridUnit],
  )
  const scaledSpacing = useMemo(() => scaleVec3(spacing, unitMultiplier), [spacing, unitMultiplier])
  const scaledOffset = useMemo(() => scaleVec3(offset, unitMultiplier), [offset, unitMultiplier])
  const scaledPosition = useMemo(() => scaleVec3(position, unitMultiplier), [position, unitMultiplier])
  const scaledStepOffset = useMemo(() => scaleVec3(stepOffset, unitMultiplier), [stepOffset, unitMultiplier])
  const scaledColliderOffset = useMemo(
    () => scaleOptionalVec3(colliderOffset, unitMultiplier),
    [colliderOffset, unitMultiplier],
  )
  const baseRotation = useMemo<Vec3>(() => toRadians(rotation), [rotation])

  const normalizedCount = useMemo<GridCount>(() => [
    clampCount(count[0]),
    clampCount(count[1]),
    clampCount(count[2]),
  ], [count])

  const allChildren = useMemo(() => Children.toArray(children), [children])
  const parsedChildren = useMemo(() => {
    const cloneChildren: ReactNode[] = []
    const childEffectors: GridEffector[] = []

    allChildren.forEach((child) => {
      if (!isValidElement(child)) {
        cloneChildren.push(child)
        return
      }

      const effectorType = getEffectorComponentType(child.type)
      if (!effectorType) {
        cloneChildren.push(child)
        return
      }

      const props = (child.props ?? {}) as Record<string, unknown>
      if (effectorType === 'linear') {
        childEffectors.push({
          type: 'linear',
          ...(props as LinearFieldEffectorProps),
        })
        return
      }

      if (effectorType === 'random') {
        childEffectors.push({
          type: 'random',
          ...(props as RandomEffectorProps),
        })
        return
      }

      if (effectorType === 'noise') {
        childEffectors.push({
          type: 'noise',
          ...(props as NoiseEffectorProps),
        })
        return
      }

      childEffectors.push({
        type: 'time',
        ...(props as TimeEffectorProps),
      })
    })

    return {
      cloneChildren,
      childEffectors,
    }
  }, [allChildren])

  const activeEffectors = useMemo(
    () => [...parsedChildren.childEffectors, ...effectors],
    [parsedChildren.childEffectors, effectors],
  )
  const scaledEffectors = useMemo(
    () => activeEffectors.map((effector) => scaleEffectorByUnit(effector, unitMultiplier)),
    [activeEffectors, unitMultiplier],
  )
  const normalizedEffectors = useMemo(
    () => scaledEffectors.map((effector) => {
      if (!effector.rotation) return effector
      return {
        ...effector,
        rotation: toRadians(effector.rotation),
      } as GridEffector
    }),
    [scaledEffectors],
  )
  const hasTimeEffector = useMemo(
    () => normalizedEffectors.some((effector) => effector.type === 'time' && effector.enabled !== false),
    [normalizedEffectors],
  )
  const hasTimeScaleEffector = useMemo(
    () => normalizedEffectors.some((effector) => (
      effector.type === 'time'
      && effector.enabled !== false
      && clamp01(effector.strength ?? 1) > 0
      && hasNonZeroVec3(effector.scale)
    )),
    [normalizedEffectors],
  )
  const [frameTime, setFrameTime] = useState(0)
  useFrame(({ clock }) => {
    if (!hasTimeEffector) return
    setFrameTime(clock.getElapsedTime())
  })
  const noiseGenerator = useMemo(() => new ImprovedNoise(), [])

  const debugBounds = useMemo<Vec3>(() => {
    const [cx, cy, cz] = normalizedCount
    const [sx, sy, sz] = scaledSpacing
    return [
      Math.max(0.1, ((cx - 1) * Math.abs(sx)) + Math.abs(sx)),
      Math.max(0.1, ((cy - 1) * Math.abs(sy)) + Math.abs(sy)),
      Math.max(0.1, ((cz - 1) * Math.abs(sz)) + Math.abs(sz)),
    ]
  }, [normalizedCount, scaledSpacing])

  const shouldShowDebugEffectors = showDebugEffectors ?? SETTINGS.debug.enabled

  const primaryChild = useMemo<ReactElement<Record<string, unknown>> | null>(() => {
    for (const child of parsedChildren.cloneChildren) {
      if (!isValidElement(child)) continue
      return child as ReactElement<Record<string, unknown>>
    }
    return null
  }, [parsedChildren.cloneChildren])

  const primaryChildLocalPosition = useMemo<Vec3>(() => {
    for (const child of parsedChildren.cloneChildren) {
      if (!isValidElement(child)) continue
      const props = (child.props ?? {}) as Record<string, unknown>
      if (isVec3(props.position)) return props.position
    }
    return [0, 0, 0]
  }, [parsedChildren.cloneChildren])

  const resolvedPhysics = useMemo<ResolvedGridPhysics | null>(() => {
    if (!physics) return null

    let type: PhysicsBodyType = 'fixed'
    let resolvedMass = mass
    let resolvedFriction = friction
    let resolvedLockRotations = lockRotations
    let resolvedCollider = collider
    let resolvedColliderOffset = scaledColliderOffset

    if (isPhysicsBodyType(physics)) {
      type = physics
    } else if (isGridPhysicsConfig(physics)) {
      type = physics.type ?? 'fixed'
      if (physics.mass !== undefined) resolvedMass = physics.mass
      if (physics.friction !== undefined) resolvedFriction = physics.friction
      if (physics.lockRotations !== undefined) resolvedLockRotations = physics.lockRotations
      if (physics.collider !== undefined) resolvedCollider = physics.collider
      if (physics.colliderOffset !== undefined) {
        resolvedColliderOffset = scaleVec3(physics.colliderOffset, unitMultiplier)
      }
    }

    const forceInferredManualCollider = hasTimeScaleEffector
      || type === 'noneToDynamicOnCollision'
      || type === 'solidNoneToDynamicOnCollision'

    // Default: låt Rapier auto-skapa colliders från clone-meshen.
    if (!resolvedCollider) {
      if (forceInferredManualCollider) {
        const inferred = resolveAutoColliderFromChild(primaryChild, transformMode, primaryChildLocalPosition)
        return {
          mode: 'manual',
          type,
          mass: resolvedMass,
          friction: resolvedFriction,
          lockRotations: resolvedLockRotations,
          collider: inferred.collider,
          colliderOffset: resolvedColliderOffset ?? inferred.colliderOffset,
        }
      }

      return {
        mode: 'auto',
        type,
        mass: resolvedMass,
        friction: resolvedFriction,
        lockRotations: resolvedLockRotations,
      }
    }

    if (resolvedCollider.shape === 'auto') {
      const inferred = resolveAutoColliderFromChild(primaryChild, transformMode, primaryChildLocalPosition)
      return {
        mode: 'manual',
        type,
        mass: resolvedMass,
        friction: resolvedFriction,
        lockRotations: resolvedLockRotations,
        collider: inferred.collider,
        colliderOffset: resolvedColliderOffset ?? inferred.colliderOffset,
      }
    }

    return {
      mode: 'manual',
      type,
      mass: resolvedMass,
      friction: resolvedFriction,
      lockRotations: resolvedLockRotations,
      collider: resolvedCollider,
      colliderOffset: resolvedColliderOffset
        ?? (transformMode === 'child' ? primaryChildLocalPosition : IDENTITY_POSITION),
    }
  }, [
    physics,
    mass,
    friction,
    lockRotations,
    collider,
    scaledColliderOffset,
    unitMultiplier,
    primaryChild,
    transformMode,
    primaryChildLocalPosition,
    hasTimeScaleEffector,
  ])
  const shouldStripChildPhysics = Boolean(resolvedPhysics)
  const collisionActivatedPhysics = useMemo(
    () => resolvedPhysics ? isCollisionActivatedPhysicsType(resolvedPhysics.type) : false,
    [resolvedPhysics],
  )
  const [collisionActivatedClones, setCollisionActivatedClones] = useState<Record<string, CloneTransform>>({})

  useEffect(() => {
    if (!collisionActivatedPhysics) {
      setCollisionActivatedClones({})
    }
  }, [collisionActivatedPhysics])

  const freezeCloneTransform = useCallback((transform: CloneTransform) => {
    setCollisionActivatedClones((prev) => {
      if (prev[transform.key]) return prev
      return {
        ...prev,
        [transform.key]: cloneTransformState(transform),
      }
    })
  }, [])

  const transforms = useMemo<CloneTransform[]>(() => {
    const [cx, cy, cz] = normalizedCount
    const [sx, sy, sz] = scaledSpacing
    const [ox, oy, oz] = scaledOffset
    const [stepX, stepY, stepZ] = scaledStepOffset

    const startX = centered ? -((cx - 1) * sx) / 2 : 0
    const startY = centered ? -((cy - 1) * sy) / 2 : 0
    const startZ = centered ? -((cz - 1) * sz) / 2 : 0

    const result: CloneTransform[] = []
    let flatIndex = 0
    for (let y = 0; y < cy; y++) {
      for (let z = 0; z < cz; z++) {
        for (let x = 0; x < cx; x++) {
          const localPosition: Vec3 = [
            startX + (x * sx) + ox + (flatIndex * stepX),
            startY + (y * sy) + oy + (flatIndex * stepY),
            startZ + (z * sz) + oz + (flatIndex * stepZ),
          ]

          let finalPosition = addVec3(localPosition, scaledPosition)
          let finalRotation: Vec3 = [...baseRotation]
          let finalScale: Vec3 = [...scale]
          let hidden = false
          let color: number | undefined
          const materialColors: Record<string, number> = {}

          normalizedEffectors.forEach((effector, effectorIndex) => {
            if (effector.enabled === false) return

            if (isLinearEffector(effector)) {
              const weight = evaluateLinearFieldWeight(localPosition, effector)
              if (weight === 0) return
              const remappedWeight = clamp01(weight)

              if (effector.position) {
                finalPosition = addScaledVec3(finalPosition, effector.position, weight)
              }
              if (effector.rotation) {
                finalRotation = addScaledVec3(finalRotation, effector.rotation, weight)
              }
              if (effector.scale) {
                finalScale = addScaledVec3(finalScale, effector.scale, weight)
              }

              if (effector.hidden && remappedWeight >= (effector.hideThreshold ?? 0.5)) {
                hidden = true
              }

              if (effector.color !== undefined) {
                color = effector.color
              }

              if (effector.materialColors) {
                Object.entries(effector.materialColors).forEach(([key, value]) => {
                  materialColors[key] = value
                })
              }

              return
            }

            if (effector.type === 'random') {
              const seed = effector.seed ?? 1337
              const strength = clamp01(effector.strength ?? 1)
              if (strength <= 0) return

              if (effector.position) {
                finalPosition = [
                  finalPosition[0] + (randomSigned(seed, flatIndex, effectorIndex, 11) * effector.position[0] * strength),
                  finalPosition[1] + (randomSigned(seed, flatIndex, effectorIndex, 12) * effector.position[1] * strength),
                  finalPosition[2] + (randomSigned(seed, flatIndex, effectorIndex, 13) * effector.position[2] * strength),
                ]
              }

              if (effector.rotation) {
                finalRotation = [
                  finalRotation[0] + (randomSigned(seed, flatIndex, effectorIndex, 21) * effector.rotation[0] * strength),
                  finalRotation[1] + (randomSigned(seed, flatIndex, effectorIndex, 22) * effector.rotation[1] * strength),
                  finalRotation[2] + (randomSigned(seed, flatIndex, effectorIndex, 23) * effector.rotation[2] * strength),
                ]
              }

              if (effector.scale) {
                finalScale = [
                  finalScale[0] + (randomSigned(seed, flatIndex, effectorIndex, 31) * effector.scale[0] * strength),
                  finalScale[1] + (randomSigned(seed, flatIndex, effectorIndex, 32) * effector.scale[1] * strength),
                  finalScale[2] + (randomSigned(seed, flatIndex, effectorIndex, 33) * effector.scale[2] * strength),
                ]
              }

              const hideChance = clamp01((effector.hideProbability ?? 0) * strength)
              if ((effector.hidden && random01(seed, flatIndex, effectorIndex, 41) < strength)
                || random01(seed, flatIndex, effectorIndex, 42) < hideChance) {
                hidden = true
              }

              if (effector.color !== undefined) {
                if (Array.isArray(effector.color) && effector.color.length > 0) {
                  const i = Math.floor(random01(seed, flatIndex, effectorIndex, 51) * effector.color.length)
                  color = effector.color[Math.min(effector.color.length - 1, i)]
                } else if (typeof effector.color === 'number') {
                  if (random01(seed, flatIndex, effectorIndex, 52) < strength) {
                    color = effector.color
                  }
                }
              }

              if (effector.materialColors) {
                Object.entries(effector.materialColors).forEach(([key, value]) => {
                  if (Array.isArray(value) && value.length > 0) {
                    const i = Math.floor(random01(seed, flatIndex, effectorIndex, 61) * value.length)
                    materialColors[key] = value[Math.min(value.length - 1, i)]
                  } else if (typeof value === 'number') {
                    if (random01(seed, flatIndex, effectorIndex, 62) < strength) {
                      materialColors[key] = value
                    }
                  }
                })
              }
              return
            }

            if (effector.type === 'time') {
              const strength = clamp01(effector.strength ?? 1)
              if (strength <= 0) return

              const weight = evaluateTimeWeight(frameTime, flatIndex, effector)
              const amount = weight * strength
              if (amount <= 0) return

              if (effector.position) {
                finalPosition = addScaledVec3(finalPosition, effector.position, amount)
              }

              if (effector.rotation) {
                finalRotation = addScaledVec3(finalRotation, effector.rotation, amount)
              }

              if (effector.scale) {
                finalScale = addScaledVec3(finalScale, effector.scale, amount)
              }

              if (effector.hidden && amount >= (effector.hideThreshold ?? 0.5)) {
                hidden = true
              }

              if (effector.color !== undefined) {
                if (Array.isArray(effector.color) && effector.color.length > 0) {
                  const i = Math.floor(amount * effector.color.length)
                  color = effector.color[Math.min(effector.color.length - 1, i)]
                } else if (typeof effector.color === 'number') {
                  color = effector.color
                }
              }

              if (effector.materialColors) {
                Object.entries(effector.materialColors).forEach(([key, value]) => {
                  if (Array.isArray(value) && value.length > 0) {
                    const i = Math.floor(amount * value.length)
                    materialColors[key] = value[Math.min(value.length - 1, i)]
                  } else if (typeof value === 'number') {
                    materialColors[key] = value
                  }
                })
              }
              return
            }

            const seed = effector.seed ?? 1337
            const strength = clamp01(effector.strength ?? 1)
            if (strength <= 0) return

            const freq = normalizeFrequency(effector.frequency)
            const noiseOffset = effector.offset ?? IDENTITY_POSITION
            const sampleX = (localPosition[0] * freq[0]) + noiseOffset[0] + (seed * 0.0137)
            const sampleY = (localPosition[1] * freq[1]) + noiseOffset[1] + (seed * 0.0179)
            const sampleZ = (localPosition[2] * freq[2]) + noiseOffset[2] + (seed * 0.0193)

            const noiseBase = noiseGenerator.noise(sampleX, sampleY, sampleZ)
            const noisePosX = noiseGenerator.noise(sampleX + 11.31, sampleY + 7.77, sampleZ + 3.19)
            const noisePosY = noiseGenerator.noise(sampleX + 29.41, sampleY + 13.13, sampleZ + 5.71)
            const noisePosZ = noiseGenerator.noise(sampleX + 47.91, sampleY + 19.19, sampleZ + 9.83)
            const normalized = clamp01((noiseBase + 1) / 2)

            if (effector.position) {
              finalPosition = [
                finalPosition[0] + (noisePosX * effector.position[0] * strength),
                finalPosition[1] + (noisePosY * effector.position[1] * strength),
                finalPosition[2] + (noisePosZ * effector.position[2] * strength),
              ]
            }

            if (effector.rotation) {
              finalRotation = [
                finalRotation[0] + (noisePosX * effector.rotation[0] * strength),
                finalRotation[1] + (noisePosY * effector.rotation[1] * strength),
                finalRotation[2] + (noisePosZ * effector.rotation[2] * strength),
              ]
            }

            if (effector.scale) {
              finalScale = [
                finalScale[0] + (noisePosX * effector.scale[0] * strength),
                finalScale[1] + (noisePosY * effector.scale[1] * strength),
                finalScale[2] + (noisePosZ * effector.scale[2] * strength),
              ]
            }

            if (effector.hidden && normalized >= (effector.hideThreshold ?? 0.65)) {
              hidden = true
            }

            if (effector.color !== undefined) {
              if (Array.isArray(effector.color) && effector.color.length > 0) {
                const i = Math.floor(normalized * effector.color.length)
                color = effector.color[Math.min(effector.color.length - 1, i)]
              } else if (typeof effector.color === 'number') {
                if (normalized <= strength) color = effector.color
              }
            }

            if (effector.materialColors) {
              Object.entries(effector.materialColors).forEach(([key, value]) => {
                if (Array.isArray(value) && value.length > 0) {
                  const i = Math.floor(normalized * value.length)
                  materialColors[key] = value[Math.min(value.length - 1, i)]
                } else if (typeof value === 'number') {
                  if (normalized <= strength) {
                    materialColors[key] = value
                  }
                }
              })
            }
          })

          const computedClone: CloneTransform = {
            key: `${x}-${y}-${z}`,
            index: flatIndex,
            localPosition,
            position: finalPosition,
            rotation: finalRotation,
            scale: normalizeScale(finalScale),
            hidden,
            color,
            materialColors: Object.keys(materialColors).length > 0 ? materialColors : undefined,
          }
          if (collisionActivatedPhysics && collisionActivatedClones[computedClone.key]) {
            result.push(collisionActivatedClones[computedClone.key])
          } else {
            result.push(computedClone)
          }
          flatIndex += 1
        }
      }
    }
    return result
  }, [
    normalizedCount,
    scaledSpacing,
    scaledOffset,
    centered,
    scaledStepOffset,
    scaledPosition,
    baseRotation,
    scale,
    normalizedEffectors,
    noiseGenerator,
    frameTime,
    collisionActivatedPhysics,
    collisionActivatedClones,
  ])

  if (!enabled) return <>{children}</>

  return (
    <group>
      {transforms.map((clone) => {
        const cloneChildren = parsedChildren.cloneChildren.map((child, childIndex) => {
          if (!isValidElement(child)) return child

          const childElement = child as ReactElement<Record<string, unknown>>
          const childProps = (childElement.props ?? {}) as Record<string, unknown>
          const nextProps: Record<string, unknown> = {
            key: `grid-${clone.index}-${childIndex}`,
          }

          if (shouldStripChildPhysics && Object.prototype.hasOwnProperty.call(childProps, 'physics')) {
            nextProps.physics = undefined
          }

          if (transformMode === 'cloner') {
            nextProps.position = IDENTITY_POSITION
            nextProps.rotation = IDENTITY_ROTATION
            nextProps.scale = IDENTITY_SCALE
          }

          if (clone.hidden) {
            if (isPrimitiveType(childElement.type) || Object.prototype.hasOwnProperty.call(childProps, 'hidden')) {
              nextProps.hidden = true
            }
            nextProps.visible = false
          }

          if (clone.color !== undefined) {
            if (isPrimitiveType(childElement.type) || Object.prototype.hasOwnProperty.call(childProps, 'color')) {
              nextProps.color = clone.color
            } else {
              nextProps.materialColor0 = clone.color
            }
          }

          if (clone.materialColors) {
            Object.entries(clone.materialColors).forEach(([key, value]) => {
              if (isPrimitiveType(childElement.type) && key.startsWith('materialColor')) return
              nextProps[key] = value
            })
          }

          return cloneElement(childElement, nextProps)
        })

        if (!resolvedPhysics) {
          return (
            <group
              key={clone.key}
              position={clone.position}
              rotation={clone.rotation}
              scale={clone.scale}
            >
              {cloneChildren}
            </group>
          )
        }

        if (resolvedPhysics.mode === 'auto') {
          return (
            <GameRigidBody
              key={clone.key}
              type={resolvedPhysics.type}
              position={clone.position}
              rotation={clone.rotation}
              onCollisionActivated={collisionActivatedPhysics ? () => freezeCloneTransform(clone) : undefined}
              {...(resolvedPhysics.mass !== undefined ? { mass: resolvedPhysics.mass } : {})}
              {...(resolvedPhysics.friction !== undefined ? { friction: resolvedPhysics.friction } : {})}
              {...(resolvedPhysics.lockRotations ? { lockRotations: true } : {})}
            >
              <group scale={clone.scale}>
                {cloneChildren}
              </group>
            </GameRigidBody>
          )
        }

        const colliderArgs = scaleColliderArgs(resolvedPhysics.collider, clone.scale)
        const scaledColliderPosition: Vec3 = [
          resolvedPhysics.colliderOffset[0] * clone.scale[0],
          resolvedPhysics.colliderOffset[1] * clone.scale[1],
          resolvedPhysics.colliderOffset[2] * clone.scale[2],
        ]

        return (
          <PhysicsWrapper
            key={clone.key}
            physics={resolvedPhysics.type}
            colliderType={toColliderType(resolvedPhysics.collider)}
            colliderArgs={colliderArgs}
            colliderPosition={scaledColliderPosition}
            position={clone.position}
            rotation={clone.rotation}
            mass={resolvedPhysics.mass}
            friction={resolvedPhysics.friction}
            lockRotations={resolvedPhysics.lockRotations}
            syncColliderShape={hasTimeScaleEffector}
            onCollisionActivated={collisionActivatedPhysics ? () => freezeCloneTransform(clone) : undefined}
          >
            <group scale={clone.scale}>
              {cloneChildren}
            </group>
          </PhysicsWrapper>
        )
      })}

      {shouldShowDebugEffectors && scaledEffectors
        .filter((effector): effector is LinearFieldEffectorConfig => isLinearEffector(effector) && effector.enabled !== false)
        .map((effector, index) => {
          const axis = effector.axis ?? 'y'
          const center = effector.center ?? 0
          const size = Math.max(0.001, Math.abs(effector.size ?? 1))
          const half = size / 2
          const axisIndex = axisToIndex(axis)
          const axisDirection = getAxisDirection(axis)
          const directionSign = effector.invert ? -1 : 1
          const headScale = Math.max(0.03, Math.min(debugBounds[0], debugBounds[1], debugBounds[2]) * 0.04)
          const lineColor = effector.invert ? '#ff9f43' : '#2ecc71'
          const thin = Math.max(0.002, Math.min(debugBounds[0], debugBounds[1], debugBounds[2]) * 0.015)
          const planeSize = getPlaneDebugSize(axis, thin, debugBounds)

          const startPosition: Vec3 = [...scaledPosition]
          startPosition[axisIndex] += center - half
          const endPosition: Vec3 = [...scaledPosition]
          endPosition[axisIndex] += center + half

          const arrowStart = directionSign > 0 ? startPosition : endPosition
          const arrowEnd = directionSign > 0 ? endPosition : startPosition
          const arrowHeadRotation = getArrowHeadRotation(axis, directionSign > 0)
          const arrowLinePositions = new Float32Array([
            arrowStart[0], arrowStart[1], arrowStart[2],
            arrowEnd[0], arrowEnd[1], arrowEnd[2],
          ])

          return (
            <group
              key={`linear-field-debug-${index}`}
              userData={{ excludeFromOutlines: true }}
              renderOrder={2000}
            >
              <mesh position={startPosition}>
                <boxGeometry args={planeSize} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              <mesh position={endPosition}>
                <boxGeometry args={planeSize} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              <line>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[arrowLinePositions, 3]} />
                </bufferGeometry>
                <lineBasicMaterial color={lineColor} transparent opacity={0.9} depthWrite={false} />
              </line>

              <mesh
                position={[
                  arrowEnd[0] + (axisDirection[0] * directionSign * headScale * 0.3),
                  arrowEnd[1] + (axisDirection[1] * directionSign * headScale * 0.3),
                  arrowEnd[2] + (axisDirection[2] * directionSign * headScale * 0.3),
                ]}
                rotation={arrowHeadRotation}
              >
                <coneGeometry args={[headScale * 0.2, headScale * 0.6, 12]} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.9} depthWrite={false} />
              </mesh>
            </group>
          )
        })}
    </group>
  )
}
