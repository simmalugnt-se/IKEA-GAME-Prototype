import { useRef, useEffect } from 'react'
import { Physics } from '@react-three/rapier'
import { Stats } from '@react-three/drei'
import { InvisibleFloor } from './SceneComponents'
import { Player, type PlayerHandle } from './Player'
import { GameEffects } from './Effects'
import { CameraSystemProvider } from './CameraSystem'
import { BenchmarkDebugContent } from './debug/BenchmarkDebugContent'
import { GameKeyboardControls } from './GameKeyboardControls'
import { SETTINGS } from './GameSettings'
import { useSettingsVersion } from './settingsStore'
import { ExternalControlBridge } from './control/ExternalControlBridge'
import { LevelRenderer } from './LevelRenderer'
import { useLevelStore } from './levelStore'
import { MotionSystemProvider } from './TransformMotion'

export function Scene() {
  useSettingsVersion()
  const playerRef = useRef<PlayerHandle | null>(null)
  const isDebug = SETTINGS.debug.enabled
  const loadLevel = useLevelStore((state) => state.loadLevel)

  // Load level on mount
  useEffect(() => {
    loadLevel(SETTINGS.level.defaultFile)
  }, [loadLevel])

  return (
    <GameKeyboardControls>
      <ExternalControlBridge />
      <Physics gravity={[0, -9.81, 0]} debug={isDebug && SETTINGS.debug.showColliders}>
        <GameEffects />
        <CameraSystemProvider playerRef={playerRef}>
          <MotionSystemProvider>
            {/* SPELAREN */}
            <Player ref={playerRef} position={[0, 0.1, 0]} />

            {/* --- NIVÅN --- */}
            <LevelRenderer />

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
