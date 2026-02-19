import * as THREE from 'three'
import { forwardRef, useMemo } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { RigidBody, ConvexHullCollider, type RigidBodyProps } from '@react-three/rapier'
import { C4DMaterial } from '../Materials'
import type { MaterialColorIndex, Vec3 } from '../GameSettings'
import { toRadians, useSurfaceId } from '../SceneHelpers'
import type { PhysicsProps } from './PhysicsWrapper'

type MeshElementProps = Omit<ThreeElements['mesh'], 'position' | 'rotation'>

type CylinderElementProps = MeshElementProps & PhysicsProps & {
  radius?: number
  height?: number
  segments?: number
  colliderSegments?: number
  color?: MaterialColorIndex
  singleTone?: boolean
  hidden?: boolean
}

export const CylinderElement = forwardRef<THREE.Mesh, CylinderElementProps>(function CylinderElement({
  radius = 0.5,
  height = 1,
  segments = 32,
  colliderSegments = 8,
  color = 0,
  singleTone = true,
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

  // Generera cylinderformad konvex hull: topp- och bottenring med N sidor
  const hullVertices = useMemo(() => {
    const verts: number[] = []
    const halfH = height / 2
    for (let i = 0; i < colliderSegments; i++) {
      const angle = (i / colliderSegments) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      verts.push(x, halfH, z)
      verts.push(x, -halfH, z)
    }
    return new Float32Array(verts)
  }, [radius, height, colliderSegments])

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
      <cylinderGeometry args={[radius, radius, height, segments]} />
      <C4DMaterial color={color} singleTone={singleTone} />
    </mesh>
  )

  if (!physics) return mesh

  const rbProps: RigidBodyProps = { type: physics }
  if (position !== undefined) rbProps.position = position
  if (rotation !== undefined) rbProps.rotation = rotationRadians
  if (mass !== undefined) rbProps.mass = mass
  if (friction !== undefined) rbProps.friction = friction
  if (lockRotations) rbProps.lockRotations = true

  return (
    <RigidBody {...rbProps} colliders={false}>
      <ConvexHullCollider args={[hullVertices]} />
      {mesh}
    </RigidBody>
  )
})
