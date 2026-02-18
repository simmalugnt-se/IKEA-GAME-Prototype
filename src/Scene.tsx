import { useRef } from 'react'
import { Physics } from '@react-three/rapier'
import { Stats } from '@react-three/drei'
import { CubeElement, CylinderElement, InvisibleFloor } from './SceneComponents'
import { Player, type PlayerHandle } from './Player'
import { GameEffects } from './Effects'
import { CameraSystemProvider } from './CameraSystem'
import { BenchmarkDebugContent } from './debug/BenchmarkDebugContent'
import { GameKeyboardControls } from './GameKeyboardControls'
import { SETTINGS } from './GameSettings'
import { useSettingsVersion } from './settingsStore'
import { Laddertest } from './assets/models/Laddertest'
import { VaultStairs } from './assets/models/VaultStairs'
import { Stair } from './assets/models/Stair'
import { ExternalControlBridge } from './control/ExternalControlBridge'
import { BrickBalloon } from './assets/models/BrickBalloon'
import { BallBalloon } from './assets/models/BallBalloon'

export function Scene() {
  useSettingsVersion()
  const playerRef = useRef<PlayerHandle | null>(null)
  const isDebug = SETTINGS.debug.enabled

  return (
    <GameKeyboardControls>
      <ExternalControlBridge />
      <Physics gravity={[0, -9.81, 0]} debug={isDebug && SETTINGS.debug.showColliders}>
        <GameEffects />
        <CameraSystemProvider playerRef={playerRef}>
          {/* SPELAREN */}
          <Player ref={playerRef} position={[0, 0.1, 0]} />

          {/* --- NIVÅN --- */}

          <BallBalloon position={[-1, .5, 0]} animation="moving" materialColor1={0} />
          <BrickBalloon position={[1.3, .5, 2]} animation="moving" />
          <BrickBalloon position={[1.5, .5, -1]} animation="moving" materialColor1={3} />

          {/* BLÅ RAMP */}
          <CubeElement
            size={[0.5, 2, 0.03]}
            color={1}
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
            lockRotations
          />

          <CubeElement
            size={[0.5, 1, 0.03]}
            physics="dynamic"
            position={[0.8, 0.5, 0]}
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

          {/* LADDTEST */}
          <Laddertest
            position={[-1, 0, 2]}
            rotation={[0, Math.PI / -1.25, 0]}
          />

          <Laddertest position={[1.5, 0, 1.5]} />

          {/* VÄLTEST */}
          <VaultStairs position={[0, 0, 2.5]} />
          <VaultStairs position={[-.5, 0, -2.5]} rotation={[0, Math.PI / -1, 0]} materialColor0={0} />

          <Stair position={[1, 0, 2]} materialColor0={1} />

          <Stair position={[-2, 0, 0]} materialColor0={0} />

          {/* DEBUG BENCHMARK + STREAMING */}
          <BenchmarkDebugContent />

          <InvisibleFloor />
        </CameraSystemProvider>
      </Physics>

      {/* Debug: FPS / MS / MB overlay */}
      {isDebug && SETTINGS.debug.showStats && <Stats />}
    </GameKeyboardControls>
  )
}
