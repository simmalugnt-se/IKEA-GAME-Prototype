import React, { useRef, useState } from 'react'
import { Physics } from '@react-three/rapier'
import { KeyboardControls, Stats } from '@react-three/drei'
import { CubeElement, CylinderElement, SplineElement, InvisibleFloor } from './SceneComponents'
import { Player } from './Player'
import { Testgeo } from './assets/models/testgeo'
import { SplineAndAnimTest } from './assets/models/SplineAndAnimTest'
import { GameEffects } from './Effects'
import { CameraFollow } from './CameraFollow'
import { SETTINGS } from './GameSettings'

const keyboardMap = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'right', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
]

const isDebug = SETTINGS.debug.enabled

export function Scene() {
  const playerRef = useRef()
  const [testAnim, setTestAnim] = useState(null)

  return (
    <KeyboardControls map={keyboardMap}>
      <Physics gravity={[0, -9.81, 0]} debug={isDebug && SETTINGS.debug.showColliders}>

        <GameEffects />
        <CameraFollow playerRef={playerRef} />

        {/* SPELAREN */}
        <Player ref={playerRef} position={[0.1, 0.27, 1.3]} />

        {/* --- NIVÅN --- */}

        {/* BLÅ RAMP */}
        <CubeElement
          size={[0.5, 2, 0.03]}
          color='two'
          physics="dynamic"
          position={[0.1, 0.5, 0.75]}
          rotation={[-61, 0, 0]}
          mass={0.3}
          friction={3}
        />

        {/* VINRÖDA ELEMENT */}
        <CubeElement
          size={[1.1, 0.48, 0.03]}
          physics="dynamic"
          position={[0.2, 0.24, 0.65]}
          mass={0.2}
          friction={0.5}
          lockRotations={true}
        />

        <CubeElement
          size={[0.5, 1, 0.03]}
          physics="dynamic"
          position={[0.8, 0, 0]}
          mass={0.3}
        />

        {/* CYLINDER */}
        <CylinderElement
          radius={0.3}
          height={0.2}
          physics="dynamic"
          position={[2, 0.5, 0]}
          rotation={[90, 0, 0]}
          colliderSegments={16}
        />

        <SplineElement
          points={[
            [-1, 0.2, -0.5],
            [-0.3, 0.5, 0],
            [0.5, 0.15, 0.3],
            [1.3, 0.4, -0.2],
          ]}
          position={[.5, .5, 1]}
          segments={40}
          physics="dynamic"
          friction={1}
        />

        {/* C4D EXPORT TEST */}
        <Testgeo position={[0.5, 1, 0]} />

        {/* FBX PIPELINE TEST */}
        <SplineAndAnimTest position={[0, 2, -3]} scale={0.01} animation={testAnim} />

        <InvisibleFloor />
      </Physics>

      {/* Debug: FPS / MS / MB overlay */}
      {isDebug && SETTINGS.debug.showStats && <Stats />}
    </KeyboardControls>
  )
}