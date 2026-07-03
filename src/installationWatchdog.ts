import { useEffect, useRef } from "react";
import { useGameplayStore } from "@/gameplay/gameplayStore";
import { logDiagnosticsEvent } from "@/diagnostics/diagnosticsLogger";
import type { ScoreboardEvent } from "@/scoreboard/scoreboardEvents";
import type { ScoreboardReceiverStatus } from "@/scoreboard/scoreboardReceiver";
import { SETTINGS } from "@/settings/GameSettings";

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
let lastIdleSceneTriangles = 0;
let lastIdleSceneStaleLoggedAt = 0;

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
}

export function markIdleSceneRenderHealthy(triangleCount: number): void {
  if (triangleCount <= 0) return;
  lastIdleSceneRenderAt = Date.now();
  lastIdleSceneTriangles = triangleCount;
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

export function useIdleSceneRenderWatchdog(): void {
  useEffect(() => {
    const watchdog = getWatchdogSettings();
    if (!watchdog.enabled) return;

    let idleStartedAt = useGameplayStore.getState().flowState === "idle" ? Date.now() : 0;
    const unsubscribeGameplay = useGameplayStore.subscribe((state, previousState) => {
      if (state.flowState !== previousState.flowState) {
        idleStartedAt = state.flowState === "idle" ? Date.now() : 0;
      }
    });

    const intervalId = window.setInterval(() => {
      const { flowState } = useGameplayStore.getState();
      if (flowState !== "idle") return;

      const now = Date.now();
      if (idleStartedAt <= 0) idleStartedAt = now;
      if (now - idleStartedAt < watchdog.idleSceneRenderCheckGraceMs) return;

      if (!webglInitialized || !isPrimaryGameCanvasUsable()) {
        scheduleWebglRecoveryReload("idle scene watchdog: game canvas unavailable", "idle_scene_health");
        return;
      }

      const hasHealthyRender = lastIdleSceneRenderAt > 0;
      const staleForMs = hasHealthyRender ? now - lastIdleSceneRenderAt : null;
      const staleForCheckMs = staleForMs ?? Number.POSITIVE_INFINITY;
      if (staleForCheckMs >= watchdog.idleSceneRenderStaleMs && now - lastIdleSceneStaleLoggedAt >= 5 * 60 * 1000) {
        lastIdleSceneStaleLoggedAt = now;
        logDiagnosticsEvent(
          "idle_scene_render_stale",
          {
            hasHealthyRender,
            staleForMs,
            staleForSeconds: staleForMs === null ? null : Math.round(staleForMs / 1000),
            lastTriangles: lastIdleSceneTriangles,
          },
          "warn",
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
        logDiagnosticsEvent(
          "page_load_survival_idle_render_missing",
          {
            hasHealthyRender,
            renderAgeMs,
            renderAgeSeconds: renderAgeMs === null ? null : Math.round(renderAgeMs / 1000),
            lastTriangles: lastIdleSceneTriangles,
          },
          "warn",
        );
      }
    }, watchdog.pageLoadSurvivalMs);

    return () => window.clearTimeout(timeoutId);
  }, []);
}
