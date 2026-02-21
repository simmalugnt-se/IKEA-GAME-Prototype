import { CubeElement } from '@/primitives/CubeElement'
import { SphereElement } from '@/primitives/SphereElement'
import { CylinderElement } from '@/primitives/CylinderElement'
import { BlockElement } from '@/primitives/BlockElement'
import { Stair } from './assets/models/Stair'
import { VaultStairs } from './assets/models/VaultStairs'
import { Laddertest } from './assets/models/Laddertest'
import { BrickBalloon } from './assets/models/BrickBalloon'
import { BallBalloon } from './assets/models/BallBalloon'
import {
  GridCloner,
  LinearFieldEffector,
  RandomEffector,
  NoiseEffector,
  TimeEffector,
  StepEffector,
  type GridEffector,
} from '@/scene/GridCloner'
import { useLevelStore, type LevelNode } from './levelStore'
import type { Vec3 } from '@/settings/GameSettings'

function toRadians(rotation: Vec3): Vec3 {
  return [
    rotation[0] * (Math.PI / 180),
    rotation[1] * (Math.PI / 180),
    rotation[2] * (Math.PI / 180),
  ]
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
  Stair: { component: Stair, needsRotationConversion: true },
  VaultStairs: { component: VaultStairs, needsRotationConversion: true },
  Laddertest: { component: Laddertest, needsRotationConversion: true },
  BrickBalloon: { component: BrickBalloon, needsRotationConversion: true },
  BallBalloon: { component: BallBalloon, needsRotationConversion: true },
}

const EFFECTOR_TYPE_MAP: Record<string, string> = {
  LinearFieldEffector: 'linear',
  RandomEffector: 'random',
  NoiseEffector: 'noise',
  TimeEffector: 'time',
  StepEffector: 'step',
}

const EFFECTOR_COMPONENTS: Record<string, React.ComponentType<any>> = {
  LinearFieldEffector,
  RandomEffector,
  NoiseEffector,
  TimeEffector,
  StepEffector,
}

function isNodeHiddenInBuilder(node: LevelNode): boolean {
  return Boolean(node.builder?.hiddenInBuilder)
}

function renderObjectNode(node: LevelNode) {
  const entry = COMPONENT_REGISTRY[node.type]
  if (!entry) {
    console.warn(`Unknown object type: ${node.type} (id: ${node.id})`)
    return null
  }

  const { component: Component, needsRotationConversion } = entry
  const rotation = needsRotationConversion && node.rotation
    ? toRadians(node.rotation)
    : node.rotation

  return (
    <Component
      key={node.id}
      {...node.props}
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

function renderNullNode(node: LevelNode) {
  const children = (node.children ?? []).filter((child) => child.nodeType === 'object')
  const rotation: Vec3 = node.rotation ? toRadians(node.rotation) : [0, 0, 0]

  return (
    <group
      key={node.id}
      position={node.position}
      rotation={rotation}
    >
      {children.map((child) => renderNode(child))}
    </group>
  )
}

function renderGridClonerNode(node: LevelNode) {
  const children = node.children ?? []

  const effectors: GridEffector[] = []
  const objectChildren: LevelNode[] = []

  for (const child of children) {
    if (isNodeHiddenInBuilder(child)) continue
    if (child.nodeType === 'effector') {
      const effectorType = EFFECTOR_TYPE_MAP[child.type]
      if (effectorType) {
        effectors.push({ type: effectorType, ...child.props } as GridEffector)
      }
    } else if (child.nodeType === 'object') {
      objectChildren.push(child)
    }
  }

  const { position, rotation, ...restProps } = node.props as Record<string, unknown>

  return (
    <GridCloner
      key={node.id}
      position={node.position}
      rotation={node.rotation}
      effectors={effectors}
      {...restProps}
    >
      {objectChildren.map((child) => renderNode(child))}
    </GridCloner>
  )
}

function renderNode(node: LevelNode) {
  if (isNodeHiddenInBuilder(node)) {
    return null
  }

  if (node.nodeType === 'effector') {
    return renderEffectorNode(node)
  }

  if (node.type === 'Null') {
    return renderNullNode(node)
  }

  if (node.type === 'GridCloner') {
    return renderGridClonerNode(node)
  }

  return renderObjectNode(node)
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
