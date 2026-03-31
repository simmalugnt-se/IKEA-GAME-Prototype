import { Children, cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react'
import {
  RigidBody,
  useRapier,
  type CollisionEnterPayload,
  type IntersectionEnterPayload,
  type RapierRigidBody,
  type RigidBodyProps,
} from '@react-three/rapier'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SETTINGS } from '@/settings/GameSettings'
import { useGameplayStore, type ContagionCollisionEntity, type ScreenPos } from '@/gameplay/gameplayStore'
import { useEntityRegistration, generateEntityId } from '@/entities/entityStore'
import {
  isCollisionActivatedPhysicsType,
  isNoneActivatedPhysicsType,
  isSolidNoneActivatedPhysicsType,
  resolvePreCollisionBodyType,
  type GamePhysicsBodyType,
} from './physicsTypes'

export type GameRigidBodyContagion = {
  entityId?: string
  carrier?: boolean
  infectable?: boolean
  colorIndex?: number
}

export type GameRigidBodyProps = Omit<RigidBodyProps, 'type' | 'onCollisionEnter' | 'onIntersectionEnter'> & {
  type: GamePhysicsBodyType
  onCollisionEnter?: (payload: CollisionEnterPayload) => void
  onIntersectionEnter?: (payload: IntersectionEnterPayload) => void
  onCollisionActivated?: (payload: CollisionEnterPayload | IntersectionEnterPayload) => void
  contagion?: GameRigidBodyContagion
}

type ActivationMotion = {
  linearVelocity?: { x: number; y: number; z: number }
  angularVelocity?: { x: number; y: number; z: number }
}

function isColliderElement(node: ReactNode): node is ReactElement<Record<string, unknown>> {
  if (!isValidElement(node)) return false
  const elementType = node.type as { displayName?: string; name?: string }
  const name = elementType.displayName ?? elementType.name ?? ''
  return typeof name === 'string' && name.toLowerCase().includes('collider')
}

function createAutoContagionEntityId(): string {
  return generateEntityId('contagion')
}

// User-facing mass values are authored in a larger range than Rapier additional mass.
// This keeps prior gameplay feel while allowing intuitive input values (e.g. 5 instead of 0.05).
const MASS_INPUT_SCALE = 0.01

const _projVec = new THREE.Vector3()

function projectToScreen(
  obj: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
): ScreenPos {
  obj.getWorldPosition(_projVec)
  _projVec.project(camera)
  return {
    x: (_projVec.x + 1) / 2 * width,
    y: (-_projVec.y + 1) / 2 * height,
  }
}

function resolveCollisionEntity(payload: CollisionEnterPayload, key: 'target' | 'other'): ContagionCollisionEntity | null {
  const collisionTarget = payload[key]
  const rawUserData = (collisionTarget.rigidBodyObject?.userData ?? {}) as Record<string, unknown>
  const entityId = typeof rawUserData.entityId === 'string' ? rawUserData.entityId : undefined
  if (!entityId) return null

  const colorIndex = typeof rawUserData.contagionColorIndex === 'number'
    ? rawUserData.contagionColorIndex
    : undefined

  return {
    entityId,
    contagionCarrier: rawUserData.contagionCarrier === true,
    contagionInfectable: rawUserData.contagionInfectable !== false,
    colorIndex,
  }
}

