type DiagnosticsLevel = "info" | "warn" | "error";

type DiagnosticsPayload = Record<string, unknown>;

type DiagnosticsConfig = {
  enabled: boolean;
  overlay: boolean;
  endpoint: string;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:5175";
const CONFIG_URL = `${DEFAULT_API_BASE_URL}/api/diagnostics/config`;
const DEFAULT_ENDPOINT = `${DEFAULT_API_BASE_URL}/api/diagnostics`;
const PERF_SAMPLE_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const LONG_FRAME_MS = 50;
const MAX_MESSAGE_LENGTH = 2_000;

let config: DiagnosticsConfig = {
  enabled: import.meta.env.VITE_DIAGNOSTICS_ENABLED !== "false",
  overlay: import.meta.env.VITE_DIAGNOSTICS_OVERLAY === "true",
  endpoint: import.meta.env.VITE_DIAGNOSTICS_ENDPOINT || DEFAULT_ENDPOINT,
};

let initialized = false;
let pageName = "unknown";
let currentFps = 0;
let currentP95FrameMs = 0;
let currentHeapMb: number | null = null;
let overlayElement: HTMLDivElement | null = null;
let lastConsoleMessages = new Map<string, number>();

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

function resolvePageName(): string {
  const path = window.location.pathname;
  if (path === "/" || path === "") return "game";
  return path.replace(/^\/+/, "") || "game";
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === "string") {
    return value.length > MAX_MESSAGE_LENGTH
      ? `${value.slice(0, MAX_MESSAGE_LENGTH)}...`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value === undefined) return null;

  try {
    const json = JSON.stringify(value);
    if (json.length <= MAX_MESSAGE_LENGTH) return JSON.parse(json);
    return `${json.slice(0, MAX_MESSAGE_LENGTH)}...`;
  } catch {
    return String(value);
  }
}

function sendDiagnosticsEvent(
  level: DiagnosticsLevel,
  event: string,
  payload: DiagnosticsPayload = {},
): void {
  if (!config.enabled) return;

  const body = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    page: pageName,
    path: window.location.pathname,
    visibility: document.visibilityState,
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    ...payload,
  });

  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(config.endpoint, new Blob([body], { type: "text/plain;charset=UTF-8" }));
      if (sent) return;
    }

    void fetch(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Diagnostics must never affect the installation.
    });
  } catch {
    // Diagnostics must never affect the installation.
  }
}

export function logDiagnosticsEvent(
  event: string,
  payload: DiagnosticsPayload = {},
  level: DiagnosticsLevel = "info",
): void {
  sendDiagnosticsEvent(level, event, payload);
}

