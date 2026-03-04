import { Balloon12 } from "@/assets/models/Balloon12";
import { Balloon16 } from "@/assets/models/Balloon16";
import { Balloon20 } from "@/assets/models/Balloon20";
import { Balloon24 } from "@/assets/models/Balloon24";
import { Balloon28 } from "@/assets/models/Balloon28";
import { Balloon32 } from "@/assets/models/Balloon32";
import { playGameSound } from "@/audio/GameAudioRouter";
import {
  useBalloonLifecycleRegistry,
  type BalloonLifecyclePopMeta,
} from "@/gameplay/BalloonLifecycleRuntime";
import { useGameplayStore } from "@/gameplay/gameplayStore";
import { BlockElement } from "@/primitives/BlockElement";
import { BallElement, BALL_RADII_M } from "@/primitives/BallElement";
import { SplineElement } from "@/primitives/SplineElement";
import type { PositionTargetHandle } from "@/scene/PositionTargetHandle";
import {
  TransformMotion,
  type TransformMotionHandle,
} from "@/scene/TransformMotion";
import {
  SETTINGS,
  getActivePalette,
  type MaterialColorIndex,
  type Vec3,
} from "@/settings/GameSettings";
import { useFrame, useThree, type ThreeElements } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type BalloonDetailLevel =
  | "ultra"
  | "high"
  | "medium"
  | "low"
  | "veryLow"
  | "minimal";

type BalloonDropType = "block" | "ball";
type BalloonFlowRole = "idle_start" | "run_spawn";

export type BalloonPopReleaseTuning = {
  linearSpeedMin?: number;
  linearSpeedMax?: number;
  linearSpeedVelocityRangeMaxPx?: number;
  angularScale?: number;
  spinBoost?: number;
  linearDamping?: number;
  angularDamping?: number;
};

const POP_RELEASE_CURVE_NAMES = [
  "power_1_25",
  "power_1_5",
  "exponential",
] as const;
type PopReleaseCurveName = (typeof POP_RELEASE_CURVE_NAMES)[number];
const POP_RELEASE_DEFAULT_CURVE: PopReleaseCurveName = "power_1_5";
const POP_RELEASE_EXPONENTIAL_K = 3;
const POP_RELEASE_EXPONENTIAL_DENOM =
  Math.exp(POP_RELEASE_EXPONENTIAL_K) - 1;
const POP_RELEASE_SOFT_SAT = 0.9;

type ResolvedBalloonPopReleaseTuning = {
  linearSpeedMin: number;
  linearSpeedMax: number;
  linearSpeedVelocityRangeMaxPx: number;
  curve: PopReleaseCurveName;
  angularScale: number;
  spinBoost: number;
  linearDamping: number;
  angularDamping: number;
};

type BalloonGroupProps = Omit<ThreeElements["group"], "ref"> & {
  detailLevel?: BalloonDetailLevel;
  color?: MaterialColorIndex;
  randomize?: boolean;
  /** Payload type when `randomize` is false. `randomize=true` overrides this to random block/ball per instance. */
  dropType?: BalloonDropType;
  paused?: boolean;
  onPopped?: () => void;
  onMissed?: () => void;
  onCleanupRequested?: () => void;
  /** Called once on mount; the provided getter returns the item's current world Z. Returns an unregister function. */
  onRegisterCullZ?: (getter: () => number | undefined) => () => void;
  popReleaseTuning?: BalloonPopReleaseTuning;
  flowRole?: BalloonFlowRole;
};

const BALLOONS = {
  ultra: Balloon32,
  high: Balloon28,
  medium: Balloon24,
  low: Balloon20,
  veryLow: Balloon16,
  minimal: Balloon12,
};

