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
      return <CylinderCollider args={colliderArgs as [number, number]} />
    }
    if (colliderType === 'ball') {
      return <BallCollider args={colliderArgs as [number]} />
    }
    return <CuboidCollider args={colliderArgs as [number, number, number]} />
  })()

  return (
    <RigidBody {...rbProps}>
      {collider}
      {children}
    </RigidBody>
  )
}

