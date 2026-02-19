import * as THREE from 'three'
import { forwardRef, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { C4DMaterial } from '../Materials'
import type { MaterialColorIndex, Vec3 } from '../GameSettings'
import { toRadians, useSurfaceId } from '../SceneHelpers'
import { PhysicsWrapper, type PhysicsProps } from './PhysicsWrapper'

type MeshElementProps = Omit<ThreeElements['mesh'], 'position' | 'rotation'>

type CubeElementProps = MeshElementProps & PhysicsProps & {
  size?: Vec3
  color?: MaterialColorIndex
  singleTone?: boolean
  hidden?: boolean
}

export const CubeElement = forwardRef<THREE.Mesh, CubeElementProps>(function CubeElement({
  size = [1, 1, 1],
  color = 0,
  singleTone = false,
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
  const colliderArgs = useMemo<[number, number, number]>(
    () => [size[0] / 2, size[1] / 2, size[2] / 2],
    [size],
  )

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
      <boxGeometry args={size} />
      <C4DMaterial color={color} singleTone={singleTone} />
    </mesh>
  )

  return (
    <PhysicsWrapper
      physics={physics}
      colliderType="cuboid"
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