// Centrala BalloonGroup-inställningar: håll all gameplay-tuning här.
const BALLOON_GROUP_SETTINGS = {
  randomize: {
    excludedColorIndices: [0, 1, 2, 3] as number[],
    positionVelocityZBase: 0.5,
    positionVelocityZAmplitude: 0.2,
    rotationOffsetBase: 0,
    rotationOffsetAmplitude: 2.0,
  },
  motion: {
    positionVelocityZ: 0.2,
    rotationVelocity: { x: 13.3333, y: 26.3333, z: 13.3333 },
    rotationEasing: {
      x: "easeInOutSine" as const,
      y: "linear" as const,
      z: "easeInOutSine" as const,
    },
    rotationLoopMode: {
      x: "pingpong" as const,
      y: "loop" as const,
      z: "pingpong" as const,
    },
    rotationRange: {
      x: [-10, 10] as [number, number],
      y: [0, 360] as [number, number],
      z: [-10, 10] as [number, number],
    },
    rotationRangeStart: { x: 0, y: 0, z: 0.5 },
  },
  popRelease: {
    fallbackAngularVelocity: [0.2327, 0.4596, 0.2327] as Vec3,
    defaultTuning: {
      angularScale: 10,
      spinBoost: 0.18,
      linearDamping: 0.45,
      angularDamping: 1.0,
    } as ResolvedBalloonPopReleaseTuning,
  },
  popHit: {
    localCenter: [0, 0.130, 0] as Vec3,
    radiusX: 0.1,
    radiusY: 0.13,
  },
  payload: {
    block: {
      position: [0, -0.3, 0] as Vec3,
      sizePreset: "sm" as const,
      heightPreset: "sm" as const,
      plane: "z" as const,
      align: { x: 50, y: 100, z: 50 },
      mass: 100,
    },
    ball: {
      position: [0, -0.3, 0] as Vec3,
      sizePreset: "md" as const,
      align: { x: 50, y: 100, z: 50 },
      mass: 100,
      friction: 0,
      restitution: 1,
    },
  },
  wrap: {
    block: {
      width: 0.05,
      depth: 0.2,
      blockHeight: 0.1,
      y: -0.3,
      offset: 0.0025,
    },
    ball: {
      offset: 0.0025,
      segments: 24,
    },
  },
};

const VECTOR_EPSILON = 1e-6;
const BLOCK_WRAP_SIDE_X =
  BALLOON_GROUP_SETTINGS.wrap.block.width / 2 +
  BALLOON_GROUP_SETTINGS.wrap.block.offset;
const BLOCK_WRAP_SIDE_Z =
  BALLOON_GROUP_SETTINGS.wrap.block.depth / 2 +
  BALLOON_GROUP_SETTINGS.wrap.block.offset;
const BLOCK_WRAP_TOP_Y =
  BALLOON_GROUP_SETTINGS.wrap.block.y + BALLOON_GROUP_SETTINGS.wrap.block.offset;
const BLOCK_WRAP_BOTTOM_Y =
  BALLOON_GROUP_SETTINGS.wrap.block.y -
  BALLOON_GROUP_SETTINGS.wrap.block.blockHeight -
  BALLOON_GROUP_SETTINGS.wrap.block.offset;

// Manual values keep wrap generation fast and isolated to BalloonGroup.
const BLOCK_WRAP_POINTS: [number, number, number][] = [
  [0, BLOCK_WRAP_TOP_Y, 0],
  [BLOCK_WRAP_SIDE_X, BLOCK_WRAP_TOP_Y, 0],
  [BLOCK_WRAP_SIDE_X, BLOCK_WRAP_BOTTOM_Y, 0],
  [-BLOCK_WRAP_SIDE_X, BLOCK_WRAP_BOTTOM_Y, 0],
  [-BLOCK_WRAP_SIDE_X, BLOCK_WRAP_TOP_Y, 0],
  [0, BLOCK_WRAP_TOP_Y, 0],
  [0, BLOCK_WRAP_TOP_Y, BLOCK_WRAP_SIDE_Z],
  [0, BLOCK_WRAP_BOTTOM_Y, BLOCK_WRAP_SIDE_Z],
  [0, BLOCK_WRAP_BOTTOM_Y, -BLOCK_WRAP_SIDE_Z],
  [0, BLOCK_WRAP_TOP_Y, -BLOCK_WRAP_SIDE_Z],
  [0, BLOCK_WRAP_TOP_Y, 0],
];

