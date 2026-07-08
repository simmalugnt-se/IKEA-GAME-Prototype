import { useEffect, useRef } from "react";
import { useGameplayStore } from "@/gameplay/gameplayStore";
import { logDiagnosticsEvent } from "@/diagnostics/diagnosticsLogger";
import type { ScoreboardEvent } from "@/scoreboard/scoreboardEvents";
import type { ScoreboardReceiverStatus } from "@/scoreboard/scoreboardReceiver";
import { SETTINGS } from "@/settings/GameSettings";
import type { IdleSceneHealthEvaluation } from "@/scene/idleSceneHealth";
import { resetCanvasRenderFrozenTracker } from "@/scene/canvasRenderFrozen";

const ACTIVITY_EVENTS = [
  "keydown",
  "pointerdown",
  "pointermove",
  "touchstart",
] as const;

const WEBGL_FAILURE_STORAGE_KEY = "ikea-game.webglRecoveryAttempts";

let reloadScheduled = false;
let webglInitialized = false;
let webglInitFailureRecoveryInitialized = false;
let lastIdleSceneRenderAt = 0;
let lastIdleBalloonPresentAt = 0;
let lastIdleSceneHealth: IdleSceneHealthEvaluation | null = null;

function getWatchdogSettings() {
  return SETTINGS.installation.watchdog;
}

function readWebglRecoveryAttempts(): number {
  try {
    const raw = window.sessionStorage.getItem(WEBGL_FAILURE_STORAGE_KEY);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  } catch {
    return 0;
  }
}

