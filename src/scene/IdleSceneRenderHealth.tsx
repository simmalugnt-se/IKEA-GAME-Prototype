import { addAfterEffect, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { logDiagnosticsEvent } from "@/diagnostics/diagnosticsLogger";
import {
  isIdleBalloonPresent,
  markIdleSceneRenderHealthy,
  requestCanvasRenderRecovery,
} from "@/installationWatchdog";
import { useLevelTilingStore } from "@/levels/levelTilingStore";
import { useGameplayStore } from "@/gameplay/gameplayStore";
import { sampleCanvasPixelHealth } from "@/scene/canvasRenderHealth";
import { evaluateCanvasRenderFrozen } from "@/scene/canvasRenderFrozen";
import {
  countVisibleMeshes,
  evaluateSceneRenderHealth,
  isIdleSceneHealthEnabled,
  isSceneRenderHealthFlowState,
} from "@/scene/idleSceneHealth";
import { SETTINGS } from "@/settings/GameSettings";

const SAMPLE_INTERVAL_MS = 5_000;
const DIAGNOSTICS_SAMPLE_INTERVAL_MS = 30_000;

export function IdleSceneRenderHealth() {
  const { gl, scene, camera } = useThree();
  const flowState = useGameplayStore((state) => state.flowState);
  const flowStateRef = useRef(flowState);
  const lastSampleAtRef = useRef(0);
  const lastDiagnosticsAtRef = useRef(0);

  useEffect(() => {
    flowStateRef.current = flowState;
  }, [flowState]);

  useEffect(() => addAfterEffect(() => {
    const currentFlowState = flowStateRef.current;
    if (!isSceneRenderHealthFlowState(currentFlowState)) return;
    if (!isIdleSceneHealthEnabled()) return;

    const now = Date.now();
    if (now - lastSampleAtRef.current < SAMPLE_INTERVAL_MS) return;
    lastSampleAtRef.current = now;

    const tilingState = useLevelTilingStore.getState();
    const { render } = gl.info;
    const pixelHealth = sampleCanvasPixelHealth(gl);
    const frozenState = evaluateCanvasRenderFrozen({
      fingerprint: pixelHealth.pixelFingerprint,
      viewCenterZ: camera.position.z,
      flowState: currentFlowState,
      visibleMeshCount: countVisibleMeshes(scene),
      canvasPixelCheckApplied: pixelHealth.canvasPixelCheckApplied,
    });
    const evaluation = evaluateSceneRenderHealth(
      {
        flowState: currentFlowState,
        levelTilingEnabled: SETTINGS.level.tiling.enabled,
        levelTilingInitialized: tilingState.initialized,
        levelSegmentCount: tilingState.segments.length,
        idleBalloonPresent: isIdleBalloonPresent(),
        visibleMeshCount: countVisibleMeshes(scene),
        triangles: render.triangles,
        renderCalls: render.calls,
      },
      pixelHealth,
      frozenState,
    );

    if (now - lastDiagnosticsAtRef.current >= DIAGNOSTICS_SAMPLE_INTERVAL_MS) {
      lastDiagnosticsAtRef.current = now;
      logDiagnosticsEvent("idle_scene_health", {
        flowState: evaluation.flowState,
        healthy: evaluation.healthy,
        failureReasons: evaluation.failureReasons,
        levelSegmentCount: evaluation.levelSegmentCount,
        levelTilingInitialized: evaluation.levelTilingInitialized,
        idleBalloonPresent: evaluation.idleBalloonPresent,
        visibleMeshCount: evaluation.visibleMeshCount,
        triangles: evaluation.triangles,
        renderCalls: evaluation.renderCalls,
        pixelHealthy: evaluation.pixelHealthy,
        pixelSampleCount: evaluation.pixelSampleCount,
        pixelLumaRange: evaluation.pixelLumaRange,
        pixelLumaStdDev: evaluation.pixelLumaStdDev,
        pixelBottomLumaRange: evaluation.pixelBottomLumaRange,
        pixelReadErrors: evaluation.pixelReadErrors,
        canvasPixelCheckApplied: evaluation.canvasPixelCheckApplied,
        pixelFrozen: evaluation.pixelFrozen,
        pixelFrozenStreak: evaluation.pixelFrozenStreak,
        viewCenterZDelta: evaluation.viewCenterZDelta,
      }, evaluation.healthy ? "info" : "warn");
    }

    if (evaluation.healthy) {
      markIdleSceneRenderHealthy(evaluation);
      return;
    }

    requestCanvasRenderRecovery(evaluation, "idle_scene_health");
  }), [camera, gl, scene]);

  return null;
}
