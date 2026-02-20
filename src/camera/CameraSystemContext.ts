import { createContext, useContext } from 'react'
import type { TargetPositionGetter, WorldPosition } from '@/scene/TargetAnchor'

export type CameraSystemContextValue = {
  setTargetPositionGetter: (targetId: string, getter: TargetPositionGetter | null) => void
  getStreamingCenter: () => WorldPosition | undefined
}

export const CameraSystemContext = createContext<CameraSystemContextValue | null>(null)

export function useCameraSystem(): CameraSystemContextValue {
  const value = useContext(CameraSystemContext)
  if (!value) {
    throw new Error('useCameraSystem must be used inside <CameraSystemProvider>.')
  }
  return value
}
