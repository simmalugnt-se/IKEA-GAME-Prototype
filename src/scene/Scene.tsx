import { BalloonLifecycleRuntime } from "@/gameplay/BalloonLifecycleRuntime";
import { CameraSystemProvider } from "@/camera/CameraSystem";
import { GameMusicDirector } from "@/audio/GameMusicDirector";
import { ContagionRuntime } from "@/gameplay/ContagionRuntime";
import { GroundBallWaveRuntime } from "@/gameplay/GroundBallWaveRuntime";
import { TrackSweeperRuntime } from "@/gameplay/TrackSweeperRuntime";
import {
  getGameplayGravityY,
  getGameplayTimeScale,
  getGravityShiftBodyTuning,
  getGravityShiftContagionColorIndex,
  getGravityShiftActivationToken,
  useGameplayStore,
} from "@/gameplay/gameplayStore";
import { ItemSpawner } from "@/gameplay/ItemSpawner";
import { LevelTileManager } from "@/levels/LevelTileManager";
import { LiveLevelSync } from "@/LiveLevelSync";
import { ScoreboardBridge } from "@/scoreboard/ScoreboardBridge";
import { BlockElement } from "@/primitives/BlockElement";
import { CubeElement } from "@/primitives/CubeElement";
import { InvisibleFloor } from "@/primitives/InvisibleFloor";
import { GameEffects } from "@/render/Effects";
import { GameLights } from "@/render/Lights";
import type { PositionTargetHandle } from "@/scene/PositionTargetHandle";
import {
  MotionSystemProvider,
  TransformMotion,
} from "@/scene/TransformMotion";
import { GameRunClockRuntime } from "@/game/GameRunClock";
import { SETTINGS } from "@/settings/GameSettings";
import { useSettingsVersion } from "@/settings/settingsStore";
import { BalloonGroup } from "@/geometry/BalloonGroup";
import { ExternalCursorBridge } from "@/input/ExternalCursorBridge";
import { Stats } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as THREE from "three";
import { LevelRenderer } from "@/LevelRenderer";
import { applyEasing } from "@/utils/easing";

const IDLE_BALLOON_TARGET_POSITION: [number, number, number] = [.65, 1.3, .65];
const IDLE_BALLOON_ENTRY_SPEED_Z = 0.4;
const BASE_GRAVITY_Y = -9.81;

type GravityShiftBodyTuning = {
  startsAtMs: number;
  gravityY: number;
};

function randomRange(min: number, max: number): number {
  if (!(max > min)) return min;
  return min + Math.random() * (max - min);
}

