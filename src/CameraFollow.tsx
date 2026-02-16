import * as THREE from 'three'
import { useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { SETTINGS } from './GameSettings'
import type { PlayerHandle } from './Player'

// Återanvändbar vector (ingen allokering per frame)
const _cameraTarget = new THREE.Vector3()

type CameraFollowProps = {
  playerRef: RefObject<PlayerHandle | null>
}

export function CameraFollow({ playerRef }: CameraFollowProps) {
  const { camera, scene } = useThree()
  const lightRef = useRef<THREE.DirectionalLight | null>(null)
  const initialized = useRef(false)
  const offset = SETTINGS.camera.position // [5, 5, 5] isometrisk offset

  useFrame((_state, delta) => {
    // Hitta ljuset en gång
    if (!lightRef.current) {
      scene.traverse((obj) => {
        const light = obj as THREE.DirectionalLight
        if (light.isDirectionalLight && light.castShadow) {
          lightRef.current = light
        }
      })
    }

    if (!playerRef.current) return
    const pos = playerRef.current.getPosition()
    if (!pos) return

    // Kamerans mål = spelarens position + offset
    _cameraTarget.set(
      pos.x + offset[0],
      pos.y + offset[1],
      pos.z + offset[2],
    )

    if (!initialized.current) {
      // Första framen: snappa kameran direkt (inget lerp)
      camera.position.copy(_cameraTarget)
      camera.lookAt(pos.x, pos.y, pos.z)
      camera.updateProjectionMatrix()
      initialized.current = true
      return
    }

    // Delta-oberoende lerp: konsekvent drag oavsett framerate
    const lerp = 1 - Math.pow(1 - SETTINGS.camera.followLerp, delta * 60)
    camera.position.lerp(_cameraTarget, lerp)

    // Flytta DirectionalLight + shadow target med spelaren
    if (lightRef.current) {
      const lightOffset = SETTINGS.light.position
      lightRef.current.position.set(
        pos.x + lightOffset[0],
        pos.y + lightOffset[1],
        pos.z + lightOffset[2],
      )
      lightRef.current.target.position.set(pos.x, pos.y, pos.z)
      lightRef.current.target.updateMatrixWorld()
    }
  })

  return null
}