export function GameRigidBody({
  type,
  onCollisionEnter,
  onIntersectionEnter,
  onCollisionActivated,
  contagion,
  sensor: sensorOverride,
  children,
  userData,
  position,
  rotation,
  quaternion,
  scale,
  mass,
  ...props
}: GameRigidBodyProps) {
  const { rapier } = useRapier()
  const { camera, size } = useThree()
  const bodyRef = useRef<RapierRigidBody | null>(null)
  const collisionActivated = isCollisionActivatedPhysicsType(type)
  const noneActivated = isNoneActivatedPhysicsType(type)
  const solidNoneActivated = isSolidNoneActivatedPhysicsType(type)
  const [activated, setActivated] = useState(false)
  const [pendingActivationMotion, setPendingActivationMotion] = useState<ActivationMotion | null>(null)
  const enqueueContagionPair = useGameplayStore((state) => state.enqueueCollisionPair)
  const contagionEnabled = SETTINGS.gameplay.contagion.enabled
  const [autoContagionEntityId] = useState(createAutoContagionEntityId)
  const childArray = useMemo(() => Children.toArray(children), [children])
  const hasExplicitColliderChildren = useMemo(
    () => childArray.some((child) => isColliderElement(child)),
    [childArray],
  )
  const hasBodylessVariant = noneActivated || solidNoneActivated
  const canBodylessArm = hasBodylessVariant && hasExplicitColliderChildren
  const sensorPreCollision = noneActivated && !canBodylessArm

  const resolvedEntityId = useMemo(() => {
    if (!contagion) return undefined
    const explicitEntityId = typeof contagion.entityId === 'string'
      ? contagion.entityId.trim()
      : ''
    const baseUserData = (userData && typeof userData === 'object')
      ? userData as Record<string, unknown>
      : {}
    const baseEntityId = typeof baseUserData.entityId === 'string'
      ? baseUserData.entityId.trim()
      : ''
    return explicitEntityId || baseEntityId || autoContagionEntityId
  }, [contagion, userData, autoContagionEntityId])

  useEntityRegistration(resolvedEntityId, 'rigid_body')

  const mergedUserData = useMemo<Record<string, unknown>>(() => {
    const baseUserData = (userData && typeof userData === 'object')
      ? userData as Record<string, unknown>
      : {}
    const nextUserData: Record<string, unknown> = { ...baseUserData }

    if (contagion && resolvedEntityId) {
      nextUserData.entityId = resolvedEntityId
      nextUserData.contagionCarrier = contagion.carrier === true
      nextUserData.contagionInfectable = contagion.infectable !== false
      nextUserData.contagionColorIndex = contagion.colorIndex ?? 0
    }
    return nextUserData
  }, [userData, resolvedEntityId, contagion])

  const resolvedType = useMemo(
    () => (activated ? 'dynamic' : resolvePreCollisionBodyType(type)),
    [activated, type],
  )

  const setAttachedCollidersSensor = useCallback((isSensor: boolean) => {
    const body = bodyRef.current
    if (!body) return

    const colliderCount = body.numColliders()
    for (let i = 0; i < colliderCount; i += 1) {
      const collider = body.collider(i)
      if (!collider || !collider.isValid()) continue
      if (collider.isSensor() !== isSensor) {
        collider.setSensor(isSensor)
      }
    }
  }, [])

  const applyBodyType = useCallback((nextType: GamePhysicsBodyType | ReturnType<typeof resolvePreCollisionBodyType>) => {
    const body = bodyRef.current
    if (!body) return

    let targetType = rapier.RigidBodyType.Dynamic
    if (nextType === 'fixed') targetType = rapier.RigidBodyType.Fixed
    else if (nextType === 'kinematicPosition') targetType = rapier.RigidBodyType.KinematicPositionBased
    else if (nextType === 'kinematicVelocity') targetType = rapier.RigidBodyType.KinematicVelocityBased

    if (body.bodyType() !== targetType) {
      body.setBodyType(targetType, true)
    }
  }, [rapier.RigidBodyType.Dynamic, rapier.RigidBodyType.Fixed, rapier.RigidBodyType.KinematicPositionBased, rapier.RigidBodyType.KinematicVelocityBased])

  const applyAdditionalMass = useCallback((nextBody: RapierRigidBody | null) => {
    if (!nextBody) return
    if (!nextBody.isDynamic()) return
    if (mass === undefined || !Number.isFinite(mass)) {
      // Keep existing default behavior when mass is not provided.
      nextBody.setAdditionalMass(0, true)
      return
    }

    const additionalMass = Math.max(0, mass * MASS_INPUT_SCALE)
    nextBody.setAdditionalMass(additionalMass, true)
  }, [mass])

  const applyActivationMotion = useCallback((nextBody: RapierRigidBody | null, motion: ActivationMotion | null) => {
    if (!nextBody || !motion) return
    if (motion.linearVelocity) {
      nextBody.setLinvel(motion.linearVelocity, true)
    }
    if (motion.angularVelocity) {
      nextBody.setAngvel(motion.angularVelocity, true)
    }
  }, [])

  const setBodyRef = useCallback((nextBody: RapierRigidBody | null) => {
    bodyRef.current = nextBody
    applyAdditionalMass(nextBody)
  }, [applyAdditionalMass])

  const captureActivationMotion = useCallback((payload: CollisionEnterPayload | IntersectionEnterPayload): ActivationMotion | null => {
    const otherBody = payload.other.rigidBody
    if (!otherBody) {
      return null
    }

    const otherLinearVelocity = otherBody.linvel()
    const linearScale = 0.35

    return {
      linearVelocity: {
        x: otherLinearVelocity.x * linearScale,
        y: otherLinearVelocity.y * linearScale,
        z: otherLinearVelocity.z * linearScale,
      },
    }
  }, [])

  const wakeActivatedBody = useCallback(() => {
    const body = bodyRef.current
    if (!body) return
    applyActivationMotion(body, pendingActivationMotion)
    body.wakeUp()
  }, [applyActivationMotion, pendingActivationMotion])

  useEffect(() => {
    applyBodyType(resolvedType)
  }, [resolvedType, applyBodyType])

  useEffect(() => {
    applyAdditionalMass(bodyRef.current)
  }, [applyAdditionalMass])

  useEffect(() => {
    if (!sensorPreCollision) return
    setAttachedCollidersSensor(!activated)
  }, [sensorPreCollision, activated, setAttachedCollidersSensor])

  useEffect(() => {
    if (!activated) return
    wakeActivatedBody()
  }, [activated, wakeActivatedBody])

  const activate = useCallback((payload: CollisionEnterPayload | IntersectionEnterPayload) => {
    if (!collisionActivated || activated) return
    setPendingActivationMotion(captureActivationMotion(payload))
    setActivated(true)
    onCollisionActivated?.(payload)
  }, [collisionActivated, activated, onCollisionActivated, captureActivationMotion])

  const dispatchCollisionEnter = useCallback((payload: CollisionEnterPayload) => {
    if (contagionEnabled) {
      const targetEntity = resolveCollisionEntity(payload, 'target')
      const otherEntity = resolveCollisionEntity(payload, 'other')
      if (targetEntity) {
        const obj = payload.target.rigidBodyObject
        if (obj) targetEntity.screenPos = projectToScreen(obj, camera, size.width, size.height)
      }
      if (otherEntity) {
        const obj = payload.other.rigidBodyObject
        if (obj) otherEntity.screenPos = projectToScreen(obj, camera, size.width, size.height)
      }
      enqueueContagionPair(targetEntity, otherEntity)
    }
    onCollisionEnter?.(payload)
  }, [contagionEnabled, enqueueContagionPair, onCollisionEnter, camera, size.width, size.height])

  const handleCollisionEnter = useCallback((payload: CollisionEnterPayload) => {
    activate(payload)
    dispatchCollisionEnter(payload)
  }, [activate, dispatchCollisionEnter])

  const handleIntersectionEnter = useCallback((payload: IntersectionEnterPayload) => {
    if (sensorPreCollision) {
      activate(payload)
    }
    onIntersectionEnter?.(payload)
  }, [activate, onIntersectionEnter, sensorPreCollision])

  const bodylessChildren = useMemo(() => {
    if (!canBodylessArm || activated) return childArray

    return childArray.map((child) => {
      if (!isColliderElement(child)) return child
      const childProps = (child.props ?? {}) as Record<string, unknown>
      const childOnIntersectionEnter = childProps.onIntersectionEnter as ((payload: IntersectionEnterPayload) => void) | undefined
      const childOnCollisionEnter = childProps.onCollisionEnter as ((payload: CollisionEnterPayload) => void) | undefined

      return cloneElement(child, {
        sensor: noneActivated,
        onCollisionEnter: noneActivated
          ? undefined
          : (payload: CollisionEnterPayload) => {
            if (collisionActivated) {
              setPendingActivationMotion(captureActivationMotion(payload))
              setActivated(true)
              onCollisionActivated?.(payload)
            }
            dispatchCollisionEnter(payload)
            childOnCollisionEnter?.(payload)
          },
        onIntersectionEnter: noneActivated
          ? (payload: IntersectionEnterPayload) => {
            if (collisionActivated) {
              setPendingActivationMotion(captureActivationMotion(payload))
              setActivated(true)
              onCollisionActivated?.(payload)
            }
            onIntersectionEnter?.(payload)
            childOnIntersectionEnter?.(payload)
          }
          : childOnIntersectionEnter,
      })
    })
  }, [canBodylessArm, activated, childArray, onIntersectionEnter, dispatchCollisionEnter, noneActivated, collisionActivated, captureActivationMotion, onCollisionActivated])

  if (canBodylessArm && !activated) {
    return (
      <group
        {...(position !== undefined ? { position } : {})}
        {...(rotation !== undefined ? { rotation } : {})}
        {...(quaternion !== undefined ? { quaternion } : {})}
        {...(scale !== undefined ? { scale } : {})}
      >
        {bodylessChildren}
      </group>
    )
  }

  const sensor = sensorPreCollision ? !activated : sensorOverride

  return (
    <RigidBody
      ref={setBodyRef}
      {...props}
      {...(position !== undefined ? { position } : {})}
      {...(rotation !== undefined ? { rotation } : {})}
      {...(quaternion !== undefined ? { quaternion } : {})}
      {...(scale !== undefined ? { scale } : {})}
      userData={mergedUserData}
      sensor={sensor}
      onCollisionEnter={handleCollisionEnter}
      onIntersectionEnter={handleIntersectionEnter}
    >
      {children}
    </RigidBody>
  )
}
