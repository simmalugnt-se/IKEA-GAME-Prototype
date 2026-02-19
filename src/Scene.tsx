import { useRef } from 'react'
import { Physics } from '@react-three/rapier'
import { Stats } from '@react-three/drei'
import { CubeElement } from './primitives/CubeElement'
import { CylinderElement } from './primitives/CylinderElement'
import { InvisibleFloor } from './primitives/InvisibleFloor'
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
import { MotionSystemProvider, TransformMotion } from './TransformMotion'
import { BlockElement } from './primitives/BlockElement'
import {
  GridCloner,
  LinearFieldEffector,
  NoiseEffector,
  RandomEffector,
  TimeEffector,
} from './GridCloner'

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
          <MotionSystemProvider>
            {/* SPELAREN */}
            <Player position={[0, 3, 0]} />

            {/* --- NIVÅN --- */}

            <TransformMotion positionVelocity={{ z: 0 }} positionRange={{ z: [0, -4] }}>
              <BlockElement ref={playerRef} hidden />
            </TransformMotion>

            <TransformMotion positionVelocity={{ z: 0.22 }} positionRange={{ z: [0, 4] }}>
              <BrickBalloon position={[-2, 1, -3]} animation="moving" materialColor1={8} materialColor0={8} />
            </TransformMotion>

            <TransformMotion positionVelocity={{ z: 0.2 }} positionRange={{ z: [0, 4] }}>
              <BallBalloon position={[.75, 1, -5]} animation="moving" materialColor1={6} materialColor0={6} />
            </TransformMotion>

            <TransformMotion positionVelocity={{ z: 0.2 }} positionRange={{ z: [0, 4] }}>
              <BallBalloon position={[0, 1, -4]} animation="moving" materialColor1={7} materialColor0={7} />
            </TransformMotion>

            <TransformMotion positionVelocity={{ z: 0.22 }} positionRange={{ z: [0, 4] }}>
              <BallBalloon position={[-1, 1, 0]} animation="moving2" materialColor1={5} materialColor0={5} />
            </TransformMotion>

            <TransformMotion positionVelocity={{ z: 0.25 }} positionRange={{ z: [0, 4] }}>
              <BrickBalloon position={[1.3, 1, 2]} animation="moving3" materialColor1={8} materialColor0={8} />
            </TransformMotion>

            <TransformMotion positionVelocity={{ z: 0.18 }} positionRange={{ z: [0, 4] }} >
              <BrickBalloon position={[1.5, 1, -1]} animation="moving" materialColor1={4} materialColor0={4} />
            </TransformMotion>

            {/* GRIDCLONER DEMOS */}
            {/* <GridCloner
              position={[-3.4, 0, 3.2]}
              count={[7, 1, 2]}
              spacing={[1, 0, 1]}
              gridUnit="md"
              centered
              physics="fixed"
              showDebugEffectors={isDebug}
            >
              <LinearFieldEffector
                axis="x"
                center={0}
                size={7}
                enableRemap
                contourMode="curve"
                contourCurve={[[0, 0], [0.25, 0.05], [0.65, 0.5], [1, 1]]}
                position={[0, 2.2, 0]}
              />
              <BlockElement sizePreset="md" heightPreset="sm" color={2} />
            </GridCloner>

            <GridCloner
              position={[0.2, 0, 3.2]}
              count={[7, 1, 2]}
              spacing={[1, 0, 1]}
              gridUnit="md"
              centered
              physics="fixed"
            >
              <RandomEffector
                seed={19}
                strength={0.8}
                position={[0, 0.65, 0]}
                rotation={[0, 0.35, 0]}
                scale={[0.1, 0.35, 0.1]}
                color={[2, 3, 4, 5]}
              />
              <NoiseEffector
                seed={42}
                strength={0.7}
                frequency={[0.9, 0.9, 0.9]}
                position={[0, 0.45, 0]}
              />
              <BlockElement sizePreset="sm" heightPreset="sm" color={1} />
            </GridCloner> */}

            <GridCloner
              position={[0, 1.5, 0]}
              count={[10, 2, 5]}
              spacing={[1.5, 2.1, 1.1]}
              gridUnit="md"
              centered
              physics="solidNoneToDynamicOnCollision"
            >

              {/* <TimeEffector
                loopMode="pingpong"
                duration={1}
                cloneOffset={0.1}
                easing="easeInOutCubic"
                position={[0, 3, 0]}
                // scale={[0, 0, 1]}
                rotation={[45, -45, 45]}
              // color={[2, 5]}
              /> */}
              <BlockElement sizePreset="sm" heightPreset="sm" color={4} align={{ x: 50, y: 50, z: 50 }} />
            </GridCloner>

            {/* <CubeElement
              size={[0.5, 2, 0.03]}
              color={2}
              physics="dynamic"
              position={[0.1, 0.5, 0.75]}
              rotation={[-61, 0, 0]}
              mass={0.3}
              friction={3}
            />

            <CubeElement
              size={[1.1, 0.48, 0.03]}
              color={1}
              physics="dynamic"
              position={[0.2, 0.24, 0.65]}
              mass={0.2}
              friction={0.5}
              lockRotations
            />

            <CubeElement
              size={[0.5, 1, 0.03]}
              color={1}
              physics="dynamic"
              position={[0.8, 0.5, 0]}
              mass={0.3}
            />

            <CylinderElement
              radius={0.3}
              height={0.2}
              color={1}
              physics="dynamic"
              position={[2, 0.5, 0]}
              rotation={[90, 0, 0]}
              colliderSegments={16}
            />

            <Laddertest
              position={[-1, 0, 2]}
              materialColor0={1}
              rotation={[0, Math.PI / -1.25, 0]}
            />

            <Laddertest position={[1.5, 0, 1.5]} materialColor0={1} />
            <VaultStairs position={[0, 0, 2.5]} materialColor0={1} />
            <VaultStairs position={[-.5, 0, -2.5]} rotation={[0, Math.PI / -1, 0]} materialColor0={1} />
            <Stair position={[1, 0, 2]} materialColor0={2} />
            <Stair position={[-2, 0, 0]} materialColor0={1} /> */}

            {/* DEBUG BENCHMARK + STREAMING */}
            <BenchmarkDebugContent />

            <InvisibleFloor />
          </MotionSystemProvider>
        </CameraSystemProvider>
      </Physics>

      {/* Debug: FPS / MS / MB overlay */}
      {isDebug && SETTINGS.debug.showStats && <Stats />}
    </GameKeyboardControls>
  )
}
