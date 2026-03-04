import * as THREE from 'three'
import { useRef, type MutableRefObject, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { SETTINGS } from '@/settings/GameSettings'
import type { WorldPosition } from '@/scene/TargetAnchor'

const _cameraTarget = new THREE.Vector3()
const _lookAtTarget = new THREE.Vector3()
const _orientationCamera = new THREE.PerspectiveCamera()
const _orientationFrom = new THREE.Vector3()
const _orientationTo = new THREE.Vector3()

type CameraFollowProps = {
  getTargetPosition: (targetId: string) => WorldPosition | undefined
  cameraFocusRef: MutableRefObject<WorldPosition | null>
  directionalLightRef: RefObject<THREE.DirectionalLight | null>
}

function shouldClampCameraZ(
  zClampMode: 'always' | 'tilingOnly' | 'never',
  tilingEnabled: boolean,
): boolean {
  if (zClampMode === 'always') return true
  if (zClampMode === 'never') return false
  return tilingEnabled
}

function writeLockedQuaternion(out: THREE.Quaternion) {
  const follow = SETTINGS.camera.follow
  _orientationFrom.set(...follow.offset)
  _orientationTo.set(...follow.lookAtOffset)

  if (_orientationFrom.distanceToSquared(_orientationTo) < 0.000001) {
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

export function CameraFollow({ getTargetPosition, cameraFocusRef, directionalLightRef }: CameraFollowProps) {
  const { camera } = useThree()
  const initialized = useRef(false)
  const lockedQuaternion = useRef(new THREE.Quaternion())
  const lookAtCurrent = useRef(new THREE.Vector3(...SETTINGS.camera.static.lookAt))
  const previousMode = useRef<'static' | 'follow' | null>(null)
  const previousTargetId = useRef<string | null>(null)
  const minCameraZ = useRef(Infinity)
  const clampEnabledRef = useRef<boolean | null>(null)
  const warnedTilingBacktrackRiskRef = useRef(false)

  useFrame((_state, delta) => {
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
      clampEnabledRef.current = null
      minCameraZ.current = Infinity
      return
    }

    const followSettings = SETTINGS.camera.follow
    const staticSettings = SETTINGS.camera.static
    const tilingEnabled = SETTINGS.level.tiling.enabled
    const zClampMode = followSettings.zClampMode ?? 'tilingOnly'
    const shouldClampZ = shouldClampCameraZ(zClampMode, tilingEnabled)

    if (tilingEnabled && zClampMode === 'never' && !warnedTilingBacktrackRiskRef.current) {
      warnedTilingBacktrackRiskRef.current = true
      console.warn(
        '[CameraFollow] level tiling is enabled while camera.follow.zClampMode="never". Backtracking camera Z can create segment culling/spawn gaps.',
      )
    } else if (!(tilingEnabled && zClampMode === 'never')) {
      warnedTilingBacktrackRiskRef.current = false
    }

    if (clampEnabledRef.current !== shouldClampZ) {
      if (shouldClampZ) {
        // Transition off -> on: seed clamp from current camera position to avoid visual jumps.
        minCameraZ.current = camera.position.z
      } else {
        // Transition on -> off: fully release historical Z lock.
        minCameraZ.current = Infinity
      }
      clampEnabledRef.current = shouldClampZ
    }

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

    // No-backtracking clamp is policy-driven to keep camera/tiling coupling explicit.
    if (shouldClampZ) {
      _cameraTarget.z = Math.min(_cameraTarget.z, minCameraZ.current)
    }

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
    if (shouldClampZ) {
      minCameraZ.current = Math.min(minCameraZ.current, camera.position.z)
    }
    updateFocusRef(cameraFocusRef, lookAtCurrent.current)

    const light = directionalLightRef.current
    if (light && followSettings.moveLightWithTarget) {
      const lightOffset = SETTINGS.light.position
      const focus = lookAtCurrent.current
      light.position.set(
        focus.x + lightOffset[0],
        focus.y + lightOffset[1],
        focus.z + lightOffset[2],
      )
      light.target.position.set(focus.x, focus.y, focus.z)
      light.target.updateMatrixWorld()
    }

    previousMode.current = 'follow'
    previousTargetId.current = followSettings.targetId
  })

  return null
}
