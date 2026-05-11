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

function reloadPage(reason: string): void {
  console.warn(`[installationWatchdog] Reloading page: ${reason}`);
  logDiagnosticsEvent("watchdog_reload", { reason }, "warn");
  window.setTimeout(() => window.location.reload(), 250);
}

function getWatchdogSettings() {
  return SETTINGS.installation.watchdog;
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

      const idleForMs = now - Math.max(lastActivityAt, idleStartedAt);
      if (idleForMs >= watchdog.gameIdleReloadMs) {
        reloadPage(`game idle for ${Math.round(idleForMs / 1000)}s`);
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
        reloadPage("scoreboard scheduled maintenance reload while idle");
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
        reloadPage("scoreboard WebSocket disconnected");
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
      if (reloadTimer !== 0) return;
      logDiagnosticsEvent("webgl_context_lost", {
        reloadDelayMs: watchdog.webglContextLostReloadMs,
      }, "error");
      reloadTimer = window.setTimeout(() => {
        reloadPage("WebGL context lost");
      }, watchdog.webglContextLostReloadMs);
    };
    const onContextRestored = () => {
      if (reloadTimer !== 0) window.clearTimeout(reloadTimer);
      reloadTimer = 0;
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
