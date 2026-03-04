import { BalloonLifecycleRuntime } from "@/gameplay/BalloonLifecycleRuntime";
import { CameraSystemProvider } from "@/camera/CameraSystem";
import { GameMusicDirector } from "@/audio/GameMusicDirector";
import { ContagionRuntime } from "@/gameplay/ContagionRuntime";
import { useGameplayStore } from "@/gameplay/gameplayStore";
import { ItemSpawner } from "@/gameplay/ItemSpawner";
import { ExternalControlBridge } from "@/input/control/ExternalControlBridge";
import { GameKeyboardControls } from "@/input/GameKeyboardControls";
import { LevelTileManager } from "@/levels/LevelTileManager";
import { LiveLevelSync } from "@/LiveLevelSync";
import { ScoreboardBridge } from "@/scoreboard/ScoreboardBridge";
import { BlockElement } from "@/primitives/BlockElement";
import { CubeElement } from "@/primitives/CubeElement";
import { InvisibleFloor } from "@/primitives/InvisibleFloor";
import { GameEffects } from "@/render/Effects";
import { GameLights } from "@/render/Lights";
import { type PlayerHandle } from "@/scene/Player";
import type { PositionTargetHandle } from "@/scene/PositionTargetHandle";
import {
  MotionSystemProvider,
  TransformMotion,
} from "@/scene/TransformMotion";
import { GameRunClockRuntime } from "@/game/GameRunClock";
import { SETTINGS } from "@/settings/GameSettings";
import { useSettingsVersion } from "@/settings/settingsStore";
import { BalloonGroup } from "@/geometry/BalloonGroup";
import { Stats } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LevelRenderer } from "@/LevelRenderer";
import { applyEasing } from "@/utils/easing";

const IDLE_BALLOON_TARGET_POSITION: [number, number, number] = [1, 1.3, 1];
const IDLE_BALLOON_ENTRY_SPEED_Z = 0.4;

