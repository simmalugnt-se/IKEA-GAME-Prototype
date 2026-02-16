import * as THREE from 'three'
import { useRef } from 'react'
import { SETTINGS } from './GameSettings'

export function GameLights() {
  const lightRef = useRef<THREE.DirectionalLight | null>(null)
  const area = SETTINGS.light.shadowArea

  return (
    <group>
      <directionalLight
        ref={lightRef}
        position={SETTINGS.light.position}
        intensity={SETTINGS.light.intensity}
        castShadow
        shadow-mapSize={[SETTINGS.light.shadowMapSize, SETTINGS.light.shadowMapSize]}
        shadow-bias={SETTINGS.light.shadowBias}
        shadow-normalBias={SETTINGS.light.shadowNormalBias}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-area, area, area, -area]}
          near={0.1}
          far={100}
        />
      </directionalLight>
      <ambientLight intensity={0} />
    </group>
  )
}
