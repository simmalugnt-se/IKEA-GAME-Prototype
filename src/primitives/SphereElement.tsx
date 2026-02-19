import * as THREE from 'three'
import { forwardRef, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { C4DMaterial } from '../Materials'
import type { MaterialColorIndex, Vec3 } from '../GameSettings'
import { toRadians, useSurfaceId } from '../SceneHelpers'
import { PhysicsWrapper, type PhysicsProps } from './PhysicsWrapper'

type MeshElementProps = Omit<ThreeElements['mesh'], 'position' | 'rotation'>

type SphereElementProps = MeshElementProps & PhysicsProps & {
  radius?: number
  segments?: number
  color?: MaterialColorIndex
  singleTone?: boolean
  flatShading?: boolean
  hidden?: boolean
}

export const SphereElement = forwardRef<THREE.Mesh, SphereElementProps>(function SphereElement({
  radius = 0.5,
  segments = 32,
  color = 0,
  singleTone = true,
  flatShading = false,
  hidden = false,
  visible = true,
  physics,
  mass,
  friction,
  lockRotations,
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) {
  const surfaceId = useSurfaceId()
  const rotationRadians = useMemo(() => toRadians(rotation), [rotation])
  const colliderArgs = useMemo<[number]>(() => [radius], [radius])

  const mesh = (
    <mesh
      {...props}
      ref={ref}
      {...(!physics ? { position, rotation: rotationRadians } : {})}
      visible={visible && !hidden}
      castShadow
      receiveShadow
      userData={{ surfaceId }}
    >
      <sphereGeometry args={[radius, segments, segments]} />
      <C4DMaterial color={color} singleTone={singleTone} flatShading={flatShading} />
    </mesh>
  )

  return (
    <PhysicsWrapper
      physics={physics}
      colliderType="ball"
      colliderArgs={colliderArgs}
      position={position}
      rotation={rotationRadians}
      mass={mass}
      friction={friction}
      lockRotations={lockRotations}
    >
      {mesh}
    </PhysicsWrapper>
  )
})

