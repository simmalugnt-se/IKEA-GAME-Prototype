import * as THREE from 'three'
import { useEffect, useRef, type ReactNode } from 'react'
import type { ThreeElements } from '@react-three/fiber'
import { useCameraSystem } from '@/camera/CameraSystemContext'

export type WorldPosition = {
  x: number
  y: number
  z: number
}

export type TargetPositionGetter = () => WorldPosition | undefined

type TargetAnchorProps = ThreeElements['group'] & {
  targetId: string
  children: ReactNode
}

export function TargetAnchor({
  targetId,
  children,
  ...groupProps
}: TargetAnchorProps) {
  const { setTargetPositionGetter } = useCameraSystem()
  const groupRef = useRef<THREE.Group | null>(null)

  useEffect(() => {
    const worldPos = new THREE.Vector3()
    const getPosition: TargetPositionGetter = () => {
      if (!groupRef.current) return undefined
      groupRef.current.getWorldPosition(worldPos)
      return { x: worldPos.x, y: worldPos.y, z: worldPos.z }
    }

    setTargetPositionGetter(targetId, getPosition)
    return () => setTargetPositionGetter(targetId, null)
  }, [targetId, setTargetPositionGetter])

  return (
    <group ref={groupRef} {...groupProps}>
      {children}
    </group>
  )
}
