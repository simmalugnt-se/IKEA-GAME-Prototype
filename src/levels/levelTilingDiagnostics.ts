import { logDiagnosticsEvent } from "@/diagnostics/diagnosticsLogger";
import type { LevelSpawnMode } from "@/levels/levelTilingStore";

const HEARTBEAT_INTERVAL_MS = 60_000;
const EMPTY_WARN_INTERVAL_MS = 5 * 60_000;

let lastHeartbeatAt = 0;
let lastEmptyWarnAt = 0;

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function logLevelTileSpawned(payload: {
  flowState: string;
  spawnMode: LevelSpawnMode;
  segmentId: string | null;
  filename: string | null;
  activeSegments: number;
  nearWorldZ: number | null;
  farWorldZ: number | null;
}): void {
  logDiagnosticsEvent("level_tile_spawned", {
    ...payload,
    nearWorldZ: payload.nearWorldZ === null ? null : round(payload.nearWorldZ),
    farWorldZ: payload.farWorldZ === null ? null : round(payload.farWorldZ),
  });
}

export function logLevelTileCulled(payload: {
  flowState: string;
  spawnMode: LevelSpawnMode;
  culledSegmentIds: string[];
  activeSegmentsBefore: number;
  activeSegmentsAfter: number;
  reason: "visibility" | "game_over_entry";
}): void {
  logDiagnosticsEvent("level_tile_culled", payload, payload.activeSegmentsAfter === 0 ? "warn" : "info");
}

export function maybeLogLevelTileHeartbeat(payload: {
  flowState: string;
  spawnMode: LevelSpawnMode;
  activeSegments: number;
  viewCenterZ: number;
  frontierZ: number | null;
}): void {
  const now = Date.now();
  if (now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeatAt = now;
  logDiagnosticsEvent("level_tile_heartbeat", {
    ...payload,
    viewCenterZ: round(payload.viewCenterZ),
    frontierZ: payload.frontierZ === null ? null : round(payload.frontierZ),
  });
}

export function maybeLogLevelTileSegmentsEmpty(payload: {
  flowState: string;
  spawnMode: LevelSpawnMode;
  reason: string;
}): void {
  const now = Date.now();
  if (now - lastEmptyWarnAt < EMPTY_WARN_INTERVAL_MS) return;
  lastEmptyWarnAt = now;
  logDiagnosticsEvent("level_tile_segments_empty", payload, "warn");
}

export function logLevelTileSpawnModeChanged(payload: {
  flowState: string;
  previousSpawnMode: LevelSpawnMode;
  spawnMode: LevelSpawnMode;
  resetIndex: boolean;
}): void {
  logDiagnosticsEvent("level_tile_spawn_mode_changed", payload);
}
