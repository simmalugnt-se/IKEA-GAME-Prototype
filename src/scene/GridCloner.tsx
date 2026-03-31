import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { SETTINGS, type MaterialColorIndex, type Vec3 } from '@/settings/GameSettings'
import { applyEasing, clamp01, type EasingName } from '@/utils/easing'
import { isCollisionActivatedPhysicsType, type GamePhysicsBodyType } from '@/physics/physicsTypes'
import { getAlignOffset, type Align3 } from '@/geometry/align'
import { BlockElement, resolveBlockSize, type BlockHeightPreset, type BlockPlane, type BlockSizePreset } from '@/primitives/BlockElement'
import { CubeElement } from '@/primitives/CubeElement'
import { CylinderElement } from '@/primitives/CylinderElement'
import { PhysicsWrapper } from '@/physics/PhysicsWrapper'
import { SphereElement } from '@/primitives/SphereElement'
import { TriangleBlockElement, resolveTriangleBlockSize, type TriangleBlockSizePreset, type TriangleBlockHeightPreset, type TriangleBlockPlane } from '@/primitives/TriangleBlockElement'
import { CylinderBlockElement, resolveCylinderBlockSize, type CylinderBlockSizePreset, type CylinderBlockHeightPreset } from '@/primitives/CylinderBlockElement'
import { BallElement, BALL_RADII_M, type BallSizePreset } from '@/primitives/BallElement'
import { DomeBlockElement, DOME_BLOCK_RADII_M, type DomeBlockSizePreset } from '@/primitives/DomeBlockElement'
import { ConeBlockElement, resolveConeBlockSize, type ConeBlockSizePreset, type ConeBlockHeightPreset } from '@/primitives/ConeBlockElement'
import { StepsBlockElement, resolveStepsBlockSize, type StepsBlockSizePreset, type StepsBlockHeightPreset } from '@/primitives/StepsBlockElement'
import { BridgeBlockElement, resolveBridgeBlockSize, type BridgeBlockPlane } from '@/primitives/BridgeBlockElement'
import {
  HalfCylinderBlockElement,
  resolveHalfCylinderBlockSize,
  type HalfCylinderBlockPlane,
  type HalfCylinderBlockSizePreset,
} from '@/primitives/HalfCylinderBlockElement'
import { WedgeElement } from '@/primitives/WedgeElement'
import { DomeElement } from '@/primitives/DomeElement'
import { ConeElement } from '@/primitives/ConeElement'
import { StepsElement } from '@/primitives/StepsElement'
import { toRadians } from '@/scene/SceneHelpers'
import { TransformMotion } from '@/scene/TransformMotion'
import { SeededImprovedNoise } from '@/utils/seededNoise'

export const GRID_CLONER_AXES = ['x', 'y', 'z'] as const
export const GRID_CLONER_ANCHORS = ['start', 'center', 'end'] as const
export const GRID_CLONER_TRANSFORM_MODES = ['child', 'cloner'] as const
export const GRID_CLONER_CHILD_DISTRIBUTIONS = ['iterate', 'random'] as const
export const GRID_CLONER_LOOP_MODES = ['none', 'loop', 'pingpong'] as const
export const GRID_CLONER_UNIT_PRESETS = ['lg', 'md', 'sm', 'xs'] as const
export const GRID_CLONER_CONTOUR_BASE_MODES = ['none', 'quadratic', 'step', 'quantize'] as const
export const GRID_CLONER_EFFECTOR_BLEND_MODES = [
  'normal',
  'min',
  'subtract',
  'multiply',
  'overlay',
  'max',
  'add',
  'screen',
  'clip',
] as const
export const GRID_CLONER_STEP_PROFILES = ['ramp', 'hump'] as const

export type GridCount = [number, number, number]
export type AxisName = (typeof GRID_CLONER_AXES)[number]
export type GridAxisAnchor = (typeof GRID_CLONER_ANCHORS)[number]
export type TransformMode = (typeof GRID_CLONER_TRANSFORM_MODES)[number]
export type ChildDistribution = (typeof GRID_CLONER_CHILD_DISTRIBUTIONS)[number]
export type LoopMode = (typeof GRID_CLONER_LOOP_MODES)[number]
type PhysicsBodyType = GamePhysicsBodyType
export type GridUnitPreset = (typeof GRID_CLONER_UNIT_PRESETS)[number]
export type GridUnit = GridUnitPreset | number
export type ContourBaseMode = (typeof GRID_CLONER_CONTOUR_BASE_MODES)[number]
export type ContourMode = ContourBaseMode | EasingName
export type EffectorBlendMode = (typeof GRID_CLONER_EFFECTOR_BLEND_MODES)[number]
export type StepProfile = (typeof GRID_CLONER_STEP_PROFILES)[number]
export type GridAnchor3 = {
  x: GridAxisAnchor
  y: GridAxisAnchor
  z: GridAxisAnchor
}

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
  restitution?: number
  lockRotations?: boolean
}
export type GridPhysics = PhysicsBodyType | GridPhysicsConfig

type EffectorColorValue = number | number[]
type EffectorMaterialColorValue = Record<string, number | number[]>

type SharedEffectorChannels = {
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  exclude?: boolean
  excludeThreshold?: number
  color?: EffectorColorValue
  materialColors?: EffectorMaterialColorValue
}

type SharedEffectorBase = SharedEffectorChannels & {
  enabled?: boolean
  strength?: number
  blendMode?: EffectorBlendMode
}

type SharedRemapProps = {
  enableRemap?: boolean
  innerOffset?: number
  remapMin?: number
  remapMax?: number
  clampMin?: boolean
  clampMax?: boolean
  contourMode?: ContourMode
  contourSteps?: number
  contourMultiplier?: number
}

export type LinearFieldEffectorConfig = SharedEffectorBase & SharedRemapProps & {
  type: 'linear'
  axis?: AxisName
  center?: number
  size?: number
  fieldPosition?: Vec3
  fieldRotation?: Vec3
  invert?: boolean
}

export type SphericalFieldEffectorConfig = SharedEffectorBase & SharedRemapProps & {
  type: 'spherical'
  fieldPosition?: Vec3
  radius?: number
  invert?: boolean
}

export type PushApartEffectorConfig = SharedEffectorBase & {
  type: 'pushApart'
  radiusOffset?: number
}

export type RandomEffectorConfig = SharedEffectorBase & SharedRemapProps & {
  type: 'random'
  seed?: number
  excludeProbability?: number
  signedPosition?: boolean
  signedRotation?: boolean
  signedScale?: boolean
}

export type NoiseEffectorConfig = SharedEffectorBase & SharedRemapProps & {
  type: 'noise'
  seed?: number
  frequency?: number | Vec3
  offset?: Vec3
  noisePosition?: Vec3
  noisePositionSpeed?: Vec3
  signedPosition?: boolean
  signedRotation?: boolean
  signedScale?: boolean
}

export type TimeEffectorConfig = SharedEffectorBase & {
  type: 'time'
  loopMode?: LoopMode
  easing?: EasingName
  duration?: number
  speed?: number
  timeOffset?: number
  cloneOffset?: number
}

export type StepEffectorConfig = SharedEffectorBase & SharedRemapProps & {
  type: 'step'
  profile?: StepProfile
  easing?: EasingName
  humpEasing?: EasingName
  phaseOffset?: number
}

export type GridEffector =
  | LinearFieldEffectorConfig
  | SphericalFieldEffectorConfig
  | PushApartEffectorConfig
  | RandomEffectorConfig
  | NoiseEffectorConfig
  | TimeEffectorConfig
  | StepEffectorConfig
export type LinearFieldEffectorProps = Omit<LinearFieldEffectorConfig, 'type'>
export type SphericalFieldEffectorProps = Omit<SphericalFieldEffectorConfig, 'type'>
export type PushApartEffectorProps = Omit<PushApartEffectorConfig, 'type'>
export type RandomEffectorProps = Omit<RandomEffectorConfig, 'type'>
export type NoiseEffectorProps = Omit<NoiseEffectorConfig, 'type'>
export type TimeEffectorProps = Omit<TimeEffectorConfig, 'type'>
export type StepEffectorProps = Omit<StepEffectorConfig, 'type'>
type EffectorComponentType = 'linear' | 'spherical' | 'pushApart' | 'random' | 'noise' | 'time' | 'step'

type EffectorMarkerComponent = {
  __gridEffectorType?: EffectorComponentType
}

export type GridClonerProps = {
  children: ReactNode
  count?: GridCount
  spacing?: Vec3
  offset?: Vec3
  rotationOffset?: Vec3
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  anchor?: Partial<GridAnchor3> | GridAnchor3
  /** Legacy fallback for old level data that pre-dates per-axis anchors. */
  centered?: boolean
  /** 'child' | 'cloner' */
  transformMode?: TransformMode
  /** 'iterate' | 'random' for multi-child template selection. */
  childDistribution?: ChildDistribution
  /** Seed used only when childDistribution === 'random'. Unset => random per mount. */
  childRandomSeed?: number
  enabled?: boolean
  /** Grid size preset ('lg' | 'md' | 'sm' | 'xs') or explicit multiplier. */
  gridUnit?: GridUnit
  /**
   * Max clones to mount per frame when physics is active. Spreads Rapier body
   * registration across frames to avoid a single-frame freeze on level load.
   * Defaults to SETTINGS.level.gridClonerSpawnChunkSize. Set to 0 to disable.
   */
  spawnChunkSize?: number
  /**
   * Either a physics mode string or a physics config object.
   * String modes:
   * 'fixed' | 'dynamic' | 'kinematicPosition' | 'kinematicVelocity'
   * | 'noneToDynamicOnCollision' | 'solidNoneToDynamicOnCollision' | 'animNoneToDynamicOnCollision'
   */
  physics?: GridPhysics
  showDebugEffectors?: boolean
  entityPrefix?: string
  /**
   * Optional contagion defaults for all generated clone rigid bodies.
   * If omitted, values are inferred from the template child props.
   */
  contagionCarrier?: boolean
  contagionInfectable?: boolean
  contagionColor?: MaterialColorIndex
}

export type FractureProps = {
  children: ReactNode
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  enabled?: boolean
  gridUnit?: GridUnit
  showDebugEffectors?: boolean
  entityPrefix?: string
}

type ResolvedGridPhysics = {
  type: PhysicsBodyType
  mass?: number
  friction?: number
  restitution?: number
  lockRotations?: boolean
}

type GridRuntimeContextValue = {
  physicsOverride: ResolvedGridPhysics | null
  seedPathSalt: number
  entityPrefix?: string
  contagionOverride?: {
    carrier: boolean
    infectable: boolean
    color: number
  }
}

const GRID_RUNTIME_CONTEXT = createContext<GridRuntimeContextValue>({
  physicsOverride: null,
  seedPathSalt: 0,
})
const GRID_CLONER_DEBUG_TIMING = import.meta.env.DEV

type CloneTransform = {
  key: string
  index: number
  selectedChildIndex: number
  localPosition: Vec3
  position: Vec3
  rotation: Vec3
  scale: Vec3
  excluded: boolean
  mountCost: number
  color?: number
  materialColors?: Record<string, number>
}

type TemplateCloneChild = {
  element: ReactElement<Record<string, unknown>>
  props: Record<string, unknown>
  baseColor: number
  estimatedBodyCost: number
  contagionCarrier: boolean
  contagionInfectable: boolean
  inferredCollider: {
    collider: Exclude<GridCollider, { shape: 'auto' }>
    colliderOffset: Vec3
  }
}

type FractureTemplateChild = {
  element: ReactElement<Record<string, unknown>>
  props: Record<string, unknown>
  basePosition: Vec3
  baseRotation: Vec3
  baseScale: Vec3
  baseColor: number
  contagionCarrier: boolean
  contagionInfectable: boolean
  inferredCollider: {
    collider: Exclude<GridCollider, { shape: 'auto' }>
    colliderOffset: Vec3
  }
}

type FractureChildTransform = {
  key: string
  index: number
  position: Vec3
  rotation: Vec3
  scale: Vec3
  excluded: boolean
  color?: number
  materialColors?: Record<string, number>
}

function cloneFractureTransformState(transform: FractureChildTransform): FractureChildTransform {
  return {
    ...transform,
    position: [...transform.position] as Vec3,
    rotation: [...transform.rotation] as Vec3,
    scale: [...transform.scale] as Vec3,
    materialColors: transform.materialColors ? { ...transform.materialColors } : undefined,
  }
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
  if (
    marker === 'linear'
    || marker === 'spherical'
    || marker === 'pushApart'
    || marker === 'random'
    || marker === 'noise'
    || marker === 'time'
    || marker === 'step'
  ) return marker
  return null
}

function isLinearEffector(effector: GridEffector): effector is LinearFieldEffectorConfig {
  return effector.type === 'linear'
}

function isSphericalEffector(effector: GridEffector): effector is SphericalFieldEffectorConfig {
  return effector.type === 'spherical'
}

function isPushApartEffector(effector: GridEffector): effector is PushApartEffectorConfig {
  return effector.type === 'pushApart'
}

