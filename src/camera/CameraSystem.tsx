import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { CameraFollow } from '@/camera/CameraFollow'
import { SETTINGS } from '@/settings/GameSettings'
import type { PlayerHandle } from '@/scene/Player'
import type { TargetPositionGetter, WorldPosition } from '@/scene/TargetAnchor'
import { CameraSystemContext, type CameraSystemContextValue } from '@/camera/CameraSystemContext'

type CameraSystemProviderProps = {
  playerRef: RefObject<PlayerHandle | null>
  children: ReactNode
}

export function CameraSystemProvider({ playerRef, children }: CameraSystemProviderProps) {
  const cameraFocusRef = useRef<WorldPosition | null>(null)
  const targetGettersRef = useRef<Map<string, TargetPositionGetter>>(new Map())

  const setTargetPositionGetter = useCallback((targetId: string, getter: TargetPositionGetter | null) => {
    if (getter) {
      targetGettersRef.current.set(targetId, getter)
      return
    }
    targetGettersRef.current.delete(targetId)
  }, [])

  useEffect(() => {
    setTargetPositionGetter('player', () => playerRef.current?.getPosition())
    return () => setTargetPositionGetter('player', null)
  }, [playerRef, setTargetPositionGetter])

  const getTargetPosition = useCallback((targetId: string): WorldPosition | undefined => {
    const getter = targetGettersRef.current.get(targetId)
    return getter ? getter() : undefined
  }, [])

  const getStreamingCenter = useCallback((): WorldPosition | undefined => {
    if (SETTINGS.streaming.center.source === 'cameraFocus') {
      return cameraFocusRef.current ?? undefined
    }

    const targetCenter = getTargetPosition(SETTINGS.streaming.center.targetId)
    return targetCenter ?? cameraFocusRef.current ?? undefined
  }, [getTargetPosition])

  const contextValue = useMemo<CameraSystemContextValue>(() => ({
    setTargetPositionGetter,
    getStreamingCenter,
  }), [setTargetPositionGetter, getStreamingCenter])

  return (
    <CameraSystemContext.Provider value={contextValue}>
      <CameraFollow getTargetPosition={getTargetPosition} cameraFocusRef={cameraFocusRef} />
      {children}
    </CameraSystemContext.Provider>
  )
}