function createVerticalCircleLoopPoints(
  axis: "x" | "z",
  radius: number,
  centerY: number,
  segments: number,
): [number, number, number][] {
  const safeSegments = Math.max(8, Math.floor(segments));
  const points: [number, number, number][] = [];

  // Start at top pole to match block wrap topology (top -> around -> top).
  for (let i = 0; i <= safeSegments; i += 1) {
    const angle = Math.PI / 2 - (i / safeSegments) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (axis === "x") {
      points.push([c * radius, centerY + s * radius, 0]);
    } else {
      points.push([0, centerY + s * radius, c * radius]);
    }
  }

  return points;
}

function createCrossedCircleWrapPoints(
  radius: number,
  centerY: number,
  segments: number,
): [number, number, number][] {
  const loopX = createVerticalCircleLoopPoints("x", radius, centerY, segments);
  const loopZ = createVerticalCircleLoopPoints("z", radius, centerY, segments);
  const top = loopX[0] ?? [0, centerY + radius, 0];

  // One single spline path: loop X then loop Z, both crossing at same top point.
  return [top, ...loopX.slice(1), top, ...loopZ.slice(1)];
}

const BALL_PAYLOAD_RADIUS =
  BALL_RADII_M[BALLOON_GROUP_SETTINGS.payload.ball.sizePreset];
const BALL_WRAP_RADIUS =
  BALL_PAYLOAD_RADIUS + BALLOON_GROUP_SETTINGS.wrap.ball.offset;
const BALL_WRAP_CENTER_Y =
  BALLOON_GROUP_SETTINGS.payload.ball.position[1] - BALL_PAYLOAD_RADIUS;
const BALL_WRAP_TOP_Y = BALL_WRAP_CENTER_Y + BALL_WRAP_RADIUS;
const BALL_WRAP_POINTS = createCrossedCircleWrapPoints(
  BALL_WRAP_RADIUS,
  BALL_WRAP_CENTER_Y,
  BALLOON_GROUP_SETTINGS.wrap.ball.segments,
);
const POP_HIT_LOCAL_CENTER = BALLOON_GROUP_SETTINGS.popHit.localCenter;
const POP_HIT_RADIUS_X = BALLOON_GROUP_SETTINGS.popHit.radiusX;
const POP_HIT_RADIUS_Y = BALLOON_GROUP_SETTINGS.popHit.radiusY;
const POP_HIT_DEBUG_GEOMETRY = new THREE.SphereGeometry(1, 12, 8);
const POP_HIT_DEBUG_MATERIAL = new THREE.MeshBasicMaterial({
  color: "#facc15",
  wireframe: true,
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
});

