import * as THREE from 'three'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { SETTINGS } from '../GameSettings'

// InvisibleFloor — inkluderar statisk fysik-collider för golvet
export function InvisibleFloor({ shadowColor = SETTINGS.colors.shadow }: { shadowColor?: string }) {
  return (
    <group position={[0, 0, 0]}>
      <RigidBody type="fixed">
        <CuboidCollider args={[50, 0.01, 50]} position={[0, -0.01, 0]} />
      </RigidBody>

      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial colorWrite={false} depthWrite />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <shadowMaterial color={shadowColor} opacity={1} blending={THREE.NormalBlending} />
      </mesh>
    </group>
  )
}
