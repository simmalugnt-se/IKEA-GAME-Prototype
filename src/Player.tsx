import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { RigidBody, BallCollider, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useRef, forwardRef, useImperativeHandle } from 'react'
import { SphereElement } from './SceneComponents'
import { SETTINGS, type Vec3 } from './GameSettings'

type ControlState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  jump: boolean
}
type ControlName = keyof ControlState

export type PlayerHandle = {
  getPosition: () => { x: number; y: number; z: number } | undefined
}

type PlayerProps = {
  position: Vec3
}

export const Player = forwardRef<PlayerHandle, PlayerProps>(function Player({ position }, ref) {
  const rb = useRef<RapierRigidBody | null>(null)
  const { rapier, world } = useRapier()
  const [, getKeys] = useKeyboardControls<ControlName>()

  // Exponera spelarens position till parent (CameraFollow)
  useImperativeHandle(ref, () => ({
    getPosition: () => rb.current?.translation(),
  }), [])

  // Beräkna densitet för att nå målmassan (Massa / Volym)
  // Volym för r=0.1 är ca 0.004188
  const targetDensity = SETTINGS.player.mass / 0.00418879

  useFrame((_state, delta) => {
    if (!rb.current) return

    const { forward, backward, left, right, jump } = getKeys()
    const strength = SETTINGS.player.impulseStrength * (delta * 60)

    rb.current.applyImpulse({
      x: (left ? -strength : 0) + (right ? strength : 0),
      y: 0,
      z: (forward ? -strength : 0) + (backward ? strength : 0),
    }, true)

    // Raycast för hopp
    const currentPos = rb.current.translation()
    const rayOrigin = { x: currentPos.x, y: currentPos.y - 0.105, z: currentPos.z }
    const rayDir = { x: 0, y: -1, z: 0 }
    const ray = new rapier.Ray(rayOrigin, rayDir)
    const hit = world.castRay(ray, 0.05, true)

    if (jump && hit) {
      rb.current.applyImpulse({ x: 0, y: SETTINGS.player.jumpStrength, z: 0 }, true)
    }
  })

  return (
    <RigidBody
      ref={rb}
      position={position}
      colliders={false}
      linearDamping={SETTINGS.player.linearDamping}
      angularDamping={SETTINGS.player.angularDamping}
      friction={SETTINGS.player.friction}
      // CCD stoppar bollen från att åka igenom objekt (Tunneling)
      ccd
    >
      <BallCollider args={[0.1]} density={targetDensity} />
      <SphereElement radius={0.1} color="five" />
    </RigidBody>
  )
})
