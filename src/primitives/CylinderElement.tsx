import * as THREE from 'three'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { RigidBody, ConvexHullCollider, type RigidBodyProps } from '@react-three/rapier'
import { C4DMaterial } from '../Materials'
import type { MaterialColorIndex, Vec3 } from '../GameSettings'
import type { PositionTargetHandle } from '../PositionTargetHandle'
import { toRadians, useSurfaceId } from '../SceneHelpers'
import type { PhysicsProps } from './PhysicsWrapper'
import { getAlignOffset, type Align3 } from './anchor'

type MeshElementProps = Omit<ThreeElements['mesh'], 'position' | 'rotation'>

type CylinderElementProps = MeshElementProps & PhysicsProps & {
  radius?: number
  height?: number
  segments?: number
  colliderSegments?: number
  color?: MaterialColorIndex
  singleTone?: boolean
  hidden?: boolean
  align?: Align3
}

export const CylinderElement = forwardRef<PositionTargetHandle, CylinderElementProps>(function CylinderElement({
  radius = 0.5,
  height = 1,
  segments = 32,
  colliderSegments = 8,
  color = 0,
  singleTone = true,
  hidden = false,
  visible = true,
  align,
  scale,
  physics,
  mass,
  friction,
  lockRotations,
  position,
  rotation = [0, 0, 0],
  ...props
}, ref) {
  const meshRef = useRef<THREE.Mesh | null>(null)
  const worldPos = useMemo(() => new THREE.Vector3(), [])
  const surfaceId = useSurfaceId()
  const rotationRadians = useMemo(() => toRadians(rotation), [rotation])
  const anchorOffset = useMemo<Vec3>(
    () => getAlignOffset([radius * 2, height, radius * 2], align),
    [radius, height, align?.x, align?.y, align?.z],
  )

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

  useImperativeHandle(ref, () => ({
    getPosition: () => {
      if (!meshRef.current) return undefined
      const source = meshRef.current.parent ?? meshRef.current
      source.getWorldPosition(worldPos)
      return { x: worldPos.x, y: worldPos.y, z: worldPos.z }
    },
  }), [worldPos])

  const mesh = (
    <mesh
      {...props}
      ref={meshRef}
      position={anchorOffset}
      {...(physics && scale !== undefined ? { scale } : {})}
      visible={visible && !hidden}
      castShadow
      receiveShadow
      userData={{ surfaceId }}
    >
      <cylinderGeometry args={[radius, radius, height, segments]} />
      <C4DMaterial color={color} singleTone={singleTone} />
    </mesh>
  )

  if (!physics) {
    return (
      <group position={position} rotation={rotationRadians} {...(scale !== undefined ? { scale } : {})}>
        {mesh}
      </group>
    )
  }

  const rbProps: RigidBodyProps = { type: physics }
  if (position !== undefined) rbProps.position = position
  if (rotation !== undefined) rbProps.rotation = rotationRadians
  if (mass !== undefined) rbProps.mass = mass
  if (friction !== undefined) rbProps.friction = friction
  if (lockRotations) rbProps.lockRotations = true

  return (
    <RigidBody {...rbProps} colliders={false}>
      <ConvexHullCollider args={[hullVertices]} position={anchorOffset} />
      {mesh}
    </RigidBody>
  )
})
