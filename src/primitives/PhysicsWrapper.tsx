import type { ReactNode } from 'react'
import {
  RigidBody,
  CuboidCollider,
  CylinderCollider,
  BallCollider,
  type RigidBodyProps,
} from '@react-three/rapier'
import type { Vec3 } from '../GameSettings'

type PhysicsBodyType = Exclude<RigidBodyProps['type'], undefined>

export type PhysicsProps = {
  physics?: PhysicsBodyType
  mass?: number
  friction?: number
  lockRotations?: boolean
  position?: Vec3
  rotation?: Vec3
}

type ColliderType = 'cuboid' | 'cylinder' | 'ball'

type PhysicsWrapperProps = Omit<RigidBodyProps, 'type' | 'position' | 'rotation' | 'mass' | 'friction'> & {
  physics?: PhysicsBodyType
  colliderType?: ColliderType
  colliderArgs: [number] | [number, number] | [number, number, number]
  colliderPosition?: Vec3
  position?: Vec3
  rotation?: Vec3
  mass?: number
  friction?: number
  lockRotations?: boolean
  children: ReactNode
}

export function PhysicsWrapper({
  physics,
  colliderType = 'cuboid',
  colliderArgs,
  colliderPosition,
  position,
  rotation,
  mass,
  friction,
  lockRotations,
  children,
  ...rigidBodyProps
}: PhysicsWrapperProps) {
  if (!physics) return <>{children}</>

  const rbProps: RigidBodyProps = { type: physics, ...rigidBodyProps }
  if (position !== undefined) rbProps.position = position
  if (rotation !== undefined) rbProps.rotation = rotation
  if (mass !== undefined) rbProps.mass = mass
  if (friction !== undefined) rbProps.friction = friction
  if (lockRotations) rbProps.lockRotations = true

  const collider = (() => {
    if (colliderType === 'cylinder') {
      return <CylinderCollider args={colliderArgs as [number, number]} position={colliderPosition} />
    }
    if (colliderType === 'ball') {
      return <BallCollider args={colliderArgs as [number]} position={colliderPosition} />
    }
    return <CuboidCollider args={colliderArgs as [number, number, number]} position={colliderPosition} />
  })()

  return (
    <RigidBody {...rbProps}>
      {collider}
      {children}
    </RigidBody>
  )
}
