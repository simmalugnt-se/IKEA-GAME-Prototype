import { CubeElement } from '@/primitives/CubeElement'
import { SphereElement } from '@/primitives/SphereElement'
import { CylinderElement } from '@/primitives/CylinderElement'
import { BlockElement } from '@/primitives/BlockElement'
import { SplineElement } from '@/primitives/SplineElement'
import { TriangleBlockElement } from '@/primitives/TriangleBlockElement'
import { CylinderBlockElement } from '@/primitives/CylinderBlockElement'
import { BallElement } from '@/primitives/BallElement'
import { DomeBlockElement } from '@/primitives/DomeBlockElement'
import { ConeBlockElement } from '@/primitives/ConeBlockElement'
import { StepsBlockElement } from '@/primitives/StepsBlockElement'
import { BridgeBlockElement } from '@/primitives/BridgeBlockElement'
import { HalfCylinderBlockElement } from '@/primitives/HalfCylinderBlockElement'
import {
  Fracture,
  GridCloner,
  LinearFieldEffector,
  SphericalFieldEffector,
  PushApartEffector,
  RandomEffector,
  NoiseEffector,
  TimeEffector,
  StepEffector,
} from '@/scene/GridCloner'
import { TransformMotion } from '@/scene/TransformMotion'
import { useLevelStore, type LevelNode } from './levelStore'
import type { Vec3 } from '@/settings/GameSettings'

const IDENTITY_SCALE: Vec3 = [1, 1, 1]

function toRadians(rotation: Vec3): Vec3 {
  return [
    rotation[0] * (Math.PI / 180),
    rotation[1] * (Math.PI / 180),
    rotation[2] * (Math.PI / 180),
  ]
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value)
    && value.length === 3
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
    && typeof value[2] === 'number'
}

function multiplyVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2]]
}

function resolveNodeScale(node: LevelNode): Vec3 {
  return isVec3(node.scale) ? node.scale : IDENTITY_SCALE
}

type ComponentRegistryEntry = {
  component: React.ComponentType<any>
  needsRotationConversion: boolean
}

const COMPONENT_REGISTRY: Record<string, ComponentRegistryEntry> = {
  CubeElement: { component: CubeElement, needsRotationConversion: false },
  SphereElement: { component: SphereElement, needsRotationConversion: false },
  CylinderElement: { component: CylinderElement, needsRotationConversion: false },
  BlockElement: { component: BlockElement, needsRotationConversion: false },
  TriangleBlockElement: { component: TriangleBlockElement, needsRotationConversion: false },
  CylinderBlockElement: { component: CylinderBlockElement, needsRotationConversion: false },
  BallElement: { component: BallElement, needsRotationConversion: false },
  DomeBlockElement: { component: DomeBlockElement, needsRotationConversion: false },
  ConeBlockElement: { component: ConeBlockElement, needsRotationConversion: false },
  StepsBlockElement: { component: StepsBlockElement, needsRotationConversion: false },
  BridgeBlockElement: { component: BridgeBlockElement, needsRotationConversion: false },
  HalfCylinderBlockElement: { component: HalfCylinderBlockElement, needsRotationConversion: false },
  SplineElement: { component: SplineElement, needsRotationConversion: false },
}

const EFFECTOR_COMPONENTS: Record<string, React.ComponentType<any>> = {
  LinearFieldEffector,
  SphericalFieldEffector,
  PushApartEffector,
  RandomEffector,
  NoiseEffector,
  TimeEffector,
  StepEffector,
}

const CONTAGION_CAPABLE_OBJECT_TYPES = new Set([
  'CubeElement',
  'SphereElement',
  'CylinderElement',
  'BlockElement',
  'TriangleBlockElement',
  'CylinderBlockElement',
  'BallElement',
  'DomeBlockElement',
  'ConeBlockElement',
  'StepsBlockElement',
  'BridgeBlockElement',
  'HalfCylinderBlockElement',
])

function isNodeHiddenInBuilder(node: LevelNode): boolean {
  return Boolean(node.builder?.hiddenInBuilder)
}