type PopRelease = {
  linearVelocity: Vec3;
  angularVelocity: Vec3;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveClampedNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function scaleVec3(value: Vec3, scalar: number): Vec3 {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function normalizeVec3(value: Vec3): Vec3 | null {
  const length = Math.sqrt(
    value[0] * value[0] + value[1] * value[1] + value[2] * value[2],
  );
  if (length <= VECTOR_EPSILON) return null;

  const invLength = 1 / length;
  return [value[0] * invLength, value[1] * invLength, value[2] * invLength];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolvePopReleaseCurve(value: string | undefined): PopReleaseCurveName {
  if (typeof value === "string"
    && (POP_RELEASE_CURVE_NAMES as readonly string[]).includes(value)) {
    return value as PopReleaseCurveName;
  }
  return POP_RELEASE_DEFAULT_CURVE;
}

function resolvePopReleaseSpeedFactor(
  rawNormalized: number,
  curve: PopReleaseCurveName,
): number {
  const raw = Math.max(0, rawNormalized);
  let base = raw;
  switch (curve) {
    case "power_1_25":
      base = Math.pow(raw, 1.25);
      break;
    case "power_1_5":
      base = Math.pow(raw, 1.5);
      break;
    case "exponential":
      base = (Math.exp(POP_RELEASE_EXPONENTIAL_K * raw) - 1)
        / POP_RELEASE_EXPONENTIAL_DENOM;
      break;
    default:
      break;
  }

  if (base <= 1) return base;
  const excess = base - 1;
  return 1 + excess / (1 + POP_RELEASE_SOFT_SAT * excess);
}

const FALLBACK_ANGULAR_DIRECTION: Vec3 = normalizeVec3(
  BALLOON_GROUP_SETTINGS.popRelease.fallbackAngularVelocity,
) ?? [0, 1, 0];

function resolvePopReleaseTuning(
  input: BalloonPopReleaseTuning | undefined,
): ResolvedBalloonPopReleaseTuning {
  const popReleaseSettings = SETTINGS.gameplay.balloons.popRelease;
  const linearSpeedVelocityRangeMaxPx = resolveClampedNumber(
    input?.linearSpeedVelocityRangeMaxPx,
    popReleaseSettings.linearSpeedVelocityRangeMaxPx,
    SETTINGS.cursor.minPopVelocity + 1,
    10000,
  );

  return {
    linearSpeedMin: resolveClampedNumber(
      input?.linearSpeedMin,
      popReleaseSettings.linearSpeedMin,
      0,
      30,
    ),
    linearSpeedMax: resolveClampedNumber(
      input?.linearSpeedMax,
      popReleaseSettings.linearSpeedMax,
      0,
      40,
    ),
    linearSpeedVelocityRangeMaxPx,
    curve: resolvePopReleaseCurve(popReleaseSettings.curve),
    angularScale: resolveClampedNumber(
      input?.angularScale,
      BALLOON_GROUP_SETTINGS.popRelease.defaultTuning.angularScale,
      0,
      40,
    ),
    spinBoost: resolveClampedNumber(
      input?.spinBoost,
      BALLOON_GROUP_SETTINGS.popRelease.defaultTuning.spinBoost,
      0,
      8,
    ),
    linearDamping: resolveClampedNumber(
      input?.linearDamping,
      BALLOON_GROUP_SETTINGS.popRelease.defaultTuning.linearDamping,
      0,
      10,
    ),
    angularDamping: resolveClampedNumber(
      input?.angularDamping,
      BALLOON_GROUP_SETTINGS.popRelease.defaultTuning.angularDamping,
      0,
      10,
    ),
  };
}

function pickRandomBalloonColorIndex(
  fallback: MaterialColorIndex,
): MaterialColorIndex {
  const paletteSize = getActivePalette().colors.length;
  if (paletteSize <= 0) return fallback;

  const candidates: number[] = [];
  for (let i = 0; i < paletteSize; i += 1) {
    if (!BALLOON_GROUP_SETTINGS.randomize.excludedColorIndices.includes(i)) {
      candidates.push(i);
    }
  }
  const samplePoolSize =
    candidates.length > 0 ? candidates.length : paletteSize;
  const randomIndex = Math.floor(Math.random() * samplePoolSize);

  if (candidates.length > 0) {
    return candidates[randomIndex] ?? fallback;
  }
  return randomIndex;
}

export function BalloonGroup({
  detailLevel = "ultra",
  color = 8,
  randomize = false,
  dropType = "block",
  paused = false,
  flowRole = "run_spawn",
  onPopped,
  onMissed,
  onCleanupRequested: _onCleanupRequested,
  onRegisterCullZ,
  popReleaseTuning,
  ...props
}: BalloonGroupProps) {
  const BalloonComponent = BALLOONS[detailLevel];
  const { camera } = useThree();
  const [popped, setPopped] = useState(false);
  const poppedRef = useRef(false);
  const motionRef = useRef<TransformMotionHandle | null>(null);
  const probeRef = useRef<THREE.Group | null>(null);
  const payloadRef = useRef<PositionTargetHandle | null>(null);
  const popReleaseRef = useRef<PopRelease | null>(null);
  const feltPlayedRef = useRef(false);
  const randomColorRef = useRef<MaterialColorIndex | null>(null);
  const randomDropTypeRef = useRef<BalloonDropType | null>(null);
  const probeWorld = useMemo(() => new THREE.Vector3(), []);
  const popCenterWorld = useMemo(() => new THREE.Vector3(), []);
  const popCenterNdc = useMemo(() => new THREE.Vector3(), []);
  const lifecycleRegistry = useBalloonLifecycleRegistry();
  const flowState = useGameplayStore((state) => state.flowState);
  const tuning = useMemo(
    () => resolvePopReleaseTuning(popReleaseTuning),
    [popReleaseTuning],
  );
  const flowPaused = flowRole === "run_spawn"
    ? flowState !== "run"
    : flowState !== "idle";
  const motionPaused = paused || popped || flowPaused;
  const showPopHitDebug = SETTINGS.debug.enabled;
  if (randomize && randomColorRef.current === null) {
    randomColorRef.current = pickRandomBalloonColorIndex(color);
  }
  if (randomize && randomDropTypeRef.current === null) {
    randomDropTypeRef.current = Math.random() < 0.5 ? "block" : "ball";
  }
  const resolvedColor = randomize ? (randomColorRef.current ?? color) : color;
  const resolvedDropType = randomize
    ? (randomDropTypeRef.current ?? "block")
    : dropType;
  const wrapConnectorY =
    resolvedDropType === "ball"
      ? BALL_WRAP_TOP_Y
      : BLOCK_WRAP_TOP_Y;

  const getWorldXZ = useCallback(() => {
    if (poppedRef.current) {
      const pos = payloadRef.current?.getPosition();
      if (!pos) return undefined;
      return { x: pos.x, z: pos.z };
    }
    const probe = probeRef.current;
    if (!probe) return undefined;
    probe.getWorldPosition(probeWorld);
    return { x: probeWorld.x, z: probeWorld.z };
  }, [probeWorld]);

  const getWorldPopCenter = useCallback(
    (out: THREE.Vector3) => {
      const probe = probeRef.current;
      if (!probe) return false;
      out.set(
        POP_HIT_LOCAL_CENTER[0],
        POP_HIT_LOCAL_CENTER[1],
        POP_HIT_LOCAL_CENTER[2],
      );
      probe.localToWorld(out);
      return true;
    },
    [],
  );

  const getWorldPopRadiusX = useCallback(() => POP_HIT_RADIUS_X, []);
  const getWorldPopRadiusY = useCallback(() => POP_HIT_RADIUS_Y, []);

  const isPopped = useCallback(() => poppedRef.current, []);
  const isLifeLossEnabled = useCallback(
    () => flowRole === "run_spawn",
    [flowRole],
  );

  const handleMissed = useCallback(() => {
    onMissed?.();
  }, [onMissed]);

  const triggerPop = useCallback(
    (meta: BalloonLifecyclePopMeta) => {
      if (flowRole === "run_spawn" && flowState !== "run") return;
      if (flowRole === "idle_start" && flowState !== "idle") return;
      if (poppedRef.current) return;
      poppedRef.current = true;

      if (!popReleaseRef.current) {
        const snapshot = motionRef.current?.getVelocitySnapshot();
        const baseAngularVelocity = snapshot
          ? cloneVec3(snapshot.angularVelocity)
          : cloneVec3(BALLOON_GROUP_SETTINGS.popRelease.fallbackAngularVelocity);

        const speedMin = Math.min(tuning.linearSpeedMin, tuning.linearSpeedMax);
        const speedMax = Math.max(tuning.linearSpeedMin, tuning.linearSpeedMax);
        const minPopVelocity = SETTINGS.cursor.minPopVelocity;
        const speedRangeMax = Math.max(
          minPopVelocity + 1,
          tuning.linearSpeedVelocityRangeMaxPx,
        );
        const normalizedSpeed = Math.max(
          0,
          (meta.cursorSpeedPx - minPopVelocity) / (speedRangeMax - minPopVelocity),
        );
        const releaseSpeedFactor = resolvePopReleaseSpeedFactor(
          normalizedSpeed,
          tuning.curve,
        );
        const releaseSpeed = lerp(speedMin, speedMax, releaseSpeedFactor);
        const linearVelocity: Vec3 = [
          meta.worldDirX * releaseSpeed,
          0,
          meta.worldDirZ * releaseSpeed,
        ];

        const scaledAngular = scaleVec3(
          baseAngularVelocity,
          tuning.angularScale,
        );
        const spinDirection =
          normalizeVec3(scaledAngular) ?? FALLBACK_ANGULAR_DIRECTION;

        popReleaseRef.current = {
          linearVelocity,
          angularVelocity: addVec3(
            scaledAngular,
            scaleVec3(spinDirection, tuning.spinBoost),
          ),
        };
      }

      const gameplayState = useGameplayStore.getState();
      if (flowRole === "idle_start") {
        gameplayState.startRunFromIdleTrigger();
      }
      if (getWorldPopCenter(popCenterWorld)) {
        popCenterNdc.copy(popCenterWorld).project(camera);
        gameplayState.registerBalloonPopForCombo({
          x: ((popCenterNdc.x + 1) / 2) * window.innerWidth,
          y: ((-popCenterNdc.y + 1) / 2) * window.innerHeight,
          timeMs: meta.sweepTimeMs,
        });
      } else {
        gameplayState.registerBalloonPopForCombo({
          x: window.innerWidth * 0.5,
          y: window.innerHeight * 0.5,
          timeMs: meta.sweepTimeMs,
        });
      }
      setPopped(true);
      playGameSound({ type: "balloon_pop" });
      onPopped?.();
    },
    [camera, flowRole, flowState, getWorldPopCenter, onPopped, popCenterNdc, popCenterWorld, tuning],
  );

  useEffect(() => {
    if (!lifecycleRegistry) return;
    return lifecycleRegistry.register({
      getWorldXZ,
      getWorldPopCenter,
      getWorldPopRadiusX,
      getWorldPopRadiusY,
      isLifeLossEnabled,
      requestPop: triggerPop,
      isPopped,
      onMissed: handleMissed,
    });
  }, [
    lifecycleRegistry,
    getWorldXZ,
    getWorldPopCenter,
    getWorldPopRadiusX,
    getWorldPopRadiusY,
    isLifeLossEnabled,
    triggerPop,
    isPopped,
    handleMissed,
  ]);

  useEffect(() => {
    if (!onRegisterCullZ) return;
    return onRegisterCullZ(() => {
      if (poppedRef.current) return payloadRef.current?.getPosition()?.z;
      const probe = probeRef.current;
      if (!probe) return undefined;
      probe.getWorldPosition(probeWorld);
      return probeWorld.z;
    });
  }, [onRegisterCullZ, probeWorld]);

  useFrame(() => {
    if (!popped || feltPlayedRef.current) return;
    const pos = payloadRef.current?.getPosition();
    if (pos && pos.y < 0.05) {
      feltPlayedRef.current = true;
      playGameSound({ type: "payload_landed" });
    }
  });
  const popRelease = popReleaseRef.current;

  return (
    <TransformMotion
      ref={motionRef}
      paused={motionPaused}
      positionVelocity={
        randomize
          ? { z: BALLOON_GROUP_SETTINGS.randomize.positionVelocityZBase }
          : { z: BALLOON_GROUP_SETTINGS.motion.positionVelocityZ }
      }
      randomPositionVelocity={
        randomize
          ? { z: BALLOON_GROUP_SETTINGS.randomize.positionVelocityZAmplitude }
          : undefined
      }
      rotationVelocity={BALLOON_GROUP_SETTINGS.motion.rotationVelocity}
      rotationEasing={BALLOON_GROUP_SETTINGS.motion.rotationEasing}
      rotationLoopMode={BALLOON_GROUP_SETTINGS.motion.rotationLoopMode}
      rotationRange={BALLOON_GROUP_SETTINGS.motion.rotationRange}
      rotationRangeStart={BALLOON_GROUP_SETTINGS.motion.rotationRangeStart}
      rotationOffset={
        randomize
          ? BALLOON_GROUP_SETTINGS.randomize.rotationOffsetBase
          : undefined
      }
      randomRotationOffset={
        randomize
          ? BALLOON_GROUP_SETTINGS.randomize.rotationOffsetAmplitude
          : undefined
      }
      timeScale={1.5}
      timeScaleAcceleration={SETTINGS.motionAcceleration.balloons.timeScaleAcceleration}
      timeScaleAccelerationCurve={SETTINGS.motionAcceleration.balloons.timeScaleAccelerationCurve}
      {...props}
    >
      <group ref={probeRef}>
        {showPopHitDebug && !popped ? (
          <mesh
            position={POP_HIT_LOCAL_CENTER}
            geometry={POP_HIT_DEBUG_GEOMETRY}
            material={POP_HIT_DEBUG_MATERIAL}
            scale={[POP_HIT_RADIUS_X, POP_HIT_RADIUS_Y, POP_HIT_RADIUS_X]}
            renderOrder={999}
          />
        ) : null}
        {!popped ? (
          <>
            <BalloonComponent materialColor0={resolvedColor} />
            <SplineElement
              points={[
                [0, 0, 0],
                [0, wrapConnectorY, 0],
              ]}
              segments={1}
            />
            {resolvedDropType === "ball" ? (
              <SplineElement
                points={BALL_WRAP_POINTS}
                segments={1}
                curveType="linear"
                castShadow={false}
              />
            ) : (
              <SplineElement
                points={BLOCK_WRAP_POINTS}
                segments={1}
                curveType="linear"
                castShadow={false}
              />
            )}
          </>
        ) : null}
        {resolvedDropType === "ball" ? (
          <BallElement
            ref={payloadRef}
            position={BALLOON_GROUP_SETTINGS.payload.ball.position}
            sizePreset={BALLOON_GROUP_SETTINGS.payload.ball.sizePreset}
            color={resolvedColor}
            align={BALLOON_GROUP_SETTINGS.payload.ball.align}
            physics={popped ? "dynamic" : undefined}
            contagionCarrier={popped}
            contagionInfectable={false}
            contagionColor={resolvedColor}
            linearVelocity={popped ? popRelease?.linearVelocity : undefined}
            angularVelocity={popped ? popRelease?.angularVelocity : undefined}
            linearDamping={popped ? tuning.linearDamping : undefined}
            angularDamping={popped ? tuning.angularDamping : undefined}
            mass={popped ? BALLOON_GROUP_SETTINGS.payload.ball.mass : undefined}
            friction={
              popped ? BALLOON_GROUP_SETTINGS.payload.ball.friction : undefined
            }
            restitution={
              popped
                ? BALLOON_GROUP_SETTINGS.payload.ball.restitution
                : undefined
            }
          />
        ) : (
          <BlockElement
            ref={payloadRef}
            position={BALLOON_GROUP_SETTINGS.payload.block.position}
            sizePreset={BALLOON_GROUP_SETTINGS.payload.block.sizePreset}
            heightPreset={BALLOON_GROUP_SETTINGS.payload.block.heightPreset}
            color={resolvedColor}
            align={BALLOON_GROUP_SETTINGS.payload.block.align}
            plane={BALLOON_GROUP_SETTINGS.payload.block.plane}
            physics={popped ? "dynamic" : undefined}
            contagionCarrier={popped}
            contagionInfectable={false}
            contagionColor={resolvedColor}
            linearVelocity={popped ? popRelease?.linearVelocity : undefined}
            angularVelocity={popped ? popRelease?.angularVelocity : undefined}
            linearDamping={popped ? tuning.linearDamping : undefined}
            angularDamping={popped ? tuning.angularDamping : undefined}
            mass={
              popped ? BALLOON_GROUP_SETTINGS.payload.block.mass : undefined
            }
          />
        )}
      </group>
    </TransformMotion>
  );
}