function patchConsole(): void {
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  const logConsole = (level: Exclude<DiagnosticsLevel, "info">, args: unknown[]) => {
    const message = args.map((arg) => String(normalizeValue(arg))).join(" ");
    const dedupeKey = `${level}:${message}`;
    const now = Date.now();
    const lastSeenAt = lastConsoleMessages.get(dedupeKey) || 0;
    if (now - lastSeenAt < 60_000) return;
    lastConsoleMessages.set(dedupeKey, now);
    if (lastConsoleMessages.size > 100) {
      lastConsoleMessages = new Map(Array.from(lastConsoleMessages.entries()).slice(-50));
    }

    sendDiagnosticsEvent(level, "console", {
      message,
      args: args.map(normalizeValue),
    });
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    logConsole("warn", args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    logConsole("error", args);
  };
}

function createOrUpdateOverlay(): void {
  if (!config.overlay) {
    overlayElement?.remove();
    overlayElement = null;
    return;
  }

  if (!overlayElement) {
    overlayElement = document.createElement("div");
    overlayElement.style.position = "fixed";
    overlayElement.style.zIndex = "2147483647";
    overlayElement.style.top = "8px";
    overlayElement.style.left = "8px";
    overlayElement.style.padding = "6px 8px";
    overlayElement.style.background = "rgba(0,0,0,0.72)";
    overlayElement.style.color = "#9cff4a";
    overlayElement.style.font = "12px/1.35 monospace";
    overlayElement.style.pointerEvents = "none";
    overlayElement.style.whiteSpace = "pre";
    document.body.appendChild(overlayElement);
  }

  const heapText = currentHeapMb === null ? "heap n/a" : `heap ${currentHeapMb.toFixed(0)} MB`;
  overlayElement.textContent = [
    `diag ${pageName}`,
    `fps ${currentFps.toFixed(1)}`,
    `p95 ${currentP95FrameMs.toFixed(1)} ms`,
    heapText,
  ].join("\n");
}

function getHeapStats() {
  const memory = (performance as PerformanceWithMemory).memory;
  if (!memory) return {};
  currentHeapMb = memory.usedJSHeapSize / 1024 / 1024;
  return {
    jsHeapUsedMb: Math.round(currentHeapMb * 10) / 10,
    jsHeapLimitMb: Math.round((memory.jsHeapSizeLimit / 1024 / 1024) * 10) / 10,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index] || 0;
}

function startPerformanceMonitor(): void {
  if (pageName !== "game" && pageName !== "scoreboard") return;

  let frameCount = 0;
  let longFrames = 0;
  let lastFrameAt = performance.now();
  let windowStartedAt = lastFrameAt;
  let lastHeartbeatAt = Date.now();
  let frameDurations: number[] = [];

  const tick = (now: number) => {
    const frameMs = now - lastFrameAt;
    lastFrameAt = now;
    frameCount += 1;
    frameDurations.push(frameMs);
    if (frameMs >= LONG_FRAME_MS) longFrames += 1;

    if (now - windowStartedAt >= PERF_SAMPLE_INTERVAL_MS) {
      const durationSeconds = (now - windowStartedAt) / 1000;
      currentFps = frameCount / Math.max(1, durationSeconds);
      currentP95FrameMs = percentile(frameDurations, 0.95);
      sendDiagnosticsEvent("info", "perf", {
        fpsAvg: Math.round(currentFps * 10) / 10,
        p95FrameMs: Math.round(currentP95FrameMs * 10) / 10,
        maxFrameMs: Math.round(Math.max(...frameDurations) * 10) / 10,
        longFrames,
        ...getHeapStats(),
      });

      frameCount = 0;
      longFrames = 0;
      frameDurations = [];
      windowStartedAt = now;
      createOrUpdateOverlay();
    }

    const heartbeatNow = Date.now();
    if (heartbeatNow - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatAt = heartbeatNow;
      sendDiagnosticsEvent("info", "heartbeat", {
        fpsAvg: Math.round(currentFps * 10) / 10,
        p95FrameMs: Math.round(currentP95FrameMs * 10) / 10,
        ...getHeapStats(),
      });
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as Partial<DiagnosticsConfig>;
    config = {
      enabled: data.enabled === true,
      overlay: data.overlay === true,
      endpoint: typeof data.endpoint === "string" && data.endpoint.length > 0
        ? data.endpoint
        : config.endpoint,
    };
    createOrUpdateOverlay();
  } catch {
    // Keep build-time defaults if the diagnostics server is unavailable.
  }
}

export function initDiagnosticsLogger(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  pageName = resolvePageName();

  patchConsole();
  void loadRuntimeConfig().finally(() => {
    sendDiagnosticsEvent("info", "page_loaded", {
      userAgent: navigator.userAgent,
    });
    startPerformanceMonitor();
  });

  window.addEventListener("error", (event) => {
    sendDiagnosticsEvent("error", "window_error", {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: normalizeValue(event.error),
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    sendDiagnosticsEvent("error", "unhandled_rejection", {
      reason: normalizeValue(event.reason),
    });
  });

  window.addEventListener("beforeunload", () => {
    sendDiagnosticsEvent("info", "page_unload");
  });
}