function isStepEffector(effector: GridEffector): effector is StepEffectorConfig {
  return effector.type === 'step'
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

function toColliderType(collider: Exclude<GridCollider, { shape: 'auto' }>): 'cuboid' | 'ball' | 'cylinder' {
  if (collider.shape === 'ball') return 'ball'
  if (collider.shape === 'cylinder') return 'cylinder'
  return 'cuboid'
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
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

function rotateVec3InverseXYZ(value: Vec3, rotation: Vec3): Vec3 {
  let [x, y, z] = value

  if (rotation[2] !== 0) {
    const cos = Math.cos(-rotation[2])
    const sin = Math.sin(-rotation[2])
    const nx = (x * cos) - (y * sin)
    const ny = (x * sin) + (y * cos)
    x = nx
    y = ny
  }

  if (rotation[1] !== 0) {
    const cos = Math.cos(-rotation[1])
    const sin = Math.sin(-rotation[1])
    const nx = (x * cos) + (z * sin)
    const nz = (-x * sin) + (z * cos)
    x = nx
    z = nz
  }

  if (rotation[0] !== 0) {
    const cos = Math.cos(-rotation[0])
    const sin = Math.sin(-rotation[0])
    const ny = (y * cos) - (z * sin)
    const nz = (y * sin) + (z * cos)
    y = ny
    z = nz
  }

  return [x, y, z]
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

function resolveNoiseMotion(value: Vec3 | undefined): Vec3 {
  if (isVec3(value)) return value
  return [0, 0, 0]
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

  // If mode is not one of the contour base modes above, we treat it as an easing name.
  return applyEasing(clamp01(value), mode)
}

function remapEffectorWeight(
  progress: number,
  remap: SharedRemapProps,
): number {
  if (!(remap.enableRemap ?? true)) {
    return clamp01(progress)
  }

  let value = progress
  const innerOffset = clamp01(remap.innerOffset ?? 0)
  if (innerOffset > 0) {
    value = (value - innerOffset) / Math.max(0.00001, 1 - innerOffset)
  }

  const remapMin = remap.remapMin ?? 0
  const remapMax = remap.remapMax ?? 1
  const remapSpan = remapMax - remapMin
  if (Math.abs(remapSpan) > 0.00001) {
    value = (value - remapMin) / remapSpan
  } else {
    value = 0
  }

  const shouldClampMin = remap.clampMin ?? true
  const shouldClampMax = remap.clampMax ?? true
  if (shouldClampMin && value < 0) value = 0
  if (shouldClampMax && value > 1) value = 1

  const contourMode = remap.contourMode ?? 'none'
  const contourSteps = remap.contourSteps ?? 6
  value = applyContour(value, contourMode, contourSteps)

  const contourMultiplier = remap.contourMultiplier ?? 1
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

function evaluateStepProgress(cloneIndex: number, cloneCount: number, effector: StepEffectorConfig): number {
  const span = cloneCount - 1
  const baseProgress = span <= 0 ? 0 : cloneIndex / span
  const phaseOffset = effector.phaseOffset ?? 0
  const shifted = wrap01(baseProgress + phaseOffset)
  const profile = effector.profile ?? 'ramp'

  if (profile === 'hump') {
    const hump = Math.sin(shifted * Math.PI)
    const humpEasing = effector.humpEasing ?? 'smooth'
    return applyEasing(clamp01(hump), humpEasing)
  }

  const easing = effector.easing ?? 'smooth'
  return applyEasing(clamp01(shifted), easing)
}

function resolveBlendMode(mode: GridEffector['blendMode']): NonNullable<GridEffector['blendMode']> {
  if (mode === 'normal'
    || mode === 'min'
    || mode === 'subtract'
    || mode === 'multiply'
    || mode === 'overlay'
    || mode === 'max'
    || mode === 'add'
    || mode === 'screen'
    || mode === 'clip') {
    return mode
  }
  return 'add'
}

function blendWeight(
  mode: NonNullable<GridEffector['blendMode']>,
  previous: number,
  current: number,
): number {
  const prev = clamp01(previous)
  const curr = clamp01(current)
  if (mode === 'min') return Math.min(prev, curr)
  if (mode === 'subtract') return Math.max(0, prev - curr)
  if (mode === 'multiply') return prev * curr
  if (mode === 'overlay') return prev < 0.5 ? 2 * prev * curr : 1 - (2 * (1 - prev) * (1 - curr))
  if (mode === 'max') return Math.max(prev, curr)
  if (mode === 'screen') return 1 - ((1 - prev) * (1 - curr))
  return curr
}

function scaleBlendDeltas(value: Vec3, amount: number): Vec3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount]
}

function resolveExcludeThreshold(effector: GridEffector): number {
  if (effector.type === 'noise') return effector.excludeThreshold ?? 0.65
  return effector.excludeThreshold ?? 0.5
}

function hasExcludeChannel(effector: GridEffector): boolean {
  if (effector.exclude === true) return true
  if (effector.type === 'random') return clamp01(effector.excludeProbability ?? 0) > 0
  return false
}

type EvaluateEffectorStackOptions = {
  localPosition: Vec3
  effectors: GridEffector[]
  instanceIndex: number
  instanceCount: number
  timeSeconds: number
  resolvedEffectorSeeds: Array<number | null>
  noiseGenerators: Array<SeededImprovedNoise | null>
  basePosition: Vec3
  baseRotation: Vec3
  baseScale: Vec3
}

function evaluateEffectorStack(options: EvaluateEffectorStackOptions): {
  position: Vec3
  rotation: Vec3
  scale: Vec3
  excluded: boolean
  color?: number
  materialColors?: Record<string, number>
} {
  const {
    localPosition,
    effectors,
    instanceIndex,
    instanceCount,
    timeSeconds,
    resolvedEffectorSeeds,
    noiseGenerators,
    basePosition,
    baseRotation,
    baseScale,
  } = options

  let positionDelta: Vec3 = [0, 0, 0]
  let rotationDelta: Vec3 = [0, 0, 0]
  let scaleDelta: Vec3 = [0, 0, 0]
  let excludeScore = 0
  let prevWeight = 0
  let hasAppliedEffector = false
  let prevExcludeWeight = 0
  let hasAppliedExclude = false
  let color: number | undefined
  const materialColors: Record<string, number> = {}

  effectors.forEach((effector, effectorIndex) => {
    if (effector.enabled === false) return

    const blendMode = resolveBlendMode(effector.blendMode)
    const strength = clamp01(effector.strength ?? 1)
    const usesExcludeChannel = hasExcludeChannel(effector)

    let wCurrent = 0
    let amountForColor = 0
    let randomSeed = resolvedEffectorSeeds[effectorIndex] ?? 1
    let positionNoiseX = 0
    let positionNoiseY = 0
    let positionNoiseZ = 0
    let rotationNoiseX = 0
    let rotationNoiseY = 0
    let rotationNoiseZ = 0
    let scaleNoiseX = 0
    let scaleNoiseY = 0
    let scaleNoiseZ = 0
    let staticExcludeProgress = 0
    let hasStaticExcludeProgress = false

    if (effector.type === 'linear') {
      amountForColor = evaluateLinearFieldWeight(localPosition, effector)
      wCurrent = clamp01(amountForColor)
    } else if (effector.type === 'spherical') {
      amountForColor = evaluateSphericalFieldWeight(localPosition, effector)
      wCurrent = clamp01(amountForColor)
    } else if (effector.type === 'pushApart') {
      return
    } else if (effector.type === 'step') {
      const stepProgress = evaluateStepProgress(instanceIndex, instanceCount, effector)
      amountForColor = remapEffectorWeight(stepProgress, effector) * strength
      wCurrent = clamp01(amountForColor)
    } else if (effector.type === 'time') {
      amountForColor = evaluateTimeWeight(timeSeconds, instanceIndex, effector) * strength
      wCurrent = clamp01(amountForColor)
    } else if (effector.type === 'random') {
      if (strength <= 0) return
      randomSeed = resolvedEffectorSeeds[effectorIndex] ?? 1
      const randomProgress = random01(randomSeed, instanceIndex, effectorIndex, 7)
      amountForColor = remapEffectorWeight(randomProgress, effector) * strength
      wCurrent = clamp01(amountForColor)
    } else {
      if (strength <= 0) return
      const noiseGenerator = noiseGenerators[effectorIndex] ?? new SeededImprovedNoise(resolvedEffectorSeeds[effectorIndex] ?? 1)
      const freq = normalizeFrequency(effector.frequency)
      const staticOffset = effector.offset ?? IDENTITY_POSITION
      const noisePosition = resolveNoiseMotion(effector.noisePosition)
      const noisePositionSpeed = resolveNoiseMotion(effector.noisePositionSpeed)
      const animatedNoisePosition: Vec3 = [
        staticOffset[0] + noisePosition[0] + (noisePositionSpeed[0] * timeSeconds),
        staticOffset[1] + noisePosition[1] + (noisePositionSpeed[1] * timeSeconds),
        staticOffset[2] + noisePosition[2] + (noisePositionSpeed[2] * timeSeconds),
      ]
      const sampleX = (localPosition[0] * freq[0]) + animatedNoisePosition[0]
      const sampleY = (localPosition[1] * freq[1]) + animatedNoisePosition[1]
      const sampleZ = (localPosition[2] * freq[2]) + animatedNoisePosition[2]
      const noisePosX = noiseGenerator.noise(sampleX + 11.31, sampleY + 7.77, sampleZ + 3.19)
      const noisePosY = noiseGenerator.noise(sampleX + 29.41, sampleY + 13.13, sampleZ + 5.71)
      const noisePosZ = noiseGenerator.noise(sampleX + 47.91, sampleY + 19.19, sampleZ + 9.83)
      const noiseBase = noiseGenerator.noise(sampleX, sampleY, sampleZ)
      const noiseProgress = clamp01((noiseBase + 1) / 2)
      if (usesExcludeChannel) {
        const staticNoisePosition: Vec3 = [
          staticOffset[0] + noisePosition[0],
          staticOffset[1] + noisePosition[1],
          staticOffset[2] + noisePosition[2],
        ]
        const staticSampleX = (localPosition[0] * freq[0]) + staticNoisePosition[0]
        const staticSampleY = (localPosition[1] * freq[1]) + staticNoisePosition[1]
        const staticSampleZ = (localPosition[2] * freq[2]) + staticNoisePosition[2]
        const staticNoiseBase = noiseGenerator.noise(staticSampleX, staticSampleY, staticSampleZ)
        staticExcludeProgress = clamp01((staticNoiseBase + 1) / 2)
        hasStaticExcludeProgress = true
      }
      amountForColor = remapEffectorWeight(noiseProgress, effector) * strength
      wCurrent = clamp01(amountForColor)
      positionNoiseX = resolveNoiseSample(noisePosX, effector.signedPosition === true)
      positionNoiseY = resolveNoiseSample(noisePosY, effector.signedPosition === true)
      positionNoiseZ = resolveNoiseSample(noisePosZ, effector.signedPosition === true)
      rotationNoiseX = resolveNoiseSample(noisePosX, effector.signedRotation === true)
      rotationNoiseY = resolveNoiseSample(noisePosY, effector.signedRotation === true)
      rotationNoiseZ = resolveNoiseSample(noisePosZ, effector.signedRotation === true)
      scaleNoiseX = resolveNoiseSample(noisePosX, effector.signedScale === true)
      scaleNoiseY = resolveNoiseSample(noisePosY, effector.signedScale === true)
      scaleNoiseZ = resolveNoiseSample(noisePosZ, effector.signedScale === true)
    }

    const clipWeight = clamp01(wCurrent)
    let excludeCurrent = clipWeight
    if (usesExcludeChannel) {
      if (effector.type === 'time') {
        // Exclude stays static to avoid frame-to-frame mount churn.
        excludeCurrent = clamp01(evaluateTimeWeight(0, instanceIndex, effector) * strength)
      } else if (effector.type === 'noise' && hasStaticExcludeProgress) {
        // Exclude ignores animated noise speed for the same reason.
        excludeCurrent = clamp01(remapEffectorWeight(staticExcludeProgress, effector) * strength)
      }
    }
    const excludeClipWeight = clamp01(excludeCurrent)

    if (blendMode === 'clip') {
      if (hasAppliedEffector) {
        positionDelta = scaleBlendDeltas(positionDelta, clipWeight)
        rotationDelta = scaleBlendDeltas(rotationDelta, clipWeight)
        scaleDelta = scaleBlendDeltas(scaleDelta, clipWeight)
      }
      prevWeight = clipWeight
      hasAppliedEffector = true

      if (usesExcludeChannel) {
        if (hasAppliedExclude) {
          excludeScore *= excludeClipWeight
        }
        prevExcludeWeight = excludeClipWeight
        hasAppliedExclude = true
      }
      return
    }

    let wEffective = 0
    if (wCurrent > 0) {
      wEffective = clipWeight
      if (hasAppliedEffector) {
        if (blendMode === 'normal') {
          positionDelta = [0, 0, 0]
          rotationDelta = [0, 0, 0]
          scaleDelta = [0, 0, 0]
        } else if (blendMode !== 'add') {
          wEffective = blendWeight(blendMode, prevWeight, clipWeight)
        }
      }

      wEffective = clamp01(wEffective)
      prevWeight = wEffective
      hasAppliedEffector = true
      if (wEffective > 0) {
        if (effector.type === 'random') {
          // Random uses LinearField-like scalar application; no per-axis jitter after remap.
          const positionScalar = resolveRandomChannelScalar(
            randomSeed,
            instanceIndex,
            effectorIndex,
            11,
            effector.signedPosition === true,
            wEffective,
          )
          const rotationScalar = resolveRandomChannelScalar(
            randomSeed,
            instanceIndex,
            effectorIndex,
            21,
            effector.signedRotation === true,
            wEffective,
          )
          const scaleScalar = resolveRandomChannelScalar(
            randomSeed,
            instanceIndex,
            effectorIndex,
            31,
            effector.signedScale === true,
            wEffective,
          )

          if (effector.position) {
            positionDelta = addScaledVec3(positionDelta, effector.position, positionScalar)
          }
          if (effector.rotation) {
            rotationDelta = addScaledVec3(rotationDelta, effector.rotation, rotationScalar)
          }
          if (effector.scale) {
            scaleDelta = addScaledVec3(scaleDelta, effector.scale, scaleScalar)
          }
        } else if (effector.type === 'noise') {
          if (effector.position) {
            positionDelta = [
              positionDelta[0] + (positionNoiseX * effector.position[0] * wEffective),
              positionDelta[1] + (positionNoiseY * effector.position[1] * wEffective),
              positionDelta[2] + (positionNoiseZ * effector.position[2] * wEffective),
            ]
          }
          if (effector.rotation) {
            rotationDelta = [
              rotationDelta[0] + (rotationNoiseX * effector.rotation[0] * wEffective),
              rotationDelta[1] + (rotationNoiseY * effector.rotation[1] * wEffective),
              rotationDelta[2] + (rotationNoiseZ * effector.rotation[2] * wEffective),
            ]
          }
          if (effector.scale) {
            scaleDelta = [
              scaleDelta[0] + (scaleNoiseX * effector.scale[0] * wEffective),
              scaleDelta[1] + (scaleNoiseY * effector.scale[1] * wEffective),
              scaleDelta[2] + (scaleNoiseZ * effector.scale[2] * wEffective),
            ]
          }
        } else {
          if (effector.position) {
            positionDelta = addScaledVec3(positionDelta, effector.position, wEffective)
          }
          if (effector.rotation) {
            rotationDelta = addScaledVec3(rotationDelta, effector.rotation, wEffective)
          }
          if (effector.scale) {
            scaleDelta = addScaledVec3(scaleDelta, effector.scale, wEffective)
          }
        }
      }
    }

    if (usesExcludeChannel) {
      let excludeEffective = excludeClipWeight
      if (hasAppliedExclude) {
        if (blendMode === 'normal') {
          excludeScore = 0
        } else if (blendMode !== 'add') {
          excludeEffective = blendWeight(blendMode, prevExcludeWeight, excludeClipWeight)
        }
      }
      excludeEffective = clamp01(excludeEffective)
      prevExcludeWeight = excludeEffective
      hasAppliedExclude = true
      if (excludeEffective > 0) {
        if (effector.exclude && excludeEffective >= resolveExcludeThreshold(effector)) {
          excludeScore = Math.max(excludeScore, excludeEffective)
        }

        if (effector.type === 'random') {
          const excludeChance = clamp01((effector.excludeProbability ?? 0) * excludeEffective)
          if (excludeChance > 0 && random01(randomSeed, instanceIndex, effectorIndex, 42) < excludeChance) {
            excludeScore = Math.max(excludeScore, excludeChance)
          }
        }
      }
    }

    if (wEffective <= 0) return

    const clampedAmount = clamp01(amountForColor)
    const nextColor = resolveColorValue(effector.color, clampedAmount)
    if (nextColor !== undefined) {
      color = nextColor
    }
    applyMaterialColorValues(materialColors, effector.materialColors, clampedAmount)
  })

  const position = addVec3(basePosition, positionDelta)
  const rotation = addVec3(baseRotation, rotationDelta)
  const scale = normalizeScale(addVec3(baseScale, scaleDelta))

  return {
    position,
    rotation,
    scale,
    excluded: excludeScore > 0,
    ...(color !== undefined ? { color } : {}),
    ...(Object.keys(materialColors).length > 0 ? { materialColors } : {}),
  }
}

function resolveColorValue(value: EffectorColorValue | undefined, amount: number): number | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return value
  if (value.length === 0) return undefined
  const clamped = clamp01(amount)
  const index = Math.floor(clamped * value.length)
  return value[Math.min(value.length - 1, index)]
}

function applyMaterialColorValues(
  output: Record<string, number>,
  value: EffectorMaterialColorValue | undefined,
  amount: number,
) {
  if (!value) return
  const clamped = clamp01(amount)
  Object.entries(value).forEach(([key, raw]) => {
    if (Array.isArray(raw)) {
      if (raw.length === 0) return
      const index = Math.floor(clamped * raw.length)
      output[key] = raw[Math.min(raw.length - 1, index)]
      return
    }
    output[key] = raw
  })
}

function random01(seed: number, a: number, b = 0, c = 0): number {
  let h = seed ^ (a * 374761393) ^ (b * 668265263) ^ (c * 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

const DEFAULT_GRID_ANCHOR: GridAnchor3 = {
  x: 'center',
  y: 'center',
  z: 'center',
}

function isGridAxisAnchor(value: unknown): value is GridAxisAnchor {
  return value === 'start' || value === 'center' || value === 'end'
}

function resolveGridAnchor(anchor: GridClonerProps['anchor'], centeredLegacy: boolean | undefined): GridAnchor3 {
  const legacyDefault: GridAxisAnchor = centeredLegacy === false ? 'start' : 'center'
  const candidate = (anchor && typeof anchor === 'object') ? anchor as Partial<GridAnchor3> : undefined
  return {
    x: isGridAxisAnchor(candidate?.x) ? candidate.x : legacyDefault,
    y: isGridAxisAnchor(candidate?.y) ? candidate.y : legacyDefault,
    z: isGridAxisAnchor(candidate?.z) ? candidate.z : legacyDefault,
  }
}

function resolveAxisStart(anchorMode: GridAxisAnchor, count: number, spacing: number): number {
  const span = (count - 1) * spacing
  if (anchorMode === 'start') return 0
  if (anchorMode === 'end') return -span
  return -span / 2
}

function resolveRandomChannelScalar(
  seed: number,
  instanceIndex: number,
  effectorIndex: number,
  salt: number,
  signed: boolean,
  amount: number,
): number {
  if (!signed) return amount
  const direction = random01(seed, instanceIndex, effectorIndex, salt) < 0.5 ? -1 : 1
  return amount * direction
}

function resolveNoiseSample(noiseValue: number, signed: boolean): number {
  return signed ? noiseValue : clamp01((noiseValue + 1) / 2)
}

function createRandomSeed(): number {
  const seed = Math.floor(Math.random() * 0x7fffffff)
  return seed === 0 ? 1 : seed
}

function resolveExplicitSeed(seed: number | undefined): number | null {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) return null
  return Math.trunc(seed)
}

function hashSeed(value: number): number {
  let h = value | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  const normalized = h & 0x7fffffff
  return normalized === 0 ? 1 : normalized
}

function deriveEffectorSeedFromMount(
  mountSeed: number,
  seedPathSalt: number,
  effectorType: 'random' | 'noise',
  effectorIndex: number,
): number {
  const typeSalt = effectorType === 'random' ? 0x51f2ac13 : 0x6d2b79f5
  const indexSalt = Math.imul(effectorIndex + 1, 374761393)
  return hashSeed(mountSeed ^ seedPathSalt ^ typeSalt ^ indexSalt)
}

function resolveEffectorSeedForMount(
  seed: number | undefined,
  mountSeed: number,
  seedPathSalt: number,
  effectorType: 'random' | 'noise',
  effectorIndex: number,
): number {
  const explicit = resolveExplicitSeed(seed)
  if (explicit !== null) return explicit
  return deriveEffectorSeedFromMount(mountSeed, seedPathSalt, effectorType, effectorIndex)
}

function deriveChildDistributionSeedFromMount(mountSeed: number, seedPathSalt: number): number {
  const childDistributionSalt = 0x3f6d2b79
  return hashSeed(mountSeed ^ seedPathSalt ^ childDistributionSalt)
}

function resolveChildDistributionSeedForMount(
  seed: number | undefined,
  mountSeed: number,
  seedPathSalt: number,
): number {
  const explicit = resolveExplicitSeed(seed)
  if (explicit !== null) return explicit
  return deriveChildDistributionSeedFromMount(mountSeed, seedPathSalt)
}

function deriveNestedSeedPathSalt(
  parentSeedPathSalt: number,
  cloneIndex: number,
  childIndex: number,
): number {
  const cloneSalt = Math.imul(cloneIndex + 1, 92837111)
  const childSalt = Math.imul(childIndex + 1, 689287499)
  return hashSeed(parentSeedPathSalt ^ cloneSalt ^ childSalt)
}

function resolveDistributedChildIndex(
  distribution: ChildDistribution,
  randomSeed: number,
  flatIndex: number,
  childCount: number,
): number {
  if (childCount <= 1) return 0
  if (distribution === 'random') {
    return Math.floor(random01(randomSeed, flatIndex, 17, 71) * childCount)
  }
  return flatIndex % childCount
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value)
    && value.length === 3
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && typeof value[2] === 'number'
}

function usesRadianRotationProps(type: unknown): boolean {
  return typeof type === 'string' || type === TransformMotion
}

function resolveChildRotationRadians(type: unknown, rotation: unknown): Vec3 {
  if (!isVec3(rotation)) return IDENTITY_ROTATION
  if (usesRadianRotationProps(type)) return rotation
  return toRadians(rotation)
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

function isHalfCylinderBlockSizePreset(value: unknown): value is HalfCylinderBlockSizePreset {
  return value === 'md' || value === 'lg'
}

function isPrimitiveType(type: unknown): boolean {
  return type === CubeElement
    || type === SphereElement
    || type === CylinderElement
    || type === BlockElement
    || type === TriangleBlockElement
    || type === WedgeElement
    || type === CylinderBlockElement
    || type === BallElement
    || type === DomeBlockElement
    || type === DomeElement
    || type === ConeBlockElement
    || type === ConeElement
    || type === StepsBlockElement
    || type === StepsElement
    || type === BridgeBlockElement
    || type === HalfCylinderBlockElement
}

function isContainerType(type: unknown): boolean {
  return type === GridCloner || type === Fracture || type === TransformMotion || type === 'group'
}

function estimateElementBodyCost(element: ReactElement<Record<string, unknown>>): number {
  if (!isContainerType(element.type)) return 1
  const props = (element.props ?? {}) as Record<string, unknown>
  const nested = splitTemplateChildren(props.children as ReactNode).objectChildren
  if (nested.length === 0) return 1
  let total = 0
  for (let i = 0; i < nested.length; i += 1) {
    total += estimateElementBodyCost(nested[i] as ReactElement<Record<string, unknown>>)
  }
  return Math.max(1, total)
}

function resolveChildBaseColorIndex(
  child: ReactElement<Record<string, unknown>> | null,
): number {
  if (!child) return 0
  const props = (child.props ?? {}) as Record<string, unknown>
  if (typeof props.color === 'number') return props.color
  if (typeof props.materialColor0 === 'number') return props.materialColor0
  return 0
}

function composeEntityPrefix(parentPrefix: string | undefined, ownSegment: string | undefined): string | undefined {
  if (parentPrefix && ownSegment) return `${parentPrefix}::${ownSegment}`
  return parentPrefix ?? ownSegment
}

function resolveCloneEntityPrefix(basePrefix: string | undefined, cloneKey: string): string | undefined {
  if (!basePrefix) return undefined
  return `${basePrefix}::clone:${cloneKey}`
}

function resolveLeafEntityId(entityPrefix: string | undefined, leafSegment: string): string | undefined {
  if (!entityPrefix) return undefined
  return `${entityPrefix}::leaf:${leafSegment}`
}

let autoGridClonerEntityCounter = 0
let autoFractureEntityCounter = 0

function createAutoGridClonerEntityPrefix(): string {
  autoGridClonerEntityCounter += 1
  return `gridcloner-auto-${autoGridClonerEntityCounter}`
}

function createAutoFractureEntityPrefix(): string {
  autoFractureEntityCounter += 1
  return `fracture-auto-${autoFractureEntityCounter}`
}

function resolveAutoColliderFromChild(
  templateChild: ReactElement<Record<string, unknown>> | null,
  transformMode: TransformMode,
  childLocalPosition: Vec3,
): { collider: Exclude<GridCollider, { shape: 'auto' }>; colliderOffset: Vec3 } {
  if (!templateChild) {
    return {
      collider: { shape: 'cuboid', halfExtents: [0.5, 0.5, 0.5] },
      colliderOffset: transformMode === 'child' ? childLocalPosition : IDENTITY_POSITION,
    }
  }

  const props = (templateChild.props ?? {}) as Record<string, unknown>
  const includeChildPosition = transformMode === 'child'

  if (templateChild.type === CubeElement) {
    const size: Vec3 = isVec3(props.size) ? props.size : [1, 1, 1]
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset(size, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === SphereElement) {
    const radius = typeof props.radius === 'number' ? props.radius : 0.5
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([radius * 2, radius * 2, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'ball', radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === CylinderElement) {
    const radius = typeof props.radius === 'number' ? props.radius : 0.5
    const height = typeof props.height === 'number' ? props.height : 1
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([radius * 2, height, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'cylinder', halfHeight: height / 2, radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === BlockElement) {
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

  // TriangleBlockElement / WedgeElement – use cuboid as bounding-box approximation
  if (templateChild.type === TriangleBlockElement) {
    const sizePreset = (props.sizePreset as TriangleBlockSizePreset) ?? 'lg'
    const heightPreset = (props.heightPreset as TriangleBlockHeightPreset) ?? 'sm'
    const plane = (props.plane as TriangleBlockPlane) ?? 'y'
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
    const size = resolveTriangleBlockSize(sizePreset, heightPreset, plane)
    const alignOffset = getAlignOffset(size, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === WedgeElement) {
    const w = typeof props.width === 'number' ? props.width : 0.2
    const h = typeof props.height === 'number' ? props.height : 0.2
    const d = typeof props.depth === 'number' ? props.depth : 0.2
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([w, h, d] as Vec3, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [w / 2, h / 2, d / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  // CylinderBlockElement
  if (templateChild.type === CylinderBlockElement) {
    const sizePreset = (props.sizePreset as CylinderBlockSizePreset) ?? 'lg'
    const heightPreset = (props.heightPreset as CylinderBlockHeightPreset) ?? 'sm'
    const { radius, height } = resolveCylinderBlockSize(sizePreset, heightPreset)
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
    const alignOffset = getAlignOffset([radius * 2, height, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'cylinder', halfHeight: height / 2, radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  // BallElement
  if (templateChild.type === BallElement) {
    const sizePreset = (props.sizePreset as BallSizePreset) ?? 'lg'
    const radius = BALL_RADII_M[sizePreset] ?? 0.1
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
    const alignOffset = getAlignOffset([radius * 2, radius * 2, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'ball', radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  // DomeBlockElement / DomeElement – use ball as approximation
  if (templateChild.type === DomeBlockElement) {
    const sizePreset = (props.sizePreset as DomeBlockSizePreset) ?? 'lg'
    const radius = DOME_BLOCK_RADII_M[sizePreset] ?? 0.1
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
    const alignOffset = getAlignOffset([radius * 2, radius, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'ball', radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === DomeElement) {
    const radius = typeof props.radius === 'number' ? props.radius : 0.1
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([radius * 2, radius, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'ball', radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  // ConeBlockElement / ConeElement – use cylinder as approximation
  if (templateChild.type === ConeBlockElement) {
    const sizePreset = (props.sizePreset as ConeBlockSizePreset) ?? 'lg'
    const heightPreset = (props.heightPreset as ConeBlockHeightPreset) ?? 'sm'
    const { radius, height } = resolveConeBlockSize(sizePreset, heightPreset)
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
    const alignOffset = getAlignOffset([radius * 2, height, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'cylinder', halfHeight: height / 2, radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === ConeElement) {
    const radius = typeof props.radius === 'number' ? props.radius : 0.1
    const height = typeof props.height === 'number' ? props.height : 0.2
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([radius * 2, height, radius * 2] as Vec3, align)
    return {
      collider: { shape: 'cylinder', halfHeight: height / 2, radius },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  // StepsBlockElement / StepsElement – use cuboid bounding box
  if (templateChild.type === StepsBlockElement) {
    const sizePreset = (props.sizePreset as StepsBlockSizePreset) ?? 'lg'
    const heightPreset = (props.heightPreset as StepsBlockHeightPreset) ?? 'sm'
    const size = resolveStepsBlockSize(sizePreset, heightPreset)
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
    const alignOffset = getAlignOffset(size, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === StepsElement) {
    const w = typeof props.width === 'number' ? props.width : 0.2
    const h = typeof props.height === 'number' ? props.height : 0.2
    const d = typeof props.depth === 'number' ? props.depth : 0.2
    const align = isAlign3(props.align) ? props.align : undefined
    const alignOffset = getAlignOffset([w, h, d] as Vec3, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [w / 2, h / 2, d / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === BridgeBlockElement) {
    const plane = (props.plane as BridgeBlockPlane) ?? 'x'
    const size = resolveBridgeBlockSize(plane)
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
    const alignOffset = getAlignOffset(size, align)
    return {
      collider: { shape: 'cuboid', halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2] },
      colliderOffset: includeChildPosition ? addVec3(childLocalPosition, alignOffset) : alignOffset,
    }
  }

  if (templateChild.type === HalfCylinderBlockElement) {
    const sizePreset = isHalfCylinderBlockSizePreset(props.sizePreset) ? props.sizePreset : 'md'
    const plane = isBlockPlane(props.plane) ? props.plane : 'y'
    const size = resolveHalfCylinderBlockSize(sizePreset, plane as HalfCylinderBlockPlane)
    const align = isAlign3(props.align) ? ({ y: 0, ...props.align }) : ({ y: 0 } as Align3)
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
  const fieldPosition = effector.fieldPosition ?? IDENTITY_POSITION
  const fieldRotation = effector.fieldRotation ?? IDENTITY_ROTATION
  const fieldLocalPosition = rotateVec3InverseXYZ(subVec3(localPosition, fieldPosition), fieldRotation)
  const axis = effector.axis ?? 'x'
  const axisIndex = axisToIndex(axis)
  const center = effector.center ?? 0
  const size = Math.max(0.00001, Math.abs(effector.size ?? 1))
  const start = center - (size / 2)
  const strength = clamp01(effector.strength ?? 1)

  let progress = (fieldLocalPosition[axisIndex] - start) / size

  if (effector.invert) {
    progress = 1 - progress
  }

  return remapEffectorWeight(progress, effector) * strength
}

function evaluateSphericalFieldWeight(localPosition: Vec3, effector: SphericalFieldEffectorConfig): number {
  const fieldPosition = effector.fieldPosition ?? IDENTITY_POSITION
  const radius = Math.max(0.00001, Math.abs(effector.radius ?? 20))
  const dx = localPosition[0] - fieldPosition[0]
  const dy = localPosition[1] - fieldPosition[1]
  const dz = localPosition[2] - fieldPosition[2]
  const distance = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
  const strength = clamp01(effector.strength ?? 1)

  let progress = 1 - (distance / radius)
  if (effector.invert) {
    progress = 1 - progress
  }

  return remapEffectorWeight(progress, effector) * strength
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
      fieldPosition: effector.fieldPosition,
      position: scaleOptionalVec3(effector.position, unitMultiplier),
    }
  }

  if (isSphericalEffector(effector)) {
    return {
      ...effector,
      fieldPosition: effector.fieldPosition,
      radius: effector.radius !== undefined ? Math.abs(effector.radius * unitMultiplier) : undefined,
      position: scaleOptionalVec3(effector.position, unitMultiplier),
    }
  }

  if (effector.type === 'random') {
    return {
      ...effector,
      position: scaleOptionalVec3(effector.position, unitMultiplier),
    }
  }

  if (effector.type === 'pushApart') {
    return {
      ...effector,
      radiusOffset: effector.radiusOffset !== undefined ? effector.radiusOffset * unitMultiplier : undefined,
    }
  }

  if (effector.type === 'noise') {
    return {
      ...effector,
      offset: scaleOptionalVec3(effector.offset, unitMultiplier),
      noisePosition: effector.noisePosition,
      noisePositionSpeed: effector.noisePositionSpeed,
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

function logTimed<T>(label: string, run: () => T): T {
  if (!GRID_CLONER_DEBUG_TIMING) return run()
  const startedAt = performance.now()
  const result = run()
  const elapsedMs = performance.now() - startedAt
  if (elapsedMs >= 4) {
    console.info(label, { elapsedMs: Number(elapsedMs.toFixed(2)) })
  }
  return result
}

type NonPushGridEffector = Exclude<GridEffector, PushApartEffectorConfig>

type PushApartStage = {
  regularPrefixCount: number
  radiusOffset: number
}

type BoundsXZ = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  hasValue: boolean
}

type FootprintContext = {
  mountSeed: number
  seedPathSalt: number
  depth: number
}

const MAX_FOOTPRINT_DEPTH = 6
const warnedUnknownFootprintTypes = new Set<string>()

function createEmptyBoundsXZ(): BoundsXZ {
  return {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
    hasValue: false,
  }
}

function mergeBoundsXZ(target: BoundsXZ, source: BoundsXZ): BoundsXZ {
  if (!source.hasValue) return target
  if (!target.hasValue) {
    target.minX = source.minX
    target.maxX = source.maxX
    target.minZ = source.minZ
    target.maxZ = source.maxZ
    target.hasValue = true
    return target
  }
  target.minX = Math.min(target.minX, source.minX)
  target.maxX = Math.max(target.maxX, source.maxX)
  target.minZ = Math.min(target.minZ, source.minZ)
  target.maxZ = Math.max(target.maxZ, source.maxZ)
  return target
}

function translateBoundsXZ(bounds: BoundsXZ, position: Vec3): BoundsXZ {
  if (!bounds.hasValue) return bounds
  return {
    minX: bounds.minX + position[0],
    maxX: bounds.maxX + position[0],
    minZ: bounds.minZ + position[2],
    maxZ: bounds.maxZ + position[2],
    hasValue: true,
  }
}

function scaleBoundsXZ(bounds: BoundsXZ, scale: Vec3): BoundsXZ {
  if (!bounds.hasValue) return bounds
  const scaledMinX = Math.min(bounds.minX * scale[0], bounds.maxX * scale[0])
  const scaledMaxX = Math.max(bounds.minX * scale[0], bounds.maxX * scale[0])
  const scaledMinZ = Math.min(bounds.minZ * scale[2], bounds.maxZ * scale[2])
  const scaledMaxZ = Math.max(bounds.minZ * scale[2], bounds.maxZ * scale[2])
  return {
    minX: scaledMinX,
    maxX: scaledMaxX,
    minZ: scaledMinZ,
    maxZ: scaledMaxZ,
    hasValue: true,
  }
}

function transformBoundsXZ(bounds: BoundsXZ, position: Vec3, scale: Vec3): BoundsXZ {
  if (!bounds.hasValue) return bounds
  return translateBoundsXZ(scaleBoundsXZ(bounds, scale), position)
}

function radiusFromBoundsXZ(bounds: BoundsXZ): number {
  if (!bounds.hasValue) return 0
  return Math.max(0.0001, 0.5 * Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ))
}

function boundsFromColliderXZ(
  collider: Exclude<GridCollider, { shape: 'auto' }>,
  colliderOffset: Vec3,
): BoundsXZ {
  if (collider.shape === 'ball') {
    const radius = Math.max(0.0001, collider.radius)
    return {
      minX: colliderOffset[0] - radius,
      maxX: colliderOffset[0] + radius,
      minZ: colliderOffset[2] - radius,
      maxZ: colliderOffset[2] + radius,
      hasValue: true,
    }
  }
  if (collider.shape === 'cylinder') {
    const radius = Math.max(0.0001, collider.radius)
    return {
      minX: colliderOffset[0] - radius,
      maxX: colliderOffset[0] + radius,
      minZ: colliderOffset[2] - radius,
      maxZ: colliderOffset[2] + radius,
      hasValue: true,
    }
  }
  return {
    minX: colliderOffset[0] - collider.halfExtents[0],
    maxX: colliderOffset[0] + collider.halfExtents[0],
    minZ: colliderOffset[2] - collider.halfExtents[2],
    maxZ: colliderOffset[2] + collider.halfExtents[2],
    hasValue: true,
  }
}

function splitTemplateChildren(children: ReactNode): {
  objectChildren: ReactElement<Record<string, unknown>>[]
  effectors: GridEffector[]
} {
  const objectChildren: ReactElement<Record<string, unknown>>[] = []
  const effectors: GridEffector[] = []
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child)) return
    const effectorType = getEffectorComponentType(child.type)
    if (!effectorType) {
      objectChildren.push(child as ReactElement<Record<string, unknown>>)
      return
    }
    const props = (child.props ?? {}) as Record<string, unknown>
    if (effectorType === 'linear') {
      effectors.push({ type: 'linear', ...(props as LinearFieldEffectorProps) })
      return
    }
    if (effectorType === 'spherical') {
      effectors.push({ type: 'spherical', ...(props as SphericalFieldEffectorProps) })
      return
    }
    if (effectorType === 'pushApart') {
      effectors.push({ type: 'pushApart', ...(props as PushApartEffectorProps) })
      return
    }
    if (effectorType === 'random') {
      effectors.push({ type: 'random', ...(props as RandomEffectorProps) })
      return
    }
    if (effectorType === 'noise') {
      effectors.push({ type: 'noise', ...(props as NoiseEffectorProps) })
      return
    }
    if (effectorType === 'time') {
      effectors.push({ type: 'time', ...(props as TimeEffectorProps) })
      return
    }
    effectors.push({ type: 'step', ...(props as StepEffectorProps) })
  })
  return { objectChildren, effectors }
}

function splitPushApartStages(effectors: GridEffector[]): {
  regularEffectors: NonPushGridEffector[]
  pushStages: PushApartStage[]
} {
  const regularEffectors: NonPushGridEffector[] = []
  const pushStages: PushApartStage[] = []
  let regularCount = 0
  effectors.forEach((effector) => {
    if (isPushApartEffector(effector)) {
      if (effector.enabled === false) return
      pushStages.push({
        regularPrefixCount: regularCount,
        radiusOffset: effector.radiusOffset ?? 0,
      })
      return
    }
    regularEffectors.push(effector)
    regularCount += 1
  })
  return { regularEffectors, pushStages }
}

function resolveElementFootprintBoundsXZ(
  element: ReactElement<Record<string, unknown>>,
  context: FootprintContext,
  applyOwnTransform: boolean,
): BoundsXZ {
  if (context.depth > MAX_FOOTPRINT_DEPTH) {
    return {
      minX: -0.125,
      maxX: 0.125,
      minZ: -0.125,
      maxZ: 0.125,
      hasValue: true,
    }
  }

  const props = (element.props ?? {}) as Record<string, unknown>

  if (isPrimitiveType(element.type)) {
    const inferred = resolveAutoColliderFromChild(element, 'cloner', IDENTITY_POSITION)
    let bounds = boundsFromColliderXZ(inferred.collider, inferred.colliderOffset)
    if (applyOwnTransform) {
      const localScale = isVec3(props.scale) ? props.scale : IDENTITY_SCALE
      const localPosition = isVec3(props.position) ? props.position : IDENTITY_POSITION
      bounds = transformBoundsXZ(bounds, localPosition, localScale)
    }
    return bounds
  }

  if (element.type !== GridCloner && element.type !== Fracture && element.type !== TransformMotion && element.type !== 'group') {
    const fallbackType = typeof element.type === 'string' ? element.type : ((element.type as { name?: string }).name ?? 'unknown')
    if (import.meta.env.DEV && !warnedUnknownFootprintTypes.has(fallbackType)) {
      warnedUnknownFootprintTypes.add(fallbackType)
      console.warn(`[PushApartEffector] Falling back footprint radius for unsupported element type "${fallbackType}".`)
    }
    return {
      minX: -0.125,
      maxX: 0.125,
      minZ: -0.125,
      maxZ: 0.125,
      hasValue: true,
    }
  }

  if (element.type === TransformMotion || element.type === 'group') {
    const nested = splitTemplateChildren(props.children as ReactNode).objectChildren
    let merged = createEmptyBoundsXZ()
    nested.forEach((child, childIndex) => {
      const childBounds = resolveElementFootprintBoundsXZ(
        child,
        {
          mountSeed: context.mountSeed,
          seedPathSalt: deriveNestedSeedPathSalt(context.seedPathSalt, childIndex, 0),
          depth: context.depth + 1,
        },
        true,
      )
      merged = mergeBoundsXZ(merged, childBounds)
    })
    if (applyOwnTransform) {
      const localScale = isVec3(props.scale) ? props.scale : IDENTITY_SCALE
      const localPosition = isVec3(props.position) ? props.position : IDENTITY_POSITION
      merged = transformBoundsXZ(merged, localPosition, localScale)
    }
    return merged
  }

  if (element.type === Fracture) {
    const { objectChildren, effectors } = splitTemplateChildren(props.children as ReactNode)
    const unitMultiplier = resolveGridUnitMultiplier(props.gridUnit as GridUnit | undefined)
    const scaled = effectors.map((effector) => scaleEffectorByUnit(effector, unitMultiplier))
    const normalized = scaled.map((effector) => {
      if (effector.type === 'linear' && effector.fieldRotation) {
        return { ...effector, fieldRotation: toRadians(effector.fieldRotation) } as NonPushGridEffector
      }
      if ('rotation' in effector && effector.rotation) {
        return { ...effector, rotation: toRadians(effector.rotation) } as NonPushGridEffector
      }
      return effector as NonPushGridEffector
    })
    const { regularEffectors } = splitPushApartStages(normalized)
    const resolvedMountSeed = hashSeed(context.mountSeed ^ context.seedPathSalt ^ 0x3e2f7a1d)
    const resolvedEffectorSeeds = regularEffectors.map((effector, effectorIndex) => {
      if (effector.type !== 'random' && effector.type !== 'noise') return null
      return resolveEffectorSeedForMount(
        effector.seed,
        resolvedMountSeed,
        context.seedPathSalt,
        effector.type,
        effectorIndex,
      )
    })
    const noiseGenerators = regularEffectors.map((effector, effectorIndex) => (
      effector.type === 'noise'
        ? new SeededImprovedNoise(resolvedEffectorSeeds[effectorIndex] ?? 1)
        : null
    ))

    let merged = createEmptyBoundsXZ()
    objectChildren.forEach((child, index) => {
      const childProps = (child.props ?? {}) as Record<string, unknown>
      const basePosition = isVec3(childProps.position) ? childProps.position : IDENTITY_POSITION
      const baseRotation = resolveChildRotationRadians(child.type, childProps.rotation)
      const baseScale = isVec3(childProps.scale) ? childProps.scale : IDENTITY_SCALE
      const evaluated = evaluateEffectorStack({
        localPosition: basePosition,
        effectors: regularEffectors,
        instanceIndex: index,
        instanceCount: objectChildren.length,
        timeSeconds: 0,
        resolvedEffectorSeeds,
        noiseGenerators,
        basePosition,
        baseRotation,
        baseScale,
      })
      if (evaluated.excluded) return
      const childBounds = resolveElementFootprintBoundsXZ(
        child,
        {
          mountSeed: resolvedMountSeed,
          seedPathSalt: deriveNestedSeedPathSalt(context.seedPathSalt, index, 0),
          depth: context.depth + 1,
        },
        false,
      )
      merged = mergeBoundsXZ(merged, transformBoundsXZ(childBounds, evaluated.position, evaluated.scale))
    })

    if (applyOwnTransform) {
      const localScale = isVec3(props.scale) ? props.scale : IDENTITY_SCALE
      const localPosition = isVec3(props.position) ? props.position : IDENTITY_POSITION
      merged = transformBoundsXZ(merged, localPosition, localScale)
    }
    return merged
  }

  const { objectChildren, effectors } = splitTemplateChildren(props.children as ReactNode)
  const unitMultiplier = resolveGridUnitMultiplier(props.gridUnit as GridUnit | undefined)
  const scaled = effectors.map((effector) => scaleEffectorByUnit(effector, unitMultiplier))
  const normalized = scaled.map((effector) => {
    if (effector.type === 'linear' && effector.fieldRotation) {
      return { ...effector, fieldRotation: toRadians(effector.fieldRotation) } as NonPushGridEffector
    }
    if ('rotation' in effector && effector.rotation) {
      return { ...effector, rotation: toRadians(effector.rotation) } as NonPushGridEffector
    }
    return effector as NonPushGridEffector
  })
  const { regularEffectors } = splitPushApartStages(normalized)

  const count = isVec3(props.count) ? props.count : [1, 1, 1]
  const normalizedCount: GridCount = [clampCount(count[0]), clampCount(count[1]), clampCount(count[2])]
  const spacing = scaleVec3(isVec3(props.spacing) ? props.spacing : [1, 1, 1], unitMultiplier)
  const offset = scaleVec3(isVec3(props.offset) ? props.offset : IDENTITY_POSITION, unitMultiplier)
  const baseRotation = toRadians(isVec3(props.rotationOffset) ? props.rotationOffset : IDENTITY_ROTATION)
  const baseScale = isVec3(props.scale) ? props.scale : IDENTITY_SCALE
  const anchor = resolveGridAnchor(props.anchor as GridClonerProps['anchor'], typeof props.centered === 'boolean' ? props.centered : undefined)
  const distribution: ChildDistribution = props.childDistribution === 'random' ? 'random' : 'iterate'
  const transformMode: TransformMode = props.transformMode === 'child' ? 'child' : 'cloner'
  const resolvedMountSeed = hashSeed(context.mountSeed ^ context.seedPathSalt ^ 0x1f123bb5)
  const childRandomSeed = resolveChildDistributionSeedForMount(
    typeof props.childRandomSeed === 'number' ? props.childRandomSeed : undefined,
    resolvedMountSeed,
    context.seedPathSalt,
  )
  const resolvedEffectorSeeds = regularEffectors.map((effector, effectorIndex) => {
    if (effector.type !== 'random' && effector.type !== 'noise') return null
    return resolveEffectorSeedForMount(
      effector.seed,
      resolvedMountSeed,
      context.seedPathSalt,
      effector.type,
      effectorIndex,
    )
  })
  const noiseGenerators = regularEffectors.map((effector, effectorIndex) => (
    effector.type === 'noise'
      ? new SeededImprovedNoise(resolvedEffectorSeeds[effectorIndex] ?? 1)
      : null
  ))

  const [cx, cy, cz] = normalizedCount
  const [sx, sy, sz] = spacing
  const [ox, oy, oz] = offset
  const totalClones = cx * cy * cz
  const startX = resolveAxisStart(anchor.x, cx, sx)
  const startY = resolveAxisStart(anchor.y, cy, sy)
  const startZ = resolveAxisStart(anchor.z, cz, sz)

  let merged = createEmptyBoundsXZ()
  let flatIndex = 0
  for (let y = 0; y < cy; y += 1) {
    for (let z = 0; z < cz; z += 1) {
      for (let x = 0; x < cx; x += 1) {
        const localPosition: Vec3 = [
          startX + (x * sx) + ox,
          startY + (y * sy) + oy,
          startZ + (z * sz) + oz,
        ]
        const evaluated = evaluateEffectorStack({
          localPosition,
          effectors: regularEffectors,
          instanceIndex: flatIndex,
          instanceCount: totalClones,
          timeSeconds: 0,
          resolvedEffectorSeeds,
          noiseGenerators,
          basePosition: localPosition,
          baseRotation,
          baseScale,
        })
        if (!evaluated.excluded && objectChildren.length > 0) {
          const selectedChildIndex = resolveDistributedChildIndex(distribution, childRandomSeed, flatIndex, objectChildren.length)
          const selectedChild = objectChildren[selectedChildIndex]
          const childSeedPathSalt = deriveNestedSeedPathSalt(context.seedPathSalt, flatIndex, selectedChildIndex)
          const childBounds = resolveElementFootprintBoundsXZ(
            selectedChild,
            {
              mountSeed: resolvedMountSeed,
              seedPathSalt: childSeedPathSalt,
              depth: context.depth + 1,
            },
            transformMode !== 'cloner',
          )
          merged = mergeBoundsXZ(merged, transformBoundsXZ(childBounds, evaluated.position, evaluated.scale))
        }
        flatIndex += 1
      }
    }
  }

  if (applyOwnTransform) {
    const ownScale = isVec3(props.scale) ? props.scale : IDENTITY_SCALE
    const ownPosition = isVec3(props.position) ? props.position : IDENTITY_POSITION
    merged = transformBoundsXZ(merged, ownPosition, ownScale)
  }
  return merged
}

function computeCloneFootprintRadiusXZ(
  templateChild: TemplateCloneChild | undefined,
  transformMode: TransformMode,
  mountSeed: number,
  seedPathSalt: number,
): number {
  if (!templateChild) return 0.25
  const applyOwnTransform = transformMode !== 'cloner'
  const bounds = resolveElementFootprintBoundsXZ(
    templateChild.element,
    {
      mountSeed,
      seedPathSalt,
      depth: 0,
    },
    applyOwnTransform,
  )
  const radiusFromBounds = radiusFromBoundsXZ(bounds)
  if (radiusFromBounds > 0) return radiusFromBounds
  return radiusFromBoundsXZ(
    boundsFromColliderXZ(
      templateChild.inferredCollider.collider,
      templateChild.inferredCollider.colliderOffset,
    ),
  )
}

function solvePushApartXZ(
  positionsX: Float32Array,
  positionsZ: Float32Array,
  radii: Float32Array,
  active: Uint8Array,
  maxIterations = 8,
) {
  const count = positionsX.length
  if (count === 0) return

  let maxRadius = 0
  for (let i = 0; i < count; i += 1) {
    if (!active[i]) continue
    if (radii[i] > maxRadius) maxRadius = radii[i]
  }
  if (maxRadius <= 0) return
  const cellSize = Math.max(0.001, maxRadius * 2)

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let movedAny = false
    const buckets = new Map<string, number[]>()

    for (let i = 0; i < count; i += 1) {
      if (!active[i]) continue
      const cx = Math.floor(positionsX[i] / cellSize)
      const cz = Math.floor(positionsZ[i] / cellSize)
      const key = `${cx},${cz}`
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.push(i)
      } else {
        buckets.set(key, [i])
      }
    }

    for (let i = 0; i < count; i += 1) {
      if (!active[i]) continue
      const cx = Math.floor(positionsX[i] / cellSize)
      const cz = Math.floor(positionsZ[i] / cellSize)
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const bucket = buckets.get(`${cx + dx},${cz + dz}`)
          if (!bucket) continue
          for (let k = 0; k < bucket.length; k += 1) {
            const j = bucket[k]
            if (j <= i || !active[j]) continue
            const mover = i > j ? i : j
            const anchor = mover === i ? j : i
            const diffX = positionsX[mover] - positionsX[anchor]
            const diffZ = positionsZ[mover] - positionsZ[anchor]
            const minDistance = radii[mover] + radii[anchor]
            const distSq = (diffX * diffX) + (diffZ * diffZ)
            if (distSq >= (minDistance * minDistance)) continue

            let dirX = diffX
            let dirZ = diffZ
            let dist = Math.sqrt(distSq)
            if (dist < 1e-6) {
              const fallbackAngle = ((mover + 1) * 0.7548776662466927) % (Math.PI * 2)
              dirX = Math.cos(fallbackAngle)
              dirZ = Math.sin(fallbackAngle)
              dist = 1
            } else {
              dirX /= dist
              dirZ /= dist
            }
            const pushDistance = (minDistance - dist) + 1e-4
            positionsX[mover] += dirX * pushDistance
            positionsZ[mover] += dirZ * pushDistance
            movedAny = true
          }
        }
      }
    }

    if (!movedAny) break
  }
}

function computePushApartOffsetsAtMount(options: {
  count: GridCount
  spacing: Vec3
  offset: Vec3
  anchor: GridAnchor3
  baseRotation: Vec3
  baseScale: Vec3
  regularEffectors: NonPushGridEffector[]
  pushStages: PushApartStage[]
  resolvedEffectorSeeds: Array<number | null>
  noiseGenerators: Array<SeededImprovedNoise | null>
  childDistribution: ChildDistribution
  childRandomSeed: number
  templateChildren: TemplateCloneChild[]
  transformMode: TransformMode
  mountSeed: number
  seedPathSalt: number
}): Vec3[] {
  const {
    count,
    spacing,
    offset,
    anchor,
    baseRotation,
    baseScale,
    regularEffectors,
    pushStages,
    resolvedEffectorSeeds,
    noiseGenerators,
    childDistribution,
    childRandomSeed,
    templateChildren,
    transformMode,
    mountSeed,
    seedPathSalt,
  } = options

  const totalClones = count[0] * count[1] * count[2]
  if (totalClones <= 0 || pushStages.length === 0) return []

  const localPositions: Vec3[] = new Array(totalClones)
  const selectedChildIndices: number[] = new Array(totalClones)
  const footprintRadii: number[] = new Array(totalClones)
  const startX = resolveAxisStart(anchor.x, count[0], spacing[0])
  const startY = resolveAxisStart(anchor.y, count[1], spacing[1])
  const startZ = resolveAxisStart(anchor.z, count[2], spacing[2])
  let flatIndex = 0
  for (let y = 0; y < count[1]; y += 1) {
    for (let z = 0; z < count[2]; z += 1) {
      for (let x = 0; x < count[0]; x += 1) {
        const localPosition: Vec3 = [
          startX + (x * spacing[0]) + offset[0],
          startY + (y * spacing[1]) + offset[1],
          startZ + (z * spacing[2]) + offset[2],
        ]
        localPositions[flatIndex] = localPosition
        if (templateChildren.length === 0) {
          selectedChildIndices[flatIndex] = -1
          footprintRadii[flatIndex] = 0.25
        } else {
          const selectedChildIndex = resolveDistributedChildIndex(childDistribution, childRandomSeed, flatIndex, templateChildren.length)
          selectedChildIndices[flatIndex] = selectedChildIndex
          const childSeedPathSalt = deriveNestedSeedPathSalt(seedPathSalt, flatIndex, selectedChildIndex)
          footprintRadii[flatIndex] = computeCloneFootprintRadiusXZ(
            templateChildren[selectedChildIndex],
            transformMode,
            mountSeed,
            childSeedPathSalt,
          )
        }
        flatIndex += 1
      }
    }
  }

  const offsetsX = new Float32Array(totalClones)
  const offsetsZ = new Float32Array(totalClones)
  const stageX = new Float32Array(totalClones)
  const stageZ = new Float32Array(totalClones)
  const stageRadius = new Float32Array(totalClones)
  const active = new Uint8Array(totalClones)
  const evaluatedBaseX = new Float32Array(totalClones)
  const evaluatedBaseZ = new Float32Array(totalClones)

  pushStages.forEach((stage) => {
    const prefixEffectors = regularEffectors.slice(0, stage.regularPrefixCount)
    const prefixSeeds = resolvedEffectorSeeds.slice(0, stage.regularPrefixCount)
    const prefixNoise = noiseGenerators.slice(0, stage.regularPrefixCount)

    for (let index = 0; index < totalClones; index += 1) {
      const selectedChildIndex = selectedChildIndices[index]
      if (selectedChildIndex < 0 || templateChildren.length === 0) {
        active[index] = 0
        continue
      }
      const evaluated = evaluateEffectorStack({
        localPosition: localPositions[index],
        effectors: prefixEffectors,
        instanceIndex: index,
        instanceCount: totalClones,
        timeSeconds: 0,
        resolvedEffectorSeeds: prefixSeeds,
        noiseGenerators: prefixNoise,
        basePosition: localPositions[index],
        baseRotation,
        baseScale,
      })
      if (evaluated.excluded) {
        active[index] = 0
        continue
      }
      evaluatedBaseX[index] = evaluated.position[0]
      evaluatedBaseZ[index] = evaluated.position[2]
      stageX[index] = evaluatedBaseX[index] + offsetsX[index]
      stageZ[index] = evaluatedBaseZ[index] + offsetsZ[index]
      const stageScale = Math.max(Math.abs(evaluated.scale[0]), Math.abs(evaluated.scale[2]))
      stageRadius[index] = Math.max(0.0001, (footprintRadii[index] * stageScale) + stage.radiusOffset)
      active[index] = 1
    }

    solvePushApartXZ(stageX, stageZ, stageRadius, active)

    for (let index = 0; index < totalClones; index += 1) {
      if (!active[index]) continue
      offsetsX[index] = stageX[index] - evaluatedBaseX[index]
      offsetsZ[index] = stageZ[index] - evaluatedBaseZ[index]
    }
  })

  const result: Vec3[] = new Array(totalClones)
  for (let index = 0; index < totalClones; index += 1) {
    result[index] = [offsetsX[index], 0, offsetsZ[index]]
  }
  return result
}

/**
 * Linear field effector (C4D-like). Use with `GridCloner` as child.
 * Provides directional falloff with optional remap/contour shaping.
 */
export function LinearFieldEffector(_props: LinearFieldEffectorProps) {
  return null
}

; (LinearFieldEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'linear'

/** Spherical field effector (C4D-like radial falloff in 3D). */
export function SphericalFieldEffector(_props: SphericalFieldEffectorProps) {
  return null
}

; (SphericalFieldEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'spherical'

/** Mount-only push-apart solver for initial clone overlap resolution. */
export function PushApartEffector(_props: PushApartEffectorProps) {
  return null
}

; (PushApartEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'pushApart'

/** Deterministisk random-effector. */
export function RandomEffector(_props: RandomEffectorProps) {
  return null
}

; (RandomEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'random'

/** Spatialt sammanhängande 3D-noise-effector. */
export function NoiseEffector(_props: NoiseEffectorProps) {
  return null
}

; (NoiseEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'noise'

/** Tidsdriven effector med loop/pingpong och clone-offset. */
export function TimeEffector(_props: TimeEffectorProps) {
  return null
}

; (TimeEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'time'

/** Indexbaserad step-effector med ramp/hump-profiler. */
export function StepEffector(_props: StepEffectorProps) {
  return null
}

; (StepEffector as unknown as EffectorMarkerComponent).__gridEffectorType = 'step'

/** GridCloner duplicerar valfria barn i ett 3D-grid med optional effectors/fysik. */
export function GridCloner({
  children,
  count = [1, 1, 1],
  spacing = [1, 1, 1],
  offset = [0, 0, 0],
  rotationOffset = [0, 0, 0],
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  anchor = DEFAULT_GRID_ANCHOR,
  centered,
  transformMode = 'cloner',
  childDistribution = 'iterate',
  childRandomSeed,
  enabled = true,
  gridUnit,
  physics,
  showDebugEffectors,
  entityPrefix,
  contagionCarrier,
  contagionInfectable,
  contagionColor,
  spawnChunkSize,
}: GridClonerProps) {
  const runtimeContext = useContext(GRID_RUNTIME_CONTEXT)
  const autoEntityPrefixRef = useRef<string>(createAutoGridClonerEntityPrefix())
  const mountSeedRef = useRef<number>(createRandomSeed())
  const ownEntityPrefixSegment = entityPrefix ?? autoEntityPrefixRef.current
  const resolvedEntityPrefix = composeEntityPrefix(runtimeContext.entityPrefix, ownEntityPrefixSegment)
  const resolvedSeedPathSalt = runtimeContext.seedPathSalt
  const resolvedMountSeed = useMemo(
    () => hashSeed(mountSeedRef.current ^ resolvedSeedPathSalt ^ 0x1f123bb5),
    [resolvedSeedPathSalt],
  )
  const unitMultiplier = useMemo(
    () => resolveGridUnitMultiplier(gridUnit),
    [gridUnit],
  )
  const scaledSpacing = useMemo(() => scaleVec3(spacing, unitMultiplier), [spacing, unitMultiplier])
  const scaledOffset = useMemo(() => scaleVec3(offset, unitMultiplier), [offset, unitMultiplier])
  const clonerRotation = useMemo<Vec3>(() => toRadians(rotation), [rotation])
  const baseRotation = useMemo<Vec3>(() => toRadians(rotationOffset), [rotationOffset])
  const resolvedAnchor = useMemo<GridAnchor3>(
    () => resolveGridAnchor(anchor, centered),
    [anchor, centered],
  )

  const normalizedCount = useMemo<GridCount>(() => [
    clampCount(count[0]),
    clampCount(count[1]),
    clampCount(count[2]),
  ], [count])

  const parsedChildren = useMemo(() => {
    const { objectChildren, effectors } = splitTemplateChildren(children)
    return {
      cloneChildren: objectChildren,
      childEffectors: effectors,
    }
  }, [children])

  const templateChildren = useMemo<TemplateCloneChild[]>(() => {
    return parsedChildren.cloneChildren.map((element) => {
      const props = (element.props ?? {}) as Record<string, unknown>
      const localPosition: Vec3 = isVec3(props.position) ? props.position : IDENTITY_POSITION
      return {
        element,
        props,
        baseColor: resolveChildBaseColorIndex(element),
        estimatedBodyCost: estimateElementBodyCost(element),
        contagionCarrier: props.contagionCarrier === true,
        contagionInfectable: props.contagionInfectable !== false,
        inferredCollider: resolveAutoColliderFromChild(element, transformMode, localPosition),
      }
    })
  }, [parsedChildren.cloneChildren, transformMode])

  const scaledEffectors = useMemo(
    () => parsedChildren.childEffectors.map((effector) => scaleEffectorByUnit(effector, unitMultiplier)),
    [parsedChildren.childEffectors, unitMultiplier],
  )
  const normalizedEffectors = useMemo(
    () => scaledEffectors.map((effector) => {
      let normalized: GridEffector = {
        ...effector,
      }
      if (effector.rotation) {
        normalized = {
          ...normalized,
          rotation: toRadians(effector.rotation),
        }
      }
      if (isLinearEffector(effector) && effector.fieldRotation) {
        normalized = {
          ...normalized,
          fieldRotation: toRadians(effector.fieldRotation),
        } as GridEffector
      }
      return normalized
    }),
    [scaledEffectors],
  )
  const { regularEffectors, pushStages } = useMemo(
    () => splitPushApartStages(normalizedEffectors),
    [normalizedEffectors],
  )
  const resolvedEffectorSeeds = useMemo(
    () => regularEffectors.map((effector, effectorIndex) => {
      if (effector.type !== 'random' && effector.type !== 'noise') return null
      return resolveEffectorSeedForMount(
        effector.seed,
        resolvedMountSeed,
        resolvedSeedPathSalt,
        effector.type,
        effectorIndex,
      )
    }),
    [regularEffectors, resolvedMountSeed, resolvedSeedPathSalt],
  )
  const hasTimeEffector = useMemo(
    () => regularEffectors.some((effector) => effector.type === 'time' && effector.enabled !== false),
    [regularEffectors],
  )
  const hasAnimatedNoiseEffector = useMemo(
    () => regularEffectors.some((effector) => (
      effector.type === 'noise'
      && effector.enabled !== false
      && hasNonZeroVec3(resolveNoiseMotion(effector.noisePositionSpeed))
    )),
    [regularEffectors],
  )
  const hasTimeScaleEffector = useMemo(
    () => regularEffectors.some((effector) => (
      effector.type === 'time'
      && effector.enabled !== false
      && clamp01(effector.strength ?? 1) > 0
      && hasNonZeroVec3(effector.scale)
    )),
    [regularEffectors],
  )
  const [frameTime, setFrameTime] = useState(0)
  useFrame(({ clock }) => {
    if (!hasTimeEffector && !hasAnimatedNoiseEffector) return
    setFrameTime(clock.getElapsedTime())
  })
  const noiseGenerators = useMemo(
    () => regularEffectors.map((effector, effectorIndex) => {
      if (effector.type !== 'noise') return null
      const seed = resolvedEffectorSeeds[effectorIndex]
      return new SeededImprovedNoise(seed ?? 1)
    }),
    [regularEffectors, resolvedEffectorSeeds],
  )

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

  const resolvedChildDistribution = useMemo<ChildDistribution>(
    () => (childDistribution === 'random' ? 'random' : 'iterate'),
    [childDistribution],
  )
  const resolvedChildRandomSeed = useMemo(
    () => resolveChildDistributionSeedForMount(childRandomSeed, resolvedMountSeed, resolvedSeedPathSalt),
    [childRandomSeed, resolvedMountSeed, resolvedSeedPathSalt],
  )
  const pushApartOffsets = useMemo<Vec3[]>(
    () => logTimed('[GridCloner] computePushApartOffsetsAtMount', () => computePushApartOffsetsAtMount({
      count: normalizedCount,
      spacing: scaledSpacing,
      offset: scaledOffset,
      anchor: resolvedAnchor,
      baseRotation,
      baseScale: scale,
      regularEffectors,
      pushStages,
      resolvedEffectorSeeds,
      noiseGenerators,
      childDistribution: resolvedChildDistribution,
      childRandomSeed: resolvedChildRandomSeed,
      templateChildren,
      transformMode,
      mountSeed: resolvedMountSeed,
      seedPathSalt: resolvedSeedPathSalt,
    })),
    [
      normalizedCount,
      scaledSpacing,
      scaledOffset,
      resolvedAnchor,
      baseRotation,
      scale,
      regularEffectors,
      pushStages,
      resolvedEffectorSeeds,
      noiseGenerators,
      resolvedChildDistribution,
      resolvedChildRandomSeed,
      templateChildren,
      transformMode,
      resolvedMountSeed,
      resolvedSeedPathSalt,
    ],
  )

  const resolvedPhysics = useMemo<ResolvedGridPhysics | null>(() => {
    if (!physics) return null

    if (isPhysicsBodyType(physics)) {
      return {
        type: physics,
      }
    }

    if (isGridPhysicsConfig(physics)) {
      return {
        type: physics.type ?? 'fixed',
        mass: physics.mass,
        friction: physics.friction,
        restitution: physics.restitution,
        lockRotations: physics.lockRotations,
      }
    }

    return null
  }, [
    physics,
  ])
  const effectivePhysics = runtimeContext.physicsOverride ?? resolvedPhysics
  const shouldStripChildPhysics = Boolean(effectivePhysics)
  const collisionActivatedPhysics = useMemo(
    () => effectivePhysics ? isCollisionActivatedPhysicsType(effectivePhysics.type) : false,
    [effectivePhysics],
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

  const transforms = useMemo<CloneTransform[]>(() => logTimed('[GridCloner] build clone transforms', () => {
    const [cx, cy, cz] = normalizedCount
    const [sx, sy, sz] = scaledSpacing
    const [ox, oy, oz] = scaledOffset
    const totalClones = cx * cy * cz

    const startX = resolveAxisStart(resolvedAnchor.x, cx, sx)
    const startY = resolveAxisStart(resolvedAnchor.y, cy, sy)
    const startZ = resolveAxisStart(resolvedAnchor.z, cz, sz)

    const result: CloneTransform[] = []
    let flatIndex = 0
    for (let y = 0; y < cy; y++) {
      for (let z = 0; z < cz; z++) {
        for (let x = 0; x < cx; x++) {
          const selectedChildIndex = templateChildren.length <= 1
            ? 0
            : resolveDistributedChildIndex(
              resolvedChildDistribution,
              resolvedChildRandomSeed,
              flatIndex,
              templateChildren.length,
            )
          const localPosition: Vec3 = [
            startX + (x * sx) + ox,
            startY + (y * sy) + oy,
            startZ + (z * sz) + oz,
          ]
          const evaluated = evaluateEffectorStack({
            localPosition,
            effectors: regularEffectors,
            instanceIndex: flatIndex,
            instanceCount: totalClones,
            timeSeconds: frameTime,
            resolvedEffectorSeeds,
            noiseGenerators,
            basePosition: localPosition,
            baseRotation,
            baseScale: scale,
          })
          const pushOffset = pushApartOffsets[flatIndex] ?? IDENTITY_POSITION

          const computedClone: CloneTransform = {
            key: `${x}-${y}-${z}`,
            index: flatIndex,
            selectedChildIndex,
            localPosition,
            position: addVec3(evaluated.position, pushOffset),
            rotation: evaluated.rotation,
            scale: evaluated.scale,
            excluded: evaluated.excluded,
            mountCost: effectivePhysics
              ? Math.max(1, templateChildren[selectedChildIndex]?.estimatedBodyCost ?? 1)
              : 1,
            color: evaluated.color,
            materialColors: evaluated.materialColors,
          }
          if (computedClone.excluded) {
            result.push(computedClone)
          } else if (collisionActivatedPhysics && collisionActivatedClones[computedClone.key]) {
            result.push(collisionActivatedClones[computedClone.key])
          } else {
            result.push(computedClone)
          }
          flatIndex += 1
        }
      }
    }
    return result
  }), [
    normalizedCount,
    scaledSpacing,
    scaledOffset,
    resolvedAnchor.x,
    resolvedAnchor.y,
    resolvedAnchor.z,
    clonerRotation,
    baseRotation,
    scale,
    regularEffectors,
    pushApartOffsets,
    resolvedEffectorSeeds,
    noiseGenerators,
    frameTime,
    collisionActivatedPhysics,
    collisionActivatedClones,
  ])

  const effectiveChunkSize = useMemo(() => {
    const raw = spawnChunkSize ?? SETTINGS.level.gridClonerSpawnChunkSize
    return Math.max(0, Math.floor(raw))
  }, [spawnChunkSize])

  const totalMountCost = useMemo(
    () => transforms.reduce((sum, transform) => (
      transform.excluded ? sum : sum + Math.max(1, transform.mountCost)
    ), 0),
    [transforms],
  )
  const loggedTransformBoundsRef = useRef<string | null>(null)
  const initialVisibleBudget = effectiveChunkSize > 0 ? effectiveChunkSize : totalMountCost
  const [visibleBudget, setVisibleBudget] = useState(initialVisibleBudget)

  useEffect(() => {
    setVisibleBudget(effectiveChunkSize > 0 ? effectiveChunkSize : totalMountCost)
  }, [effectiveChunkSize, totalMountCost])

  useFrame(() => {
    if (effectiveChunkSize <= 0) return
    setVisibleBudget((prev) => {
      if (prev >= totalMountCost) return prev
      return Math.min(prev + effectiveChunkSize, totalMountCost)
    })
  })

  const visibleIndexCount = useMemo(() => {
    if (visibleBudget >= totalMountCost) return transforms.length
    let spent = 0
    for (let i = 0; i < transforms.length; i += 1) {
      const transform = transforms[i]
      if (!transform) continue
      if (!transform.excluded) {
        spent += Math.max(1, transform.mountCost)
      }
      if (spent > visibleBudget) {
        return i
      }
    }
    return transforms.length
  }, [totalMountCost, transforms, visibleBudget])

  const visibleTransforms = visibleIndexCount >= transforms.length
    ? transforms
    : transforms.slice(0, visibleIndexCount)

  useEffect(() => {
    if (!GRID_CLONER_DEBUG_TIMING) return
    if (transforms.length === 0) return
    const logKey = `${resolvedEntityPrefix ?? 'grid'}:${transforms.length}:${totalMountCost}`
    if (loggedTransformBoundsRef.current === logKey) return

    let localMinZ = Number.POSITIVE_INFINITY
    let localMaxZ = Number.NEGATIVE_INFINITY
    let worldMinZ = Number.POSITIVE_INFINITY
    let worldMaxZ = Number.NEGATIVE_INFINITY
    let excludedCount = 0

    for (let i = 0; i < transforms.length; i += 1) {
      const transform = transforms[i]
      if (!transform) continue
      if (transform.excluded) {
        excludedCount += 1
        continue
      }
      const localZ = transform.position[2]
      const worldZ = position[2] + transform.position[2]
      if (localZ < localMinZ) localMinZ = localZ
      if (localZ > localMaxZ) localMaxZ = localZ
      if (worldZ < worldMinZ) worldMinZ = worldZ
      if (worldZ > worldMaxZ) worldMaxZ = worldZ
    }

    loggedTransformBoundsRef.current = logKey
    console.info('[GridCloner] Transform bounds', {
      entityPrefix: resolvedEntityPrefix ?? null,
      totalTransforms: transforms.length,
      excludedCount,
      visibleIndexCount,
      effectiveChunkSize,
      totalMountCost,
      localMinZ: Number.isFinite(localMinZ) ? Number(localMinZ.toFixed(2)) : null,
      localMaxZ: Number.isFinite(localMaxZ) ? Number(localMaxZ.toFixed(2)) : null,
      localDepth: Number.isFinite(localMinZ) && Number.isFinite(localMaxZ)
        ? Number((localMaxZ - localMinZ).toFixed(2))
        : null,
      worldMinZ: Number.isFinite(worldMinZ) ? Number(worldMinZ.toFixed(2)) : null,
      worldMaxZ: Number.isFinite(worldMaxZ) ? Number(worldMaxZ.toFixed(2)) : null,
      worldDepth: Number.isFinite(worldMinZ) && Number.isFinite(worldMaxZ)
        ? Number((worldMaxZ - worldMinZ).toFixed(2))
        : null,
    })
  }, [
    effectiveChunkSize,
    position,
    resolvedEntityPrefix,
    totalMountCost,
    transforms,
    visibleIndexCount,
  ])

  if (!enabled) {
    const passthroughContextValue: GridRuntimeContextValue = {
      physicsOverride: effectivePhysics,
      seedPathSalt: resolvedSeedPathSalt,
      entityPrefix: resolvedEntityPrefix,
      contagionOverride: runtimeContext.contagionOverride,
    }
    return (
      <group position={position} rotation={clonerRotation} scale={scale}>
        <GRID_RUNTIME_CONTEXT.Provider value={passthroughContextValue}>
          {children}
        </GRID_RUNTIME_CONTEXT.Provider>
      </group>
    )
  }

  return (
    <group position={position} rotation={clonerRotation} scale={scale}>
      {visibleTransforms.map((clone) => {
        if (clone.excluded) return null
        if (templateChildren.length === 0) return null
        const selectedChildIndex = clone.selectedChildIndex
        const selectedTemplateChild = templateChildren[selectedChildIndex]
        const cloneEntityPrefix = resolveCloneEntityPrefix(resolvedEntityPrefix, clone.key)
        const cloneBaseColor = clone.color
          ?? (typeof clone.materialColors?.materialColor0 === 'number' ? clone.materialColors.materialColor0 : undefined)
          ?? selectedTemplateChild.baseColor
        const cloneVisualColor = clone.color
        const inheritedContagion = runtimeContext.physicsOverride ? runtimeContext.contagionOverride : undefined
        const resolvedCloneContagionColor = inheritedContagion?.color ?? (contagionColor ?? cloneBaseColor)
        const resolvedCloneContagionCarrier = inheritedContagion?.carrier ?? (contagionCarrier ?? selectedTemplateChild.contagionCarrier)
        const resolvedCloneContagionInfectable = inheritedContagion?.infectable ?? (contagionInfectable ?? selectedTemplateChild.contagionInfectable)
        const cloneContagionOverride = {
          carrier: resolvedCloneContagionCarrier,
          infectable: resolvedCloneContagionInfectable,
          color: resolvedCloneContagionColor,
        }

        const childElement = selectedTemplateChild.element
        const childProps = selectedTemplateChild.props
        const isContainerChild = isContainerType(childElement.type)
        const leafEntityId = isContainerChild
          ? undefined
          : resolveLeafEntityId(cloneEntityPrefix, `child:${selectedChildIndex}`)
        const nextProps: Record<string, unknown> = {
          key: `grid-${clone.index}-${selectedChildIndex}`,
        }

        if (shouldStripChildPhysics) {
          Object.keys(childProps).forEach((key) => {
            if (key === 'physics' || key.startsWith('rigidBody')) {
              nextProps[key] = undefined
            }
          })
        }

        if (transformMode === 'cloner') {
          nextProps.position = IDENTITY_POSITION
          nextProps.rotation = IDENTITY_ROTATION
          nextProps.scale = IDENTITY_SCALE
        }

        if (cloneVisualColor !== undefined) {
          if (isPrimitiveType(childElement.type) || Object.prototype.hasOwnProperty.call(childProps, 'color')) {
            nextProps.color = cloneVisualColor
          } else {
            nextProps.materialColor0 = cloneVisualColor
          }
        }

        if (clone.materialColors) {
          Object.entries(clone.materialColors).forEach(([key, value]) => {
            if (isPrimitiveType(childElement.type) && key.startsWith('materialColor')) return
            nextProps[key] = value
          })
        }

        if (leafEntityId) {
          nextProps.entityId = leafEntityId
          if (isPrimitiveType(childElement.type) && resolvedCloneContagionColor !== undefined) {
            nextProps.contagionColor = resolvedCloneContagionColor
          }
        }

        const renderedChild = cloneElement(childElement, nextProps)
        const childSeedPathSalt = deriveNestedSeedPathSalt(resolvedSeedPathSalt, clone.index, selectedChildIndex)
        const childRuntimeContextValue: GridRuntimeContextValue = {
          physicsOverride: effectivePhysics,
          seedPathSalt: childSeedPathSalt,
          entityPrefix: cloneEntityPrefix,
          contagionOverride: cloneContagionOverride,
        }
        const renderedWithContext = (
          <GRID_RUNTIME_CONTEXT.Provider value={childRuntimeContextValue}>
            {renderedChild}
          </GRID_RUNTIME_CONTEXT.Provider>
        )

        if (!effectivePhysics || isContainerChild) {
          return (
            <group
              key={clone.key}
              position={clone.position}
              rotation={clone.rotation}
              scale={clone.scale}
            >
              {renderedWithContext}
            </group>
          )
        }

        const colliderArgs = scaleColliderArgs(selectedTemplateChild.inferredCollider.collider, clone.scale)
        const scaledColliderPosition: Vec3 = [
          selectedTemplateChild.inferredCollider.colliderOffset[0] * clone.scale[0],
          selectedTemplateChild.inferredCollider.colliderOffset[1] * clone.scale[1],
          selectedTemplateChild.inferredCollider.colliderOffset[2] * clone.scale[2],
        ]

        return (
          <PhysicsWrapper
            key={clone.key}
            physics={effectivePhysics.type}
            colliderType={toColliderType(selectedTemplateChild.inferredCollider.collider)}
            colliderArgs={colliderArgs}
            colliderPosition={scaledColliderPosition}
            position={clone.position}
            rotation={clone.rotation}
            mass={effectivePhysics.mass}
            friction={effectivePhysics.friction}
            restitution={effectivePhysics.restitution}
            lockRotations={effectivePhysics.lockRotations}
            entityId={leafEntityId}
            contagionCarrier={resolvedCloneContagionCarrier}
            contagionInfectable={resolvedCloneContagionInfectable}
            contagionColor={resolvedCloneContagionColor}
            syncColliderShape={hasTimeScaleEffector}
            onCollisionActivated={collisionActivatedPhysics ? () => freezeCloneTransform(clone) : undefined}
          >
            <group scale={clone.scale}>
              {renderedWithContext}
            </group>
          </PhysicsWrapper>
        )
      })}

      {shouldShowDebugEffectors && normalizedEffectors
        .filter((effector): effector is LinearFieldEffectorConfig => isLinearEffector(effector) && effector.enabled !== false)
        .map((effector, index) => {
          const axis = effector.axis ?? 'x'
          const center = effector.center ?? 0
          const size = Math.max(0.001, Math.abs(effector.size ?? 1))
          const half = size / 2
          const axisIndex = axisToIndex(axis)
          const axisDirection = getAxisDirection(axis)
          const directionSign = effector.invert ? -1 : 1
          const headScale = Math.max(0.03, Math.min(debugBounds[0], debugBounds[1], debugBounds[2]) * 0.04)
          const lineColor = effector.invert ? '#ff9f43' : '#2ecc71'
          const thin = Math.max(0.002, Math.min(debugBounds[0], debugBounds[1], debugBounds[2]) * 0.015)
          const fieldPosition = effector.fieldPosition ?? IDENTITY_POSITION
          const fieldRotation = effector.fieldRotation ?? IDENTITY_ROTATION
          const fieldOrigin = fieldPosition
          const planeSize = getPlaneDebugSize(axis, thin, debugBounds)
          const volumeSize = getPlaneDebugSize(axis, size, debugBounds)

          const startLocal: Vec3 = [0, 0, 0]
          startLocal[axisIndex] = center - half
          const endLocal: Vec3 = [0, 0, 0]
          endLocal[axisIndex] = center + half
          const volumeCenter: Vec3 = [0, 0, 0]
          volumeCenter[axisIndex] = center

          const arrowStart = directionSign > 0 ? startLocal : endLocal
          const arrowEnd = directionSign > 0 ? endLocal : startLocal
          const arrowHeadRotation = getArrowHeadRotation(axis, directionSign > 0)
          const arrowLinePositions = new Float32Array([
            arrowStart[0], arrowStart[1], arrowStart[2],
            arrowEnd[0], arrowEnd[1], arrowEnd[2],
          ])

          let remapMarker: Vec3 | null = null
          const innerOffset = clamp01(effector.innerOffset ?? 0)
          if ((effector.enableRemap ?? true) && innerOffset > 0) {
            const marker: Vec3 = [0, 0, 0]
            const markerPosition = directionSign > 0
              ? (center - half) + (innerOffset * size)
              : (center + half) - (innerOffset * size)
            marker[axisIndex] = markerPosition
            remapMarker = marker
          }

          return (
            <group
              key={`linear-field-debug-${index}`}
              userData={{ excludeFromOutlines: true }}
              renderOrder={2000}
              position={fieldOrigin}
              rotation={fieldRotation}
            >
              <mesh position={volumeCenter}>
                <boxGeometry args={volumeSize} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.08} depthWrite={false} />
              </mesh>

              <mesh position={startLocal}>
                <boxGeometry args={planeSize} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              <mesh position={endLocal}>
                <boxGeometry args={planeSize} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              {remapMarker && (
                <mesh position={remapMarker}>
                  <boxGeometry args={planeSize} />
                  <meshBasicMaterial color="#74b9ff" wireframe transparent opacity={0.9} depthWrite={false} />
                </mesh>
              )}

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

      {shouldShowDebugEffectors && normalizedEffectors
        .filter((effector): effector is SphericalFieldEffectorConfig => isSphericalEffector(effector) && effector.enabled !== false)
        .map((effector, index) => {
          const radius = Math.max(0.001, Math.abs(effector.radius ?? 20))
          const fieldPosition = effector.fieldPosition ?? IDENTITY_POSITION
          const lineColor = effector.invert ? '#ff9f43' : '#2ecc71'
          const innerOffset = clamp01(effector.innerOffset ?? 0)
          const innerRadius = Math.max(0.001, radius * (1 - innerOffset))

          return (
            <group
              key={`spherical-field-debug-${index}`}
              userData={{ excludeFromOutlines: true }}
              renderOrder={2000}
              position={fieldPosition}
            >
              <mesh>
                <sphereGeometry args={[radius, 24, 18]} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.08} depthWrite={false} />
              </mesh>

              <mesh>
                <sphereGeometry args={[radius, 24, 18]} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              {(effector.enableRemap ?? true) && innerOffset > 0 && (
                <mesh>
                  <sphereGeometry args={[innerRadius, 24, 18]} />
                  <meshBasicMaterial color="#74b9ff" wireframe transparent opacity={0.9} depthWrite={false} />
                </mesh>
              )}
            </group>
          )
        })}
    </group>
  )
}

/** Fracture applies effectors to direct children without generating clones. */
export function Fracture({
  children,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  enabled = true,
  gridUnit,
  showDebugEffectors,
  entityPrefix,
}: FractureProps) {
  const runtimeContext = useContext(GRID_RUNTIME_CONTEXT)
  const autoEntityPrefixRef = useRef<string>(createAutoFractureEntityPrefix())
  const mountSeedRef = useRef<number>(createRandomSeed())
  const ownEntityPrefixSegment = entityPrefix ?? autoEntityPrefixRef.current
  const resolvedEntityPrefix = composeEntityPrefix(runtimeContext.entityPrefix, ownEntityPrefixSegment)
  const resolvedSeedPathSalt = runtimeContext.seedPathSalt
  const resolvedMountSeed = useMemo(
    () => hashSeed(mountSeedRef.current ^ resolvedSeedPathSalt ^ 0x3e2f7a1d),
    [resolvedSeedPathSalt],
  )
  const effectivePhysics = runtimeContext.physicsOverride
  const shouldStripChildPhysics = Boolean(effectivePhysics)
  const collisionActivatedPhysics = useMemo(
    () => effectivePhysics ? isCollisionActivatedPhysicsType(effectivePhysics.type) : false,
    [effectivePhysics],
  )
  const [collisionActivatedChildren, setCollisionActivatedChildren] = useState<Record<string, FractureChildTransform>>({})
  useEffect(() => {
    if (!collisionActivatedPhysics) {
      setCollisionActivatedChildren({})
    }
  }, [collisionActivatedPhysics])
  const freezeChildTransform = useCallback((transform: FractureChildTransform) => {
    setCollisionActivatedChildren((prev) => {
      if (prev[transform.key]) return prev
      return {
        ...prev,
        [transform.key]: cloneFractureTransformState(transform),
      }
    })
  }, [])
  const unitMultiplier = useMemo(
    () => resolveGridUnitMultiplier(gridUnit),
    [gridUnit],
  )
  const fractureRotation = useMemo<Vec3>(() => toRadians(rotation), [rotation])
  const allChildren = useMemo(() => Children.toArray(children), [children])
  const parsedChildren = useMemo(() => {
    const objectChildren: ReactElement<Record<string, unknown>>[] = []
    const childEffectors: GridEffector[] = []

    allChildren.forEach((child) => {
      if (!isValidElement(child)) {
        return
      }

      const effectorType = getEffectorComponentType(child.type)
      if (!effectorType) {
        objectChildren.push(child as ReactElement<Record<string, unknown>>)
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

      if (effectorType === 'spherical') {
        childEffectors.push({
          type: 'spherical',
          ...(props as SphericalFieldEffectorProps),
        })
        return
      }

      if (effectorType === 'pushApart') {
        childEffectors.push({
          type: 'pushApart',
          ...(props as PushApartEffectorProps),
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

      if (effectorType === 'time') {
        childEffectors.push({
          type: 'time',
          ...(props as TimeEffectorProps),
        })
        return
      }

      childEffectors.push({
        type: 'step',
        ...(props as StepEffectorProps),
      })
    })

    return {
      objectChildren,
      childEffectors,
    }
  }, [allChildren])

  const templateChildren = useMemo<FractureTemplateChild[]>(() => {
    return parsedChildren.objectChildren.map((element) => {
      const props = (element.props ?? {}) as Record<string, unknown>
      const basePosition = isVec3(props.position) ? props.position : IDENTITY_POSITION
      const baseRotation = resolveChildRotationRadians(element.type, props.rotation)
      const baseScale = isVec3(props.scale) ? props.scale : IDENTITY_SCALE
      return {
        element,
        props,
        basePosition,
        baseRotation,
        baseScale,
        inferredCollider: resolveAutoColliderFromChild(element, 'cloner', IDENTITY_POSITION),
        baseColor: resolveChildBaseColorIndex(element),
        contagionCarrier: props.contagionCarrier === true,
        contagionInfectable: props.contagionInfectable !== false,
      }
    })
  }, [parsedChildren.objectChildren])

  const scaledEffectors = useMemo(
    () => parsedChildren.childEffectors.map((effector) => scaleEffectorByUnit(effector, unitMultiplier)),
    [parsedChildren.childEffectors, unitMultiplier],
  )
  const normalizedEffectors = useMemo(
    () => scaledEffectors.map((effector) => {
      let normalized: GridEffector = {
        ...effector,
      }
      if (effector.rotation) {
        normalized = {
          ...normalized,
          rotation: toRadians(effector.rotation),
        }
      }
      if (isLinearEffector(effector) && effector.fieldRotation) {
        normalized = {
          ...normalized,
          fieldRotation: toRadians(effector.fieldRotation),
        } as GridEffector
      }
      return normalized
    }),
    [scaledEffectors],
  )
  const resolvedEffectorSeeds = useMemo(
    () => normalizedEffectors.map((effector, effectorIndex) => {
      if (effector.type !== 'random' && effector.type !== 'noise') return null
      return resolveEffectorSeedForMount(
        effector.seed,
        resolvedMountSeed,
        resolvedSeedPathSalt,
        effector.type,
        effectorIndex,
      )
    }),
    [normalizedEffectors, resolvedMountSeed, resolvedSeedPathSalt],
  )
  const hasTimeEffector = useMemo(
    () => normalizedEffectors.some((effector) => effector.type === 'time' && effector.enabled !== false),
    [normalizedEffectors],
  )
  const hasAnimatedNoiseEffector = useMemo(
    () => normalizedEffectors.some((effector) => (
      effector.type === 'noise'
      && effector.enabled !== false
      && hasNonZeroVec3(resolveNoiseMotion(effector.noisePositionSpeed))
    )),
    [normalizedEffectors],
  )
  const [frameTime, setFrameTime] = useState(0)
  useFrame(({ clock }) => {
    if (!hasTimeEffector && !hasAnimatedNoiseEffector) return
    setFrameTime(clock.getElapsedTime())
  })
  const noiseGenerators = useMemo(
    () => normalizedEffectors.map((effector, effectorIndex) => {
      if (effector.type !== 'noise') return null
      const seed = resolvedEffectorSeeds[effectorIndex]
      return new SeededImprovedNoise(seed ?? 1)
    }),
    [normalizedEffectors, resolvedEffectorSeeds],
  )

  const shouldShowDebugEffectors = showDebugEffectors ?? SETTINGS.debug.enabled
  const debugBounds = useMemo<Vec3>(() => {
    if (templateChildren.length === 0) return [0.5, 0.5, 0.5]

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY

    templateChildren.forEach((child) => {
      const [x, y, z] = child.basePosition
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      maxZ = Math.max(maxZ, z)
    })

    return [
      Math.max(0.25, (maxX - minX) + 0.5),
      Math.max(0.25, (maxY - minY) + 0.5),
      Math.max(0.25, (maxZ - minZ) + 0.5),
    ]
  }, [templateChildren])

  const transforms = useMemo<FractureChildTransform[]>(() => logTimed('[Fracture] build child transforms', () => {
    const totalChildren = templateChildren.length

    return templateChildren.map((child, index) => {
      const evaluated = evaluateEffectorStack({
        localPosition: child.basePosition,
        effectors: normalizedEffectors,
        instanceIndex: index,
        instanceCount: totalChildren,
        timeSeconds: frameTime,
        resolvedEffectorSeeds,
        noiseGenerators,
        basePosition: child.basePosition,
        baseRotation: child.baseRotation,
        baseScale: child.baseScale,
      })

      const computedTransform: FractureChildTransform = {
        key: `fracture-${index}`,
        index,
        position: evaluated.position,
        rotation: evaluated.rotation,
        scale: evaluated.scale,
        excluded: evaluated.excluded,
        ...(evaluated.color !== undefined ? { color: evaluated.color } : {}),
        ...(evaluated.materialColors ? { materialColors: evaluated.materialColors } : {}),
      }

      if (computedTransform.excluded) return computedTransform
      if (collisionActivatedPhysics && collisionActivatedChildren[computedTransform.key]) {
        return collisionActivatedChildren[computedTransform.key]
      }
      return computedTransform
    })
  }), [
    collisionActivatedChildren,
    collisionActivatedPhysics,
    frameTime,
    noiseGenerators,
    normalizedEffectors,
    resolvedEffectorSeeds,
    templateChildren,
  ])

  if (!enabled) {
    const passthroughContextValue: GridRuntimeContextValue = {
      physicsOverride: effectivePhysics,
      seedPathSalt: resolvedSeedPathSalt,
      entityPrefix: resolvedEntityPrefix,
      contagionOverride: runtimeContext.contagionOverride,
    }
    return (
      <group position={position} rotation={fractureRotation} scale={scale}>
        <GRID_RUNTIME_CONTEXT.Provider value={passthroughContextValue}>
          {children}
        </GRID_RUNTIME_CONTEXT.Provider>
      </group>
    )
  }

  return (
    <group position={position} rotation={fractureRotation} scale={scale}>
      {transforms.map((transform) => {
        if (transform.excluded) return null
        const templateChild = templateChildren[transform.index]
        if (!templateChild) return null

        const childElement = templateChild.element
        const childProps = templateChild.props
        const inheritedContagion = runtimeContext.physicsOverride ? runtimeContext.contagionOverride : undefined
        const resolvedFractureContagionCarrier = inheritedContagion?.carrier ?? templateChild.contagionCarrier
        const resolvedFractureContagionInfectable = inheritedContagion?.infectable ?? templateChild.contagionInfectable
        const resolvedFractureColor = transform.color
          ?? (typeof transform.materialColors?.materialColor0 === 'number' ? transform.materialColors.materialColor0 : undefined)
          ?? templateChild.baseColor
        const resolvedFractureContagionColor = inheritedContagion?.color ?? resolvedFractureColor
        const resolvedFractureContagionOverride = {
          carrier: resolvedFractureContagionCarrier,
          infectable: resolvedFractureContagionInfectable,
          color: resolvedFractureContagionColor,
        }
        const childEntityPrefix = resolveCloneEntityPrefix(resolvedEntityPrefix, `fracture:${transform.index}`)
        const isContainerChild = isContainerType(childElement.type)
        const leafEntityId = isContainerChild
          ? undefined
          : resolveLeafEntityId(childEntityPrefix, 'child:0')
        const nextProps: Record<string, unknown> = {
          key: `fracture-child-${transform.index}`,
          position: IDENTITY_POSITION,
          rotation: IDENTITY_ROTATION,
          scale: IDENTITY_SCALE,
        }

        if (shouldStripChildPhysics) {
          Object.keys(childProps).forEach((key) => {
            if (key === 'physics' || key.startsWith('rigidBody')) {
              nextProps[key] = undefined
            }
          })
        }

        if (transform.color !== undefined) {
          if (isPrimitiveType(childElement.type) || Object.prototype.hasOwnProperty.call(childProps, 'color')) {
            nextProps.color = transform.color
          } else {
            nextProps.materialColor0 = transform.color
          }
        }

        if (transform.materialColors) {
          Object.entries(transform.materialColors).forEach(([key, value]) => {
            if (isPrimitiveType(childElement.type) && key.startsWith('materialColor')) return
            nextProps[key] = value
          })
        }

        if (leafEntityId) {
          nextProps.entityId = leafEntityId
          if (isPrimitiveType(childElement.type)) {
            nextProps.contagionColor = resolvedFractureContagionColor
          }
        }

        const renderedChild = cloneElement(childElement, nextProps)
        const childSeedPathSalt = deriveNestedSeedPathSalt(resolvedSeedPathSalt, transform.index, 0)
        const childRuntimeContextValue: GridRuntimeContextValue = {
          physicsOverride: effectivePhysics,
          seedPathSalt: childSeedPathSalt,
          entityPrefix: childEntityPrefix,
          contagionOverride: resolvedFractureContagionOverride,
        }
        const renderedWithContext = (
          <GRID_RUNTIME_CONTEXT.Provider value={childRuntimeContextValue}>
            {renderedChild}
          </GRID_RUNTIME_CONTEXT.Provider>
        )

        if (!effectivePhysics || isContainerChild) {
          return (
            <group
              key={transform.key}
              position={transform.position}
              rotation={transform.rotation}
              scale={transform.scale}
            >
              {renderedWithContext}
            </group>
          )
        }

        const colliderArgs = scaleColliderArgs(templateChild.inferredCollider.collider, transform.scale)
        const scaledColliderPosition: Vec3 = [
          templateChild.inferredCollider.colliderOffset[0] * transform.scale[0],
          templateChild.inferredCollider.colliderOffset[1] * transform.scale[1],
          templateChild.inferredCollider.colliderOffset[2] * transform.scale[2],
        ]

        return (
          <PhysicsWrapper
            key={transform.key}
            physics={effectivePhysics.type}
            colliderType={toColliderType(templateChild.inferredCollider.collider)}
            colliderArgs={colliderArgs}
            colliderPosition={scaledColliderPosition}
            position={transform.position}
            rotation={transform.rotation}
            mass={effectivePhysics.mass}
            friction={effectivePhysics.friction}
            restitution={effectivePhysics.restitution}
            lockRotations={effectivePhysics.lockRotations}
            entityId={leafEntityId}
            contagionCarrier={resolvedFractureContagionCarrier}
            contagionInfectable={resolvedFractureContagionInfectable}
            contagionColor={resolvedFractureContagionColor}
            onCollisionActivated={collisionActivatedPhysics ? () => freezeChildTransform(transform) : undefined}
          >
            <group scale={transform.scale}>
              {renderedWithContext}
            </group>
          </PhysicsWrapper>
        )
      })}

      {shouldShowDebugEffectors && normalizedEffectors
        .filter((effector): effector is LinearFieldEffectorConfig => isLinearEffector(effector) && effector.enabled !== false)
        .map((effector, index) => {
          const axis = effector.axis ?? 'x'
          const center = effector.center ?? 0
          const size = Math.max(0.001, Math.abs(effector.size ?? 1))
          const half = size / 2
          const axisIndex = axisToIndex(axis)
          const axisDirection = getAxisDirection(axis)
          const directionSign = effector.invert ? -1 : 1
          const headScale = Math.max(0.03, Math.min(debugBounds[0], debugBounds[1], debugBounds[2]) * 0.04)
          const lineColor = effector.invert ? '#ff9f43' : '#2ecc71'
          const thin = Math.max(0.002, Math.min(debugBounds[0], debugBounds[1], debugBounds[2]) * 0.015)
          const fieldOrigin = effector.fieldPosition ?? IDENTITY_POSITION
          const fieldRotation = effector.fieldRotation ?? IDENTITY_ROTATION
          const planeSize = getPlaneDebugSize(axis, thin, debugBounds)
          const volumeSize = getPlaneDebugSize(axis, size, debugBounds)

          const startLocal: Vec3 = [0, 0, 0]
          startLocal[axisIndex] = center - half
          const endLocal: Vec3 = [0, 0, 0]
          endLocal[axisIndex] = center + half
          const volumeCenter: Vec3 = [0, 0, 0]
          volumeCenter[axisIndex] = center

          const arrowStart = directionSign > 0 ? startLocal : endLocal
          const arrowEnd = directionSign > 0 ? endLocal : startLocal
          const arrowHeadRotation = getArrowHeadRotation(axis, directionSign > 0)
          const arrowLinePositions = new Float32Array([
            arrowStart[0], arrowStart[1], arrowStart[2],
            arrowEnd[0], arrowEnd[1], arrowEnd[2],
          ])

          let remapMarker: Vec3 | null = null
          const innerOffset = clamp01(effector.innerOffset ?? 0)
          if ((effector.enableRemap ?? true) && innerOffset > 0) {
            const marker: Vec3 = [0, 0, 0]
            const markerPosition = directionSign > 0
              ? (center - half) + (innerOffset * size)
              : (center + half) - (innerOffset * size)
            marker[axisIndex] = markerPosition
            remapMarker = marker
          }

          return (
            <group
              key={`fracture-linear-field-debug-${index}`}
              userData={{ excludeFromOutlines: true }}
              renderOrder={2000}
              position={fieldOrigin}
              rotation={fieldRotation}
            >
              <mesh position={volumeCenter}>
                <boxGeometry args={volumeSize} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.08} depthWrite={false} />
              </mesh>

              <mesh position={startLocal}>
                <boxGeometry args={planeSize} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              <mesh position={endLocal}>
                <boxGeometry args={planeSize} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              {remapMarker && (
                <mesh position={remapMarker}>
                  <boxGeometry args={planeSize} />
                  <meshBasicMaterial color="#74b9ff" wireframe transparent opacity={0.9} depthWrite={false} />
                </mesh>
              )}

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

      {shouldShowDebugEffectors && normalizedEffectors
        .filter((effector): effector is SphericalFieldEffectorConfig => isSphericalEffector(effector) && effector.enabled !== false)
        .map((effector, index) => {
          const radius = Math.max(0.001, Math.abs(effector.radius ?? 20))
          const fieldPosition = effector.fieldPosition ?? IDENTITY_POSITION
          const lineColor = effector.invert ? '#ff9f43' : '#2ecc71'
          const innerOffset = clamp01(effector.innerOffset ?? 0)
          const innerRadius = Math.max(0.001, radius * (1 - innerOffset))

          return (
            <group
              key={`fracture-spherical-field-debug-${index}`}
              userData={{ excludeFromOutlines: true }}
              renderOrder={2000}
              position={fieldPosition}
            >
              <mesh>
                <sphereGeometry args={[radius, 24, 18]} />
                <meshBasicMaterial color={lineColor} transparent opacity={0.08} depthWrite={false} />
              </mesh>

              <mesh>
                <sphereGeometry args={[radius, 24, 18]} />
                <meshBasicMaterial color={lineColor} wireframe transparent opacity={0.55} depthWrite={false} />
              </mesh>

              {(effector.enableRemap ?? true) && innerOffset > 0 && (
                <mesh>
                  <sphereGeometry args={[innerRadius, 24, 18]} />
                  <meshBasicMaterial color="#74b9ff" wireframe transparent opacity={0.9} depthWrite={false} />
                </mesh>
              )}
            </group>
          )
        })}
    </group>
  )
}
