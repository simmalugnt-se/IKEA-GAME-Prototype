import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { RigidBody, BallCollider, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useRef, forwardRef, useImperativeHandle } from 'react'
import { SphereElement } from '@/primitives/SphereElement'
import type { GameControlName } from '@/input/GameKeyboardControls'
import { SETTINGS, type ControlInputSource, type Vec3 } from '@/settings/GameSettings'
import type { PositionTargetHandle } from '@/scene/PositionTargetHandle'
import { getExternalAbsoluteTarget, getExternalDigitalState, type DigitalControlState } from '@/input/control/ExternalControlStore'

export type PlayerHandle = PositionTargetHandle

type PlayerProps = {
  position: Vec3
}

const EMPTY_DIGITAL: DigitalControlState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
}

function mergeDigitalInput(
  source: ControlInputSource,
  keyboardState: DigitalControlState,
  externalState: DigitalControlState,
): DigitalControlState {
  if (source === 'external') return externalState
  if (source === 'keyboard') return keyboardState

  return {
    forward: keyboardState.forward || externalState.forward,
    backward: keyboardState.backward || externalState.backward,
    left: keyboardState.left || externalState.left,
    right: keyboardState.right || externalState.right,
    jump: keyboardState.jump || externalState.jump,
  }
}

export const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({ position }, ref) {
  const rb = useRef<RapierRigidBody | null>(null)
  const { rapier, world } = useRapier()
  const [, getKeys] = useKeyboardControls<GameControlName>()
  const smoothedAbsoluteTarget = useRef<{ x: number; z: number } | null>(null)

  const controlSettings = SETTINGS.controls
  const useAbsoluteControl = controlSettings.inputSource === 'external'
    && controlSettings.external.mode === 'absolute'

  // Exponera spelarens position till parent (CameraFollow)
  useImperativeHandle(ref, () => ({
    getPosition: () => rb.current?.translation(),
  }), [])

  // Beräkna densitet för att nå målmassan (Massa / Volym)
  // Volym för r=0.1 är ca 0.004188
  const targetDensity = SETTINGS.player.mass / 0.00418879

  useFrame((_state, delta) => {
    if (!rb.current) return

    const nowMs = Date.now()

    if (useAbsoluteControl) {
      const absoluteSettings = controlSettings.external.absolute
      const incomingTarget = getExternalAbsoluteTarget(nowMs, controlSettings.external.staleTimeoutMs)
      const currentPos = rb.current.translation()

      if (!incomingTarget) {
        rb.current.setNextKinematicTranslation({
          x: currentPos.x,
          y: currentPos.y,
          z: currentPos.z,
        })
        return
      }

      if (!smoothedAbsoluteTarget.current) {
        smoothedAbsoluteTarget.current = { x: currentPos.x, z: currentPos.z }
      }

      const currentSmoothed = smoothedAbsoluteTarget.current
      const deltaTargetX = incomingTarget.x - currentSmoothed.x
      const deltaTargetZ = incomingTarget.z - currentSmoothed.z
      const targetDistance = Math.hypot(deltaTargetX, deltaTargetZ)
      const clampedTarget = { x: incomingTarget.x, z: incomingTarget.z }

      if (targetDistance > absoluteSettings.maxTargetStep && absoluteSettings.maxTargetStep > 0) {
        const clampFactor = absoluteSettings.maxTargetStep / targetDistance
        clampedTarget.x = currentSmoothed.x + deltaTargetX * clampFactor
        clampedTarget.z = currentSmoothed.z + deltaTargetZ * clampFactor
      }

      const smoothingAlpha = 1 - Math.pow(1 - absoluteSettings.followLerp, delta * 60)
      currentSmoothed.x += (clampedTarget.x - currentSmoothed.x) * smoothingAlpha
      currentSmoothed.z += (clampedTarget.z - currentSmoothed.z) * smoothingAlpha

      const moveX = currentSmoothed.x - currentPos.x
      const moveZ = currentSmoothed.z - currentPos.z
      const moveDistance = Math.hypot(moveX, moveZ)
      const maxStep = absoluteSettings.maxUnitsPerSecond * delta

      let nextX = currentSmoothed.x
      let nextZ = currentSmoothed.z

      if (moveDistance > maxStep && maxStep > 0) {
        const stepFactor = maxStep / moveDistance
        nextX = currentPos.x + moveX * stepFactor
        nextZ = currentPos.z + moveZ * stepFactor
      }

      rb.current.setNextKinematicTranslation({
        x: nextX,
        y: currentPos.y,
        z: nextZ,
      })
      return
    }

    const keyboardState: DigitalControlState = getKeys()
    const externalState = controlSettings.external.mode === 'digital'
      ? getExternalDigitalState(nowMs, controlSettings.external.staleTimeoutMs)
      : EMPTY_DIGITAL
    const inputState = mergeDigitalInput(controlSettings.inputSource, keyboardState, externalState)

    const strength = SETTINGS.player.impulseStrength * (delta * 60)

    rb.current.applyImpulse({
      x: (inputState.left ? -strength : 0) + (inputState.right ? strength : 0),
      y: 0,
      z: (inputState.forward ? -strength : 0) + (inputState.backward ? strength : 0),
    }, true)

    // Raycast för hopp
    const currentPos = rb.current.translation()
    const rayOrigin = { x: currentPos.x, y: currentPos.y - 0.105, z: currentPos.z }
    const rayDir = { x: 0, y: -1, z: 0 }
    const ray = new rapier.Ray(rayOrigin, rayDir)
    const hit = world.castRay(ray, 0.05, true)

    if (inputState.jump && hit) {
      rb.current.applyImpulse({ x: 0, y: SETTINGS.player.jumpStrength, z: 0 }, true)
    }
  })

  return (
    <RigidBody
      ref={rb}
      type={useAbsoluteControl ? 'kinematicPosition' : 'dynamic'}
      position={position}
      colliders={false}
      linearDamping={SETTINGS.player.linearDamping}
      angularDamping={SETTINGS.player.angularDamping}
      friction={SETTINGS.player.friction}
      // CCD stoppar bollen från att åka igenom objekt (Tunneling)
      ccd
    >
      <BallCollider args={[0.1]} density={targetDensity} />
      <SphereElement radius={0.1} />
    </RigidBody>
  )
})
