import * as THREE from "three";
import type { GameFlowState } from "@/gameplay/gameplayStore";
import type { CanvasPixelHealthSnapshot } from "@/scene/canvasRenderHealth";
import type { CanvasRenderFrozenState } from "@/scene/canvasRenderFrozen";
import { SETTINGS } from "@/settings/GameSettings";

export type IdleSceneHealthSnapshot = {
  flowState: GameFlowState;
  levelTilingEnabled: boolean;
  levelTilingInitialized: boolean;
  levelSegmentCount: number;
  idleBalloonPresent: boolean;
  visibleMeshCount: number;
  triangles: number;
  renderCalls: number;
};

export type IdleSceneHealthEvaluation = IdleSceneHealthSnapshot
  & CanvasPixelHealthSnapshot
  & CanvasRenderFrozenState & {
    healthy: boolean;
    failureReasons: string[];
  };

const MIN_VISIBLE_MESHES = 8;
const MIN_LEVEL_SEGMENTS = 1;

export function countVisibleMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) {
      count += 1;
    }
  });
  return count;
}

export function evaluateSceneRenderHealth(
  snapshot: IdleSceneHealthSnapshot,
  pixelHealth: CanvasPixelHealthSnapshot,
  frozenState: CanvasRenderFrozenState,
): IdleSceneHealthEvaluation {
  const failureReasons: string[] = [];
  const watchdog = SETTINGS.installation.watchdog;

  if (snapshot.levelTilingEnabled) {
    if (!snapshot.levelTilingInitialized) {
      failureReasons.push("level_tiling_not_initialized");
    }
    if (snapshot.levelSegmentCount < MIN_LEVEL_SEGMENTS) {
      failureReasons.push("no_level_segments");
    }
  }

  if (snapshot.flowState === "idle" && !snapshot.idleBalloonPresent) {
    failureReasons.push("idle_balloon_missing");
  }

  const hasLevelSegments = snapshot.levelSegmentCount >= MIN_LEVEL_SEGMENTS;
  if (snapshot.visibleMeshCount < MIN_VISIBLE_MESHES && !hasLevelSegments) {
    failureReasons.push("visible_mesh_count_too_low");
  }

  const shouldRequirePixelHealth = pixelHealth.canvasPixelCheckApplied
    && snapshot.visibleMeshCount >= watchdog.canvasPixelMinMeshesForCheck;
  if (shouldRequirePixelHealth && !pixelHealth.pixelHealthy) {
    failureReasons.push("canvas_render_blank");
  }
  if (shouldRequirePixelHealth && frozenState.pixelFrozen) {
    failureReasons.push("canvas_render_frozen");
  }

  return {
    ...snapshot,
    ...pixelHealth,
    ...frozenState,
    healthy: failureReasons.length === 0,
    failureReasons,
  };
}

/** @deprecated Use evaluateSceneRenderHealth */
export function evaluateIdleSceneHealth(
  snapshot: Omit<IdleSceneHealthSnapshot, "flowState"> & { flowState?: GameFlowState },
): IdleSceneHealthEvaluation {
  return evaluateSceneRenderHealth(
    { ...snapshot, flowState: snapshot.flowState ?? "idle" },
    {
      pixelSampleCount: 0,
      pixelLumaMin: null,
      pixelLumaMax: null,
      pixelLumaRange: null,
      pixelLumaStdDev: null,
      pixelBottomLumaRange: null,
      pixelFingerprint: null,
      pixelReadErrors: 0,
      pixelHealthy: true,
      canvasPixelCheckApplied: false,
    },
    {
      pixelFingerprint: null,
      pixelFrozenStreak: 0,
      pixelFrozen: false,
      viewCenterZDelta: null,
    },
  );
}

export function isIdleSceneHealthEnabled(): boolean {
  return SETTINGS.level.tiling.enabled;
}

export function isSceneRenderHealthFlowState(flowState: GameFlowState): boolean {
  return flowState === "idle"
    || flowState === "run"
    || flowState === "game_over_travel"
    || flowState === "game_over_input";
}
