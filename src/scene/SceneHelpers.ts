import * as THREE from 'three'
import { useId, useMemo } from 'react'
import type { Vec3 } from '@/settings/GameSettings'

function hashToSurfaceHex(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  const hex = (hash >>> 0) & 0xffffff
  return hex === 0 ? 0x000001 : hex
}

export function useSurfaceId(): THREE.Color {
  const reactId = useId()
  return useMemo(() => new THREE.Color().setHex(hashToSurfaceHex(reactId)), [reactId])
}

export function toRadians(rotation: Vec3): Vec3 {
  return [
    rotation[0] * (Math.PI / 180),
    rotation[1] * (Math.PI / 180),
    rotation[2] * (Math.PI / 180),
  ]
}

