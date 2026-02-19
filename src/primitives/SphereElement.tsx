import * as THREE from 'three'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { C4DMaterial } from '../Materials'
import type { MaterialColorIndex, Vec3 } from '../GameSettings'
import type { PositionTargetHandle } from '../PositionTargetHandle'
import { toRadians, useSurfaceId } from '../SceneHelpers'
import { PhysicsWrapper, type PhysicsProps } from './PhysicsWrapper'
import { getAlignOffset, type Align3 } from './anchor'

type MeshElementProps = Omit<ThreeElements['mesh'], 'position' | 'rotation'>

type SphereElementProps = MeshElementProps & PhysicsProps & {
  radius?: number
  segments?: number
  color?: MaterialColorIndex
  singleTone?: boolean
  flatShading?: boolean
  hidden?: boolean
  align?: Align3
}

export const SphereElement = forwardRef<PositionTargetHandle, SphereElementProps>(function SphereElement({
  radius = 0.5,
  segments = 32,
  color = 0,
  singleTone = true,
  flatShading = false,
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
    () => getAlignOffset([radius * 2, radius * 2, radius * 2], align),
    [radius, align?.x, align?.y, align?.z],
  )
  const colliderArgs = useMemo<[number]>(() => [radius], [radius])

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
      <sphereGeometry args={[radius, segments, segments]} />
      <C4DMaterial color={color} singleTone={singleTone} flatShading={flatShading} />
    </mesh>
  )

  if (!physics) {
    return (
      <group position={position} rotation={rotationRadians} {...(scale !== undefined ? { scale } : {})}>
        {mesh}
      </group>
    )
  }

  return (
    <PhysicsWrapper
      physics={physics}
      colliderType="ball"
      colliderArgs={colliderArgs}
      colliderPosition={anchorOffset}
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