function writeWebglRecoveryAttempts(attempts: number): void {
  try {
    if (attempts <= 0) {
      window.sessionStorage.removeItem(WEBGL_FAILURE_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(WEBGL_FAILURE_STORAGE_KEY, String(attempts));
  } catch {
    // Ignore storage failures in kiosk mode.
  }
}

export function markWebglInitialized(): void {
  webglInitialized = true;
  writeWebglRecoveryAttempts(0);
  resetCanvasRenderFrozenTracker();
}

export function markIdleBalloonPresent(): void {
  lastIdleBalloonPresentAt = Date.now();
}

export function isIdleBalloonPresent(maxAgeMs = 15_000): boolean {
  if (lastIdleBalloonPresentAt <= 0) return false;
  return Date.now() - lastIdleBalloonPresentAt <= maxAgeMs;
}

export function markIdleSceneRenderHealthy(evaluation: IdleSceneHealthEvaluation): void {
  if (!evaluation.healthy) return;
  lastIdleSceneRenderAt = Date.now();
  lastIdleSceneHealth = evaluation;
}

export function getLastIdleSceneHealth(): IdleSceneHealthEvaluation | null {
  return lastIdleSceneHealth;
}

function getPrimaryGameCanvas(): HTMLCanvasElement | null {
  const canvas = document.querySelector("canvas");
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

function isPrimaryGameCanvasUsable(): boolean {
  const canvas = getPrimaryGameCanvas();
  if (!canvas) return false;
  if (canvas.clientWidth <= 0 || canvas.clientHeight <= 0) return false;

  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext) {
    return !gl.isContextLost();
  }
  return false;
}

function isCanvasRenderRecoveryFailure(evaluation: IdleSceneHealthEvaluation): boolean {
  if (evaluation.healthy) return false;
  if (!evaluation.canvasPixelCheckApplied) return false;

  const failureReasons = evaluation.failureReasons;
  const renderFailure = failureReasons.includes("canvas_render_blank")
    || failureReasons.includes("canvas_render_frozen");
  if (!renderFailure) return false;

  return evaluation.levelSegmentCount >= 1
    && evaluation.visibleMeshCount >= getWatchdogSettings().canvasPixelMinMeshesForCheck
    && !failureReasons.includes("level_tiling_not_initialized")
    && !failureReasons.includes("no_level_segments");
}

function isWebGlFailureText(text: string): boolean {
  return /webgl/i.test(text) || /BindToCurrentSequence/i.test(text);
}

function isWebGlFailureReason(reason: unknown): boolean {
  if (reason instanceof Error) {
    return isWebGlFailureText(reason.message) || isWebGlFailureText(reason.name);
  }
  return isWebGlFailureText(String(reason ?? ""));
}

function computeWebglRecoveryDelayMs(attempt: number): number {
  const { webglInitFailureReloadMs, webglInitFailureReloadBackoffMs, webglInitFailureReloadMaxMs } =
    getWatchdogSettings();
  const delay = webglInitFailureReloadMs + Math.max(0, attempt - 1) * webglInitFailureReloadBackoffMs;
  return Math.min(delay, webglInitFailureReloadMaxMs);
}

function navigateForRecovery(attempt: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_gpuRecover", String(attempt));
  url.searchParams.set("_t", String(Date.now()));
  window.location.replace(url.toString());
}

function scheduleWatchdogReload(reason: string, delayMs = 250): void {
  if (reloadScheduled) return;
  reloadScheduled = true;

  console.warn(`[installationWatchdog] Reloading page: ${reason}`);
  logDiagnosticsEvent("watchdog_reload", { reason, reloadDelayMs: delayMs }, "warn");
  window.setTimeout(() => {
    window.location.reload();
  }, delayMs);
}

function scheduleWebglRecoveryReload(reason: string, source: string): void {
  const watchdog = getWatchdogSettings();
  if (!watchdog.enabled || reloadScheduled) return;

  const attempt = readWebglRecoveryAttempts() + 1;
  writeWebglRecoveryAttempts(attempt);
  reloadScheduled = true;

  const reloadDelayMs = computeWebglRecoveryDelayMs(attempt);
  const maxAttempts = Math.max(1, watchdog.webglInitFailureMaxAttempts);
  const exhausted = attempt >= maxAttempts;
  console.warn(
    `[installationWatchdog] WebGL recovery reload scheduled in ${reloadDelayMs}ms`
    + ` (attempt ${attempt}, source=${source}): ${reason}`,
  );
  logDiagnosticsEvent(
    "webgl_init_failed",
    { reason, source, attempt, maxAttempts, exhausted, reloadDelayMs },
    "error",
  );
  if (exhausted) {
    console.error(
      `[installationWatchdog] WebGL recovery attempts exhausted after ${attempt} attempts: ${reason}`,
    );
    logDiagnosticsEvent(
      "webgl_init_recovery_exhausted",
      { reason, source, attempt, maxAttempts, reloadDelayMs },
      "error",
    );
  }

  window.setTimeout(() => {
    navigateForRecovery(attempt);
  }, reloadDelayMs);
}

export function useGameInstallationWatchdog(): void {
  useEffect(() => {
    const watchdog = getWatchdogSettings();
    if (!watchdog.enabled) return;

    let lastActivityAt = Date.now();
    let idleStartedAt = useGameplayStore.getState().flowState === "idle" ? Date.now() : 0;

    const recordActivity = () => {
      lastActivityAt = Date.now();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, recordActivity, { passive: true });
    }

    const unsubscribeGameplay = useGameplayStore.subscribe((state, previousState) => {
      if (state.flowState !== previousState.flowState) {
        recordActivity();
        idleStartedAt = state.flowState === "idle" ? Date.now() : 0;
      }
    });

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const { flowState } = useGameplayStore.getState();
      if (flowState !== "idle") return;
      if (idleStartedAt <= 0) idleStartedAt = now;

      if (watchdog.gameIdleReloadMs > 0) {
        const idleForMs = now - Math.max(lastActivityAt, idleStartedAt);
        if (idleForMs >= watchdog.gameIdleReloadMs) {
          scheduleWatchdogReload(
            `game idle for ${Math.round(idleForMs / 1000)}s`,
            watchdog.gameIdleReloadPreDelayMs,
          );
        }
      }
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
      unsubscribeGameplay();
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, recordActivity);
      }
    };
  }, []);
}

