import * as THREE from 'three'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { C4DMaterial } from '@/render/Materials'
import type { MaterialColorIndex, Vec3 } from '@/settings/GameSettings'
import type { PositionTargetHandle } from '@/scene/PositionTargetHandle'
import { toRadians, useSurfaceId } from '@/scene/SceneHelpers'
import { PhysicsWrapper, type PhysicsProps } from '@/physics/PhysicsWrapper'
import { getAlignOffset, type Align3 } from '@/geometry/align'

type MeshElementProps = Omit<ThreeElements['mesh'], 'position' | 'rotation'>

export type CubeElementProps = MeshElementProps & PhysicsProps & {
  size?: Vec3
  color?: MaterialColorIndex
  singleTone?: boolean
  hidden?: boolean
  align?: Align3
}

export const CubeElement = forwardRef<PositionTargetHandle, CubeElementProps>(function CubeElement({
  size = [1, 1, 1],
  color = 0,
  singleTone = false,
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
    () => getAlignOffset(size, align),
    [size, align?.x, align?.y, align?.z],
  )
  const colliderArgs = useMemo<[number, number, number]>(
    () => [size[0] / 2, size[1] / 2, size[2] / 2],
    [size],
  )

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
      <boxGeometry args={size} />
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

  return (
    <PhysicsWrapper
      physics={physics}
      colliderType="cuboid"
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