export function Scene() {
  useSettingsVersion();
  const playerRef = useRef<PlayerHandle | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const spawnMarkerRef = useRef<PositionTargetHandle | null>(null);
  const cullMarkerRef = useRef<PositionTargetHandle | null>(null);
  const flowState = useGameplayStore((state) => state.flowState);
  const trackerTravelSpeedMultiplierRef = useRef(1);
  const trackerTravelEaseStartMsRef = useRef<number | null>(null);
  const previousFlowStateRef = useRef(flowState);
  const [idleBalloonVersion, setIdleBalloonVersion] = useState(0);
  const isDebug = SETTINGS.debug.enabled;
  const bootstrapIdle = useGameplayStore((state) => state.bootstrapIdle);

  useEffect(() => {
    bootstrapIdle();
  }, [bootstrapIdle]);

  const handleIdleBalloonMissed = useCallback(() => {
    if (useGameplayStore.getState().flowState !== "idle") return;
    setIdleBalloonVersion((v) => v + 1);
  }, []);

  // Calculate the diagonal of the viewport to ensure the floor covers the entire screen
  const { viewport } = useThree();
  const diaginalRadiusOffset = -0.5;
  const diagonalRadius =
    Math.hypot(viewport.height, viewport.width) / 2 + diaginalRadiusOffset;
  const idleBalloonStartOffsetZ = useMemo(() => {
    const spawnMarkerLocalZ = -diagonalRadius;
    const idleTargetLocalZ = IDLE_BALLOON_TARGET_POSITION[2];
    return spawnMarkerLocalZ - idleTargetLocalZ;
  }, [diagonalRadius]);
  useFrame(() => {
    const nowMs = performance.now();
    const previousFlowState = previousFlowStateRef.current;
    const enteringGameOverTravel =
      flowState === "game_over_travel" && previousFlowState !== "game_over_travel";

    if (enteringGameOverTravel) {
      trackerTravelEaseStartMsRef.current = nowMs;
    } else if (
      flowState !== "game_over_travel" &&
      previousFlowState === "game_over_travel"
    ) {
      trackerTravelEaseStartMsRef.current = null;
    }
    previousFlowStateRef.current = flowState;

    if (flowState !== "game_over_travel") {
      trackerTravelSpeedMultiplierRef.current = 1;
      return;
    }

    const targetMultiplier = Math.max(
      0,
      SETTINGS.gameplay.flow.gameOverTravelSpeedMultiplier
    );
    const easeDurationMs = Math.max(
      0,
      SETTINGS.gameplay.flow.gameOverTravelSpeedEaseInMs
    );
    const easeName = SETTINGS.gameplay.flow.gameOverTravelSpeedEaseInEasing;

    if (easeDurationMs <= 0) {
      trackerTravelSpeedMultiplierRef.current = targetMultiplier;
      return;
    }

    const easeStartMs = trackerTravelEaseStartMsRef.current ?? nowMs;
    trackerTravelEaseStartMsRef.current = easeStartMs;
    const progress = Math.min(1, Math.max(0, (nowMs - easeStartMs) / easeDurationMs));
    const easedProgress = applyEasing(progress, easeName);
    trackerTravelSpeedMultiplierRef.current =
      1 + (targetMultiplier - 1) * easedProgress;
  });

  return (
    <GameKeyboardControls>
      <GameMusicDirector />
      <ExternalControlBridge />
      <LiveLevelSync />
      <ScoreboardBridge />
      <Physics
        gravity={[0, -9.81, 0]}
        debug={isDebug && SETTINGS.debug.showColliders}
      >
        <GameRunClockRuntime />
        <ContagionRuntime />
        <GameEffects />
        <GameLights lightRef={directionalLightRef} />
        <CameraSystemProvider
          playerRef={playerRef}
          directionalLightRef={directionalLightRef}
        >
          <MotionSystemProvider>
            <BalloonLifecycleRuntime>
              {/* SPELAREN */}
              {/* <Player
                contagionCarrier
                contagionColor={8}
                position={[-1.4, 0.4, 0.4]}
              /> */}

              {/* CAMERA TRACKER */}

              <TransformMotion
                paused={flowState === "game_over_input"}
                positionVelocity={{ z: -0.5 }}
                runtimeTimeScaleMultiplierRef={trackerTravelSpeedMultiplierRef}
                timeScaleAcceleration={SETTINGS.motionAcceleration.cameraTracker.timeScaleAcceleration}
                timeScaleAccelerationCurve={SETTINGS.motionAcceleration.cameraTracker.timeScaleAccelerationCurve}
              >
                {/* Spawn marker */}
                <CubeElement
                  ref={spawnMarkerRef}
                  position={[0, 0.0125, -diagonalRadius]}
                  size={[5, 0.025, 0.025]}
                  hidden
                />
                {/* Cull marker */}
                <CubeElement
                  ref={cullMarkerRef}
                  position={[0, 0.0125, diagonalRadius]}
                  size={[5, 0.025, 0.025]}
                  hidden
                />
                <BlockElement ref={playerRef} hidden />
                {flowState === "idle" ? (
                  <BalloonGroup
                    key={`idle-balloon-${idleBalloonVersion}`}
                    flowRole="idle_start"
                    color={8}
                    randomize={false}
                    dropType="ball"
                    position={IDLE_BALLOON_TARGET_POSITION}
                    positionVelocity={{ z: IDLE_BALLOON_ENTRY_SPEED_Z }}
                    positionRange={{ z: [idleBalloonStartOffsetZ, 0.325] }}
                    positionRangeStart={{ z: 0 }}
                    positionEasing={{ z: "easeOutExpo" }}
                    positionLoopMode={{ z: "none" }}
                    onMissed={handleIdleBalloonMissed}
                  />
                ) : null}
              </TransformMotion>

              {/* ENDLESS TILED LEVELS */}
              <LevelTileManager />

              {/* ITEM SPAWNER */}
              <ItemSpawner
                spawnMarkerRef={spawnMarkerRef}
                cullMarkerRef={cullMarkerRef}
              >
                <BalloonGroup randomize flowRole="run_spawn" position={[0, 2.3, 0]} />
              </ItemSpawner>



              {/* LEVEL FROM STORE (file or live sync) */}
              {!SETTINGS.level.tiling.enabled ? <LevelRenderer /> : null}

              {/* DEBUG BENCHMARK + STREAMING */}
              {/* <BenchmarkDebugContent />
              {(isDebug && SETTINGS.debug.showCameraFrustum) ||
                (isDebug && SETTINGS.debug.showDebugCamera) ? (
                <CameraFrustumOverlay />
              ) : null}
              {isDebug && SETTINGS.debug.showDebugCamera && <DebugCameraPiP />} */}

              <InvisibleFloor />
            </BalloonLifecycleRuntime>
          </MotionSystemProvider>
        </CameraSystemProvider>
      </Physics>

      {/* Debug: FPS / MS / MB overlay */}
      {isDebug && SETTINGS.debug.showStats && <Stats />}
    </GameKeyboardControls>
  );
}