export function useScoreboardInstallationWatchdog(
  receiverStatus: ScoreboardReceiverStatus | null,
  latestEvent: ScoreboardEvent | null,
): void {
  const receiverStatusRef = useRef(receiverStatus);
  const latestEventRef = useRef(latestEvent);
  const disconnectedSinceRef = useRef<number | null>(null);

  useEffect(() => {
    receiverStatusRef.current = receiverStatus;
    if (!receiverStatus?.wsEnabled || receiverStatus.wsState === "open") {
      disconnectedSinceRef.current = null;
    } else if (disconnectedSinceRef.current === null) {
      disconnectedSinceRef.current = Date.now();
    }
  }, [receiverStatus]);

  useEffect(() => {
    latestEventRef.current = latestEvent;
  }, [latestEvent]);

  useEffect(() => {
    const watchdog = getWatchdogSettings();
    if (!watchdog.enabled) return;

    const startedAt = Date.now();
    let maintenanceReloadPending = false;
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      if (now - startedAt >= watchdog.scoreboardReloadMs) {
        maintenanceReloadPending = true;
      }

      if (maintenanceReloadPending && latestEventRef.current?.type === "idle_started") {
        scheduleWatchdogReload("scoreboard scheduled maintenance reload while idle");
      }

      const receiverStatus = receiverStatusRef.current;
      if (!receiverStatus?.wsEnabled || receiverStatus.wsState === "open") {
        disconnectedSinceRef.current = null;
        return;
      }

      if (disconnectedSinceRef.current === null) {
        disconnectedSinceRef.current = now;
        return;
      }

      if (now - disconnectedSinceRef.current >= watchdog.scoreboardStaleReloadMs) {
        scheduleWatchdogReload("scoreboard WebSocket disconnected");
      }
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);
}

export function useWebglContextLossReload(): void {
  useEffect(() => {
    const watchdog = getWatchdogSettings();
    if (!watchdog.enabled) return;

    let reloadTimer = 0;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      if (reloadTimer !== 0 || reloadScheduled) return;
      logDiagnosticsEvent("webgl_context_lost", {
        reloadDelayMs: watchdog.webglContextLostReloadMs,
      }, "error");
      reloadTimer = window.setTimeout(() => {
        scheduleWatchdogReload("WebGL context lost");
      }, watchdog.webglContextLostReloadMs);
    };
    const onContextRestored = () => {
      if (reloadTimer !== 0) window.clearTimeout(reloadTimer);
      reloadTimer = 0;
      markWebglInitialized();
      logDiagnosticsEvent("webgl_context_restored");
    };

    document.addEventListener("webglcontextlost", onContextLost, true);
    document.addEventListener("webglcontextrestored", onContextRestored, true);
    return () => {
      document.removeEventListener("webglcontextlost", onContextLost, true);
      document.removeEventListener("webglcontextrestored", onContextRestored, true);
      if (reloadTimer !== 0) window.clearTimeout(reloadTimer);
    };
  }, []);
}

export function initWebglInitFailureRecovery(): void {
  if (webglInitFailureRecoveryInitialized || typeof window === "undefined") return;
  webglInitFailureRecoveryInitialized = true;

  if (window.location.pathname !== "/") return;

  const watchdog = getWatchdogSettings();
  if (!watchdog.enabled) return;

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!isWebGlFailureReason(event.reason)) return;
    event.preventDefault();
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
    scheduleWebglRecoveryReload(message, "unhandledrejection");
  };

  const onWindowError = (event: ErrorEvent) => {
    if (!isWebGlFailureText(event.message)) return;
    scheduleWebglRecoveryReload(event.message, "window_error");
  };

  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("error", onWindowError);
}