function PhysicsRuntimeController({
  setPhysicsTimeStep,
}: {
  setPhysicsTimeStep: Dispatch<SetStateAction<number>>;
}) {
  const { world } = useRapier();
  const { camera } = useThree();
  const previousActivationTokenRef = useRef(0);
  const affectedBodyHandlesRef = useRef<Map<number, GravityShiftBodyTuning>>(new Map());
  const projectionScratchRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const nowMs = performance.now();
    const nextGravityY = getGameplayGravityY(nowMs);
    const activationToken = getGravityShiftActivationToken();
    const activationChanged = activationToken > 0 && activationToken !== previousActivationTokenRef.current;
    const activeGravityShift = Math.abs(nextGravityY - BASE_GRAVITY_Y) > 0.01;

    if (activationChanged) {
      previousActivationTokenRef.current = activationToken;
      affectedBodyHandlesRef.current.forEach((_, handle) => {
        world.getRigidBody(handle)?.setGravityScale(1, true);
      });
      affectedBodyHandlesRef.current.clear();

      const projectionScratch = projectionScratchRef.current;
      const contagionColorIndex = getGravityShiftContagionColorIndex();
      const bodyTuning = getGravityShiftBodyTuning();
      const queueGravityShiftContagionCarrier = useGameplayStore.getState().queueGravityShiftContagionCarrier;
      world.forEachRigidBody((body) => {
        if (!body.isDynamic()) return;
        const translation = body.translation();
        projectionScratch.set(translation.x, translation.y, translation.z).project(camera);
        const isInView = projectionScratch.z >= -1
          && projectionScratch.z <= 1
          && projectionScratch.x >= -1.15
          && projectionScratch.x <= 1.15
          && projectionScratch.y >= -1.15
          && projectionScratch.y <= 1.15;
        if (!isInView) return;
        affectedBodyHandlesRef.current.set(body.handle, {
          startsAtMs: nowMs + randomRange(bodyTuning.delayMinMs, bodyTuning.delayMaxMs),
          gravityY: randomRange(bodyTuning.gravityYMin, bodyTuning.gravityYMax),
        });
        if (contagionColorIndex !== null) {
          const userData = (body.userData ?? {}) as Record<string, unknown>;
          const entityId = typeof userData.entityId === 'string' ? userData.entityId : '';
          if (entityId) queueGravityShiftContagionCarrier(entityId, contagionColorIndex);
        }
        body.wakeUp();
      });
    }

    if (affectedBodyHandlesRef.current.size > 0) {
      const bodyTuning = getGravityShiftBodyTuning();
      const gravityDenominator = bodyTuning.targetGravityY - BASE_GRAVITY_Y;
      const effectBlend = activeGravityShift && Math.abs(gravityDenominator) > 0.0001
        ? Math.min(1, Math.max(0, (nextGravityY - BASE_GRAVITY_Y) / gravityDenominator))
        : 0;
      affectedBodyHandlesRef.current.forEach((bodyRuntime, handle) => {
        const body = world.getRigidBody(handle);
        if (!body) {
          affectedBodyHandlesRef.current.delete(handle);
          return;
        }
        if (!activeGravityShift) {
          body.setGravityScale(1, true);
          affectedBodyHandlesRef.current.delete(handle);
          return;
        }
        if (nowMs < bodyRuntime.startsAtMs) {
          body.setGravityScale(1, false);
          return;
        }

        const bodyGravityY = BASE_GRAVITY_Y + (bodyRuntime.gravityY - BASE_GRAVITY_Y) * effectBlend;
        body.setGravityScale(bodyGravityY / BASE_GRAVITY_Y, true);
      });
    }

    const nextPhysicsTimeStep = (1 / 60) * getGameplayTimeScale(nowMs);
    setPhysicsTimeStep((current) => (
      Math.abs(nextPhysicsTimeStep - current) > 0.0001 ? nextPhysicsTimeStep : current
    ));
  });

  return null;
}

export function Scene() {
  useSettingsVersion();
  const playerRef = useRef<PositionTargetHandle | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const spawnMarkerRef = useRef<PositionTargetHandle | null>(null);
  const cullMarkerRef = useRef<PositionTargetHandle | null>(null);
  const flowState = useGameplayStore((state) => state.flowState);
  const paused = useGameplayStore((state) => state.paused);
  const trackerTravelSpeedMultiplierRef = useRef(1);
  const trackerTravelEaseStartMsRef = useRef<number | null>(null);
  const previousFlowStateRef = useRef(flowState);
  const [idleBalloonVersion, setIdleBalloonVersion] = useState(0);
  const [physicsTimeStep, setPhysicsTimeStep] = useState(1 / 60);
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
    <>
      <GameMusicDirector />
      <LiveLevelSync />
      <ScoreboardBridge />
      <ExternalCursorBridge />
      <Physics
        gravity={[0, -9.81, 0]}
        timeStep={physicsTimeStep}
        paused={paused}
        debug={isDebug && SETTINGS.debug.showColliders}
      >
        <PhysicsRuntimeController setPhysicsTimeStep={setPhysicsTimeStep} />
        <GameRunClockRuntime />
        <ContagionRuntime />
        <GroundBallWaveRuntime />
        <TrackSweeperRuntime />
        <GameEffects />
        <GameLights lightRef={directionalLightRef} />
        <CameraSystemProvider
          playerRef={playerRef}
          directionalLightRef={directionalLightRef}
        >
          <MotionSystemProvider>
            <BalloonLifecycleRuntime>

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
                    randomizeColor={false}
                    randomizeDropType={false}
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
                <BalloonGroup
                  randomizeColor
                  randomizeDropType
                  flowRole="run_spawn"
                  position={[0, 2.3, 0]}
                />
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
      {isDebug && SETTINGS.debug.showStats && <Stats className="debug-stats" />}
    </>
  );
}
