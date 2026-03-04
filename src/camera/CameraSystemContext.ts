import { createContext, useContext, type RefObject } from 'react'
import type * as THREE from 'three'
import type { TargetPositionGetter, WorldPosition } from '@/scene/TargetAnchor'

export type CameraSystemContextValue = {
  setTargetPositionGetter: (targetId: string, getter: TargetPositionGetter | null) => void
  getTargetPosition: (targetId: string) => WorldPosition | undefined
  getStreamingCenter: () => WorldPosition | undefined
  getCameraFocus: () => WorldPosition | undefined
  directionalLightRef: RefObject<THREE.DirectionalLight | null>
}

export const CameraSystemContext = createContext<CameraSystemContextValue | null>(null)

export function useCameraSystem(): CameraSystemContextValue {
  const value = useContext(CameraSystemContext)
  if (!value) {
    throw new Error('useCameraSystem must be used inside <CameraSystemProvider>.')
  }
  return value
}