export function useWebglRenderHealthCheck(): void {
  useEffect(() => {
    const watchdog = getWatchdogSettings();
    if (!watchdog.enabled) return;

    const timeoutId = window.setTimeout(() => {
      if (reloadScheduled || webglInitialized) return;
      scheduleWebglRecoveryReload("game canvas WebGL context missing after startup", "health_check");
    }, watchdog.webglInitHealthCheckDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, []);
}

function isSceneRenderWatchdogFlowState(flowState: string): boolean {
  return flowState === "idle" || flowState === "run";
}

export function useIdleSceneRenderWatchdog(): void {
  useEffect(() => {
    const watchdog = getWatchdogSettings();
    if (!watchdog.enabled) return;

    let sceneWatchStartedAt = isSceneRenderWatchdogFlowState(useGameplayStore.getState().flowState)
      ? Date.now()
      : 0;
    const unsubscribeGameplay = useGameplayStore.subscribe((state, previousState) => {
      if (state.flowState === previousState.flowState) return;
      const wasWatched = isSceneRenderWatchdogFlowState(previousState.flowState);
      const isWatched = isSceneRenderWatchdogFlowState(state.flowState);
      if (isWatched && !wasWatched) {
        sceneWatchStartedAt = Date.now();
      }
    });

    const intervalId = window.setInterval(() => {
      const { flowState } = useGameplayStore.getState();
      if (!isSceneRenderWatchdogFlowState(flowState)) return;

      const now = Date.now();
      if (sceneWatchStartedAt <= 0) sceneWatchStartedAt = now;
      if (now - sceneWatchStartedAt < watchdog.idleSceneRenderCheckGraceMs) return;

      if (!webglInitialized || !isPrimaryGameCanvasUsable()) {
        scheduleWebglRecoveryReload("scene render watchdog: game canvas unavailable", "idle_scene_health");
        return;
      }

      const hasHealthyRender = lastIdleSceneRenderAt > 0;
      const timeSinceSceneWatchMs = now - sceneWatchStartedAt;
      const timeSinceHealthyMs = hasHealthyRender ? now - lastIdleSceneRenderAt : timeSinceSceneWatchMs;
      if (timeSinceHealthyMs >= watchdog.idleSceneRenderStaleMs) {
        const lastHealth = getLastIdleSceneHealth();
        logDiagnosticsEvent("idle_scene_render_stale", {
          flowState,
          staleForMs: timeSinceHealthyMs,
          levelSegmentCount: lastHealth?.levelSegmentCount ?? null,
          visibleMeshCount: lastHealth?.visibleMeshCount ?? null,
          pixelHealthy: lastHealth?.pixelHealthy ?? null,
          pixelLumaRange: lastHealth?.pixelLumaRange ?? null,
          pixelBottomLumaRange: lastHealth?.pixelBottomLumaRange ?? null,
          failureReasons: lastHealth?.failureReasons ?? [],
        }, "warn");
        scheduleWebglRecoveryReload(
          `scene render watchdog: healthy canvas/scene missing for ${Math.round(timeSinceHealthyMs / 1000)}s`
          + ` (flow=${flowState}, segments=${lastHealth?.levelSegmentCount ?? "?"},`
          + ` meshes=${lastHealth?.visibleMeshCount ?? "?"},`
          + ` pixelRange=${lastHealth?.pixelLumaRange ?? "?"})`,
          "idle_scene_render_stale",
        );
      }
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
      unsubscribeGameplay();
    };
  }, []);
}

export function usePageLoadSurvivalCheck(): void {
  useEffect(() => {
    const watchdog = getWatchdogSettings();
    if (!watchdog.enabled) return;

    const timeoutId = window.setTimeout(() => {
      if (reloadScheduled) return;

      if (!webglInitialized) {
        scheduleWebglRecoveryReload(
          "page load survival: WebGL never initialized after startup window",
          "page_load_survival",
        );
        return;
      }

      if (!isPrimaryGameCanvasUsable()) {
        scheduleWebglRecoveryReload(
          "page load survival: game canvas unavailable after startup window",
          "page_load_survival",
        );
        return;
      }

      const { flowState } = useGameplayStore.getState();
      if (flowState !== "idle") return;

      const hasHealthyRender = lastIdleSceneRenderAt > 0;
      const renderAgeMs = hasHealthyRender ? Date.now() - lastIdleSceneRenderAt : null;
      const renderAgeForCheckMs = renderAgeMs ?? Number.POSITIVE_INFINITY;
      if (renderAgeForCheckMs >= watchdog.idleSceneRenderCheckGraceMs) {
        scheduleWebglRecoveryReload(
          "page load survival: idle level/balloon scene not healthy after startup window",
          "page_load_survival",
        );
      }
    }, watchdog.pageLoadSurvivalMs);

    return () => window.clearTimeout(timeoutId);
  }, []);
}

export function requestCanvasRenderRecovery(
  evaluation: IdleSceneHealthEvaluation,
  source: string,
): "full" | null {
  const watchdog = getWatchdogSettings();
  if (!watchdog.enabled || reloadScheduled) return null;
  if (!isCanvasRenderRecoveryFailure(evaluation)) return null;

  const reasons = evaluation.failureReasons.join(", ");
  scheduleWebglRecoveryReload(
    `canvas render recovery from ${source}: ${reasons}`
    + ` (segments=${evaluation.levelSegmentCount}, meshes=${evaluation.visibleMeshCount})`,
    "canvas_render_recovery",
  );
  return "full";
}
