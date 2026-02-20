import * as THREE from 'three'
import { useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { SETTINGS } from '@/settings/GameSettings'
import type { WorldPosition } from '@/scene/TargetAnchor'

// Återanvändbar vector (ingen allokering per frame)
const _cameraTarget = new THREE.Vector3()
const _lookAtTarget = new THREE.Vector3()
const _orientationCamera = new THREE.PerspectiveCamera()
const _orientationFrom = new THREE.Vector3()
const _orientationTo = new THREE.Vector3()

type CameraFollowProps = {
  getTargetPosition: (targetId: string) => WorldPosition | undefined
  cameraFocusRef: MutableRefObject<WorldPosition | null>
}

function writeLockedQuaternion(out: THREE.Quaternion) {
  const follow = SETTINGS.camera.follow
  _orientationFrom.set(...follow.offset)
  _orientationTo.set(...follow.lookAtOffset)

  if (_orientationFrom.distanceToSquared(_orientationTo) < 0.000001) {
    // Fallback: undvik ogiltig orientering om offset/lookAtOffset råkar vara samma punkt
    _orientationCamera.position.set(...SETTINGS.camera.static.position)
    _orientationCamera.lookAt(...SETTINGS.camera.static.lookAt)
  } else {
    _orientationCamera.position.copy(_orientationFrom)
    _orientationCamera.lookAt(_orientationTo)
  }

  out.copy(_orientationCamera.quaternion)
}

function updateFocusRef(cameraFocusRef: MutableRefObject<WorldPosition | null>, position: THREE.Vector3) {
  if (!cameraFocusRef.current) {
    cameraFocusRef.current = { x: position.x, y: position.y, z: position.z }
    return
  }

  cameraFocusRef.current.x = position.x
  cameraFocusRef.current.y = position.y
  cameraFocusRef.current.z = position.z
}

export function CameraFollow({ getTargetPosition, cameraFocusRef }: CameraFollowProps) {
  const { camera, scene } = useThree()
  const lightRef = useRef<THREE.DirectionalLight | null>(null)
  const initialized = useRef(false)
  const lockedQuaternion = useRef(new THREE.Quaternion())
  const lookAtCurrent = useRef(new THREE.Vector3(...SETTINGS.camera.static.lookAt))
  const previousMode = useRef<'static' | 'follow' | null>(null)
  const previousTargetId = useRef<string | null>(null)

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

    if (SETTINGS.camera.mode === 'static') {
      _cameraTarget.set(...SETTINGS.camera.static.position)
      _lookAtTarget.set(...SETTINGS.camera.static.lookAt)

      const modeChanged = previousMode.current !== 'static'
      if (!initialized.current || modeChanged) {
        camera.position.copy(_cameraTarget)
        lookAtCurrent.current.copy(_lookAtTarget)
        initialized.current = true
      } else {
        camera.position.copy(_cameraTarget)
        lookAtCurrent.current.copy(_lookAtTarget)
      }

      camera.lookAt(lookAtCurrent.current)
      updateFocusRef(cameraFocusRef, lookAtCurrent.current)
      previousMode.current = 'static'
      previousTargetId.current = null
      return
    }

    const followSettings = SETTINGS.camera.follow
    const staticSettings = SETTINGS.camera.static
    if (followSettings.lockRotation) {
      writeLockedQuaternion(lockedQuaternion.current)
    }
    const targetPos = getTargetPosition(followSettings.targetId)
      ?? {
        x: staticSettings.lookAt[0],
        y: staticSettings.lookAt[1],
        z: staticSettings.lookAt[2],
      }

    _cameraTarget.set(
      followSettings.followAxes.x ? targetPos.x + followSettings.offset[0] : staticSettings.position[0],
      followSettings.followAxes.y ? targetPos.y + followSettings.offset[1] : staticSettings.position[1],
      followSettings.followAxes.z ? targetPos.z + followSettings.offset[2] : staticSettings.position[2],
    )

    _lookAtTarget.set(
      followSettings.lookAtAxes.x ? targetPos.x + followSettings.lookAtOffset[0] : staticSettings.lookAt[0],
      followSettings.lookAtAxes.y ? targetPos.y + followSettings.lookAtOffset[1] : staticSettings.lookAt[1],
      followSettings.lookAtAxes.z ? targetPos.z + followSettings.lookAtOffset[2] : staticSettings.lookAt[2],
    )

    const modeChanged = previousMode.current !== 'follow'
    const targetChanged = previousTargetId.current !== followSettings.targetId

    if (!initialized.current || modeChanged || targetChanged) {
      camera.position.copy(_cameraTarget)
      lookAtCurrent.current.copy(_lookAtTarget)
      initialized.current = true
    } else {
      const positionLerp = 1 - Math.pow(1 - followSettings.followLerp, delta * 60)
      const lookAtLerp = 1 - Math.pow(1 - followSettings.lookAtLerp, delta * 60)
      camera.position.lerp(_cameraTarget, positionLerp)
      lookAtCurrent.current.lerp(_lookAtTarget, lookAtLerp)
    }

    if (followSettings.lockRotation) {
      camera.quaternion.copy(lockedQuaternion.current)
    } else {
      camera.lookAt(lookAtCurrent.current)
    }
    updateFocusRef(cameraFocusRef, lookAtCurrent.current)

    // Flytta DirectionalLight + shadow target med spelaren
    if (lightRef.current && followSettings.moveLightWithTarget) {
      const lightOffset = SETTINGS.light.position
      lightRef.current.position.set(
        targetPos.x + lightOffset[0],
        targetPos.y + lightOffset[1],
        targetPos.z + lightOffset[2],
      )
      lightRef.current.target.position.set(targetPos.x, targetPos.y, targetPos.z)
      lightRef.current.target.updateMatrixWorld()
    }

    previousMode.current = 'follow'
    previousTargetId.current = followSettings.targetId
  })

  return null
}
