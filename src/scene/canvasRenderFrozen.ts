import type { GameFlowState } from "@/gameplay/gameplayStore";
import { SETTINGS } from "@/settings/GameSettings";

export type CanvasRenderFrozenState = {
  pixelFingerprint: string | null;
  pixelFrozenStreak: number;
  pixelFrozen: boolean;
  viewCenterZDelta: number | null;
};

let lastFingerprint: string | null = null;
let lastViewCenterZ: number | null = null;
let frozenStreak = 0;

export function buildPixelFingerprint(lumas: number[]): string {
  return lumas.map((value) => value.toFixed(1)).join(",");
}

export function resetCanvasRenderFrozenTracker(): void {
  lastFingerprint = null;
  lastViewCenterZ = null;
  frozenStreak = 0;
}

export function evaluateCanvasRenderFrozen(payload: {
  fingerprint: string | null;
  viewCenterZ: number;
  flowState: GameFlowState;
  visibleMeshCount: number;
  canvasPixelCheckApplied: boolean;
}): CanvasRenderFrozenState {
  const watchdog = SETTINGS.installation.watchdog;
  const cameraScrollExpected = payload.flowState === "idle" || payload.flowState === "run";
  const viewCenterZDelta = lastViewCenterZ === null
    ? null
    : Math.abs(payload.viewCenterZ - lastViewCenterZ);

  if (
    !payload.canvasPixelCheckApplied
    || !payload.fingerprint
    || !cameraScrollExpected
    || payload.visibleMeshCount < watchdog.canvasPixelMinMeshesForCheck
  ) {
    lastFingerprint = payload.fingerprint;
    lastViewCenterZ = payload.viewCenterZ;
    frozenStreak = 0;
    return {
      pixelFingerprint: payload.fingerprint,
      pixelFrozenStreak: 0,
      pixelFrozen: false,
      viewCenterZDelta,
    };
  }

  const cameraMoved = viewCenterZDelta !== null
    && viewCenterZDelta >= watchdog.canvasPixelFrozenMinCameraDelta;
  const fingerprintUnchanged = payload.fingerprint === lastFingerprint;

  if (fingerprintUnchanged && (cameraMoved || frozenStreak > 0)) {
    frozenStreak += 1;
  } else if (!fingerprintUnchanged) {
    frozenStreak = 0;
  }

  lastFingerprint = payload.fingerprint;
  lastViewCenterZ = payload.viewCenterZ;

  return {
    pixelFingerprint: payload.fingerprint,
    pixelFrozenStreak: frozenStreak,
    pixelFrozen: frozenStreak >= watchdog.canvasPixelFrozenSampleStreak,
    viewCenterZDelta,
  };
}
