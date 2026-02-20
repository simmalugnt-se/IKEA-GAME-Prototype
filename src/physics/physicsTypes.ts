export const BASE_PHYSICS_BODY_TYPES = [
  'fixed',
  'dynamic',
  'kinematicPosition',
  'kinematicVelocity',
] as const

export const COLLISION_ACTIVATED_PHYSICS_TYPES = [
  'noneToDynamicOnCollision',
  'solidNoneToDynamicOnCollision',
  'animNoneToDynamicOnCollision',
] as const

export const GAME_PHYSICS_BODY_TYPES = [
  ...BASE_PHYSICS_BODY_TYPES,
  ...COLLISION_ACTIVATED_PHYSICS_TYPES,
] as const

export type BasePhysicsBodyType = (typeof BASE_PHYSICS_BODY_TYPES)[number]
export type CollisionActivatedPhysicsType = (typeof COLLISION_ACTIVATED_PHYSICS_TYPES)[number]
export type GamePhysicsBodyType = (typeof GAME_PHYSICS_BODY_TYPES)[number]

export function isCollisionActivatedPhysicsType(
  type: GamePhysicsBodyType | undefined,
): type is CollisionActivatedPhysicsType {
  return type === 'noneToDynamicOnCollision'
    || type === 'solidNoneToDynamicOnCollision'
    || type === 'animNoneToDynamicOnCollision'
}

export function isAnimatedNoneActivatedPhysicsType(
  type: GamePhysicsBodyType | undefined,
): type is 'animNoneToDynamicOnCollision' {
  return type === 'animNoneToDynamicOnCollision'
}

export function isNoneActivatedPhysicsType(
  type: GamePhysicsBodyType | undefined,
): type is 'noneToDynamicOnCollision' {
  return type === 'noneToDynamicOnCollision'
}

export function isSolidNoneActivatedPhysicsType(
  type: GamePhysicsBodyType | undefined,
): type is 'solidNoneToDynamicOnCollision' {
  return type === 'solidNoneToDynamicOnCollision'
}

export function resolvePreCollisionBodyType(type: GamePhysicsBodyType): BasePhysicsBodyType {
  if (type === 'noneToDynamicOnCollision') return 'fixed'
  if (type === 'solidNoneToDynamicOnCollision') return 'fixed'
  if (type === 'animNoneToDynamicOnCollision') return 'fixed'
  return type
}