function renderObjectNode(
  node: LevelNode,
  asClonerTemplate: boolean,
) {
  const entry = COMPONENT_REGISTRY[node.type]
  if (!entry) {
    console.warn(`Unknown object type: ${node.type} (id: ${node.id})`)
    return null
  }

  const { component: Component, needsRotationConversion } = entry
  const rotation = needsRotationConversion && node.rotation
    ? toRadians(node.rotation)
    : node.rotation
  const nodeProps = (node.props ?? {}) as Record<string, unknown>
  const nextProps: Record<string, unknown> = { ...nodeProps }
  const propsScale = isVec3(nodeProps.scale) ? nodeProps.scale : IDENTITY_SCALE
  nextProps.scale = multiplyVec3(resolveNodeScale(node), propsScale)

  if (!asClonerTemplate) {
    if (CONTAGION_CAPABLE_OBJECT_TYPES.has(node.type)) {
      nextProps.entityId = node.id
      nextProps.contagionCarrier = nodeProps.contagionCarrier === true
      if (nodeProps.contagionInfectable === false) {
        nextProps.contagionInfectable = false
      }
    }
  }

  return (
    <Component
      key={node.id}
      {...nextProps}
      position={node.position}
      rotation={rotation}
    />
  )
}

function renderEffectorNode(node: LevelNode) {
  const Component = EFFECTOR_COMPONENTS[node.type]
  if (!Component) {
    console.warn(`Unknown effector type: ${node.type} (id: ${node.id})`)
    return null
  }
  return <Component key={node.id} {...node.props} />
}

function renderNullNode(
  node: LevelNode,
  asClonerTemplate: boolean,
) {
  const children = (node.children ?? []).filter((child) => child.nodeType === 'object')
  const rotation: Vec3 = node.rotation ? toRadians(node.rotation) : [0, 0, 0]

  if (asClonerTemplate) {
    // In cloner templates we use Fracture as a transparent container so parent
    // GridCloner physics override can propagate to leaf objects.
    return (
      <Fracture
        key={node.id}
        position={node.position}
        rotation={node.rotation}
        scale={resolveNodeScale(node)}
        entityPrefix={node.id}
      >
        {children.map((child) => renderNode(child, true))}
      </Fracture>
    )
  }

  return (
    <group
      key={node.id}
      position={node.position}
      rotation={rotation}
      scale={resolveNodeScale(node)}
    >
      {children.map((child) => renderNode(child, asClonerTemplate))}
    </group>
  )
}

function renderTransformMotionNode(
  node: LevelNode,
  asClonerTemplate: boolean,
) {
  const children = (node.children ?? []).filter((child) => child.nodeType === 'object')
  const rotation: Vec3 = node.rotation ? toRadians(node.rotation) : [0, 0, 0]
  const motionProps = (node.props ?? {}) as Record<string, unknown>

  return (
    <TransformMotion
      key={node.id}
      position={node.position}
      rotation={rotation}
      scale={resolveNodeScale(node)}
      {...motionProps}
    >
      {children.map((child) => renderNode(child, asClonerTemplate))}
    </TransformMotion>
  )
}

function renderGridClonerNode(node: LevelNode) {
  const children = node.children ?? []
  const { position, rotation, ...restProps } = node.props as Record<string, unknown>
  const nodeScale = resolveNodeScale(node)

  return (
    <group key={node.id} scale={nodeScale}>
      <GridCloner
        {...restProps}
        position={node.position}
        rotation={node.rotation}
        entityPrefix={node.id}
      >
        {children.map((child) => renderNode(child, true))}
      </GridCloner>
    </group>
  )
}

function renderFractureNode(node: LevelNode) {
  const children = node.children ?? []
  const { position, rotation, ...restProps } = node.props as Record<string, unknown>

  return (
    <Fracture
      key={node.id}
      {...restProps}
      position={node.position}
      rotation={node.rotation}
      scale={resolveNodeScale(node)}
      entityPrefix={node.id}
    >
      {children.map((child) => renderNode(child, false))}
    </Fracture>
  )
}

export function renderNode(
  node: LevelNode,
  asClonerTemplate = false,
) {
  if (isNodeHiddenInBuilder(node)) {
    return null
  }

  if (node.nodeType === 'effector') {
    return renderEffectorNode(node)
  }

  if (node.type === 'Null') {
    return renderNullNode(node, asClonerTemplate)
  }

  if (node.type === 'TransformMotion') {
    return renderTransformMotionNode(node, asClonerTemplate)
  }

  if (node.type === 'GridCloner') {
    return renderGridClonerNode(node)
  }

  if (node.type === 'Fracture') {
    return renderFractureNode(node)
  }

  return renderObjectNode(node, asClonerTemplate)
}

export function LevelRenderer() {
  const levelData = useLevelStore((state) => state.levelData)
  const levelReloadKey = useLevelStore((state) => state.levelReloadKey)

  if (!levelData) {
    return null
  }

  return (
    <group key={levelReloadKey}>
      {levelData.nodes.map((node) => renderNode(node))}
    </group>
  )
}
