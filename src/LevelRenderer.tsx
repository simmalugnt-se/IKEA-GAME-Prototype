import { CubeElement, SphereElement, CylinderElement } from './SceneComponents'
import { Stair } from './assets/models/Stair'
import { VaultStairs } from './assets/models/VaultStairs'
import { Laddertest } from './assets/models/Laddertest'
import { BrickBalloon } from './assets/models/BrickBalloon'
import { BallBalloon } from './assets/models/BallBalloon'
import { useLevelStore, type LevelObject } from './levelStore'
import type { Vec3 } from './GameSettings'

// Helper to convert degrees to radians
function toRadians(rotation: Vec3): Vec3 {
  return [
    rotation[0] * (Math.PI / 180),
    rotation[1] * (Math.PI / 180),
    rotation[2] * (Math.PI / 180),
  ]
}

// Component registry entry
type ComponentRegistryEntry = {
  component: React.ComponentType<any>
  needsRotationConversion: boolean // true if component expects radians (R3F group), false if it converts internally
}

// Registry mapping type strings to components
const COMPONENT_REGISTRY: Record<string, ComponentRegistryEntry> = {
  // Primitives - these handle rotation conversion internally (expect degrees)
  CubeElement: {
    component: CubeElement,
    needsRotationConversion: false,
  },
  SphereElement: {
    component: SphereElement,
    needsRotationConversion: false,
  },
  CylinderElement: {
    component: CylinderElement,
    needsRotationConversion: false,
  },
  
  // Model components - these spread props onto R3F groups (expect radians)
  Stair: {
    component: Stair,
    needsRotationConversion: true,
  },
  VaultStairs: {
    component: VaultStairs,
    needsRotationConversion: true,
  },
  Laddertest: {
    component: Laddertest,
    needsRotationConversion: true,
  },
  BrickBalloon: {
    component: BrickBalloon,
    needsRotationConversion: true,
  },
  BallBalloon: {
    component: BallBalloon,
    needsRotationConversion: true,
  },
}

function renderLevelObject(obj: LevelObject) {
  const registryEntry = COMPONENT_REGISTRY[obj.type]
  
  if (!registryEntry) {
    console.warn(`Unknown object type: ${obj.type} (id: ${obj.id})`)
    return null
  }
  
  const { component: Component, needsRotationConversion } = registryEntry
  
  // Handle rotation conversion
  const rotation = needsRotationConversion 
    ? toRadians(obj.rotation)
    : obj.rotation
  
  // Spread props, ensuring position and rotation override any props values
  const props = {
    ...obj.props,
    position: obj.position,
    rotation,
  }
  
  return <Component key={obj.id} {...props} />
}

export function LevelRenderer() {
  const levelData = useLevelStore((state) => state.levelData)
  const levelReloadKey = useLevelStore((state) => state.levelReloadKey)
  
  if (!levelData) {
    return null
  }
  
  return (
    <group key={levelReloadKey}>
      {levelData.objects.map((obj) => renderLevelObject(obj))}
    </group>
  )
}
