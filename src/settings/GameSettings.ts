import type {
  MaterialColorIndex,
  PaletteEntry,
  PaletteVariant,
  Settings,
} from "@/settings/GameSettings.types";
import * as THREE from "three";

export const HAZARD_BALLOON_COLOR_HEX = "#ffffff";

export {
  BALLOON_DROP_TYPES,
  CAMERA_MODES,
  CURSOR_INPUT_SOURCES,
  HIGH_SCORE_DATABASE_FALLBACK_MODES,
  HIGH_SCORE_ENTRY_MODES,
  HIGH_SCORE_STORAGE_MODES,
  PALETTE_VARIANT_NAMES,
  RENDER_STYLES,
  RUN_MODES,
  SMAA_PRESET_NAMES,
  SPAWN_EVENT_ACTION_TYPES,
  SPAWN_EVENT_BALL_SIZE_PRESETS,
  SPAWN_EVENT_SELECTION_MODES,
  SPAWN_EVENT_TRIGGER_TYPES,
  SPAWN_ITEM_SCORE_MODES,
} from "@/settings/GameSettings.types";

export type {
  AxisMask,
  BalloonDropType,
  CameraMode,
  CursorInputSource,
  GameRunMode,
  GroundBallEntrySide,
  MaterialColorIndex,
  PaletteAutoMidSettings,
  PaletteEntry,
  PaletteVariant,
  PaletteVariantName,
  RenderStyle,
  Settings,
  SMAAPresetName,
  SpawnEventAction,
  SpawnEventActionCursorBurstRing,
  SpawnEventActionGroundBallWave,
  SpawnEventActionSpawnBurst,
  SpawnEventActionTrackSweeper,
  SpawnEventBallSizePreset,
  SpawnEventRule,
  SpawnEventSelectionMode,
  SpawnEventTrigger,
  SpawnEventTriggerComboMultiplier,
  SpawnItemDefinition,
  SpawnItemScoreMode,
  Vec3,
  WebSocketChannelSettings,
} from "@/settings/GameSettings.types";

const EXTERNAL_CURSOR_WS_URL =
  import.meta.env.VITE_CURSOR_WS_URL?.trim() || "ws://127.0.0.1:9001/cursor";

export const SETTINGS: Settings = {
  // --- RENDER STYLE ---
  render: {
    style: "toon",
  },

  // --- INSTALLATION WATCHDOG ---
  // Conservative safety reloads for long museum/kiosk sessions.
  installation: {
    watchdog: {
      enabled: true,
      gameIdleReloadMs: 20 * 60 * 1000,
      scoreboardReloadMs: 4 * 60 * 60 * 1000,
      scoreboardStaleReloadMs: 10 * 60 * 1000,
      webglContextLostReloadMs: 1500,
    },
  },

  // --- SCOREBOARD ---
  // BroadcastChannel (cross-tab, same origin) is always active.
  // WebSocket below is optional — enable only when a relay server is running.
  scoreboard: {
    websocket: {
      enabled: true,
      url: "ws://127.0.0.1:5175/ws/scoreboard",
      reconnectMs: 1000,
    },
  },

  // --- DEBUG ---
  debug: {
    enabled: false, // Master-toggle för allt debug
    showColliders: false, // Visa fysik-kollisions-proxys (wireframe)
    showStats: false, // Visa FPS / MS / MB
    showGrid: false, // Visa rutnät på marken
    showCameraFrustum: false, // Visa kamerans synliga område projicerat på golvet
    showDebugCamera: false, // PiP top-down view som visar default-kamerans FOV
  },

  // --- FÄRGER ---
  colors: {
    shadow: "#000000", // Färgen på skuggan (används av golvet och C4DMaterial)
    outline: "#000000", // Färgen på outlines (oftast samma som skugga)
  },

  // --- FÄRGPALETT (Toon Material) ---
  palette: {
    active: "green",
    variants: {
      classic: {
        background: "#3D2C23",
        colors: [
          { base: "#D9B5A3" },
          { base: "#45253A" },
          { base: "#558DCE" },
          { base: "#665747" },
          { base: "#FF2D19" },
          { base: HAZARD_BALLOON_COLOR_HEX },
        ],
      },
      greyscale: {
        background: "#1d1d1d",
        colors: [
          { base: "#E1D4BD" },
          { base: "#606060" },
          { base: "#3b3b3b" },
          { base: "#669E10" },
          { base: "#006B18" },
          { base: "#007FB5" },
          { base: "#003889" },
          { base: "#D2BE27" },
          { base: "#C96C05" },
          { base: "#BE0D64" },
          { base: "#A00003" },
          { base: HAZARD_BALLOON_COLOR_HEX },
        ],
      },
      green: {
        background: "#0E3420",
        colors: [
          { base: "#E1D4BD" },
          { base: "#669E10" },
          { base: "#006B18" },
          { base: "#BE0D64" },
          { base: "#A00003" },
          { base: "#007FB5" },
          { base: "#003889" },
          { base: "#D2BE27" },
          { base: "#C96C05" },
          { base: HAZARD_BALLOON_COLOR_HEX },
        ],
      },
      test1: {
        background: "#0072a3",
        colors: [
          { base: "#E1D4BD" },
          { base: "#007FB5" },
          { base: "#007FB5" },
          { base: "#BE0D64" },
          { base: "#A00003" },
          { base: "#669E10" },
          { base: "#006B18" },
          { base: "#D2BE27" },
          { base: "#C96C05" },
          { base: HAZARD_BALLOON_COLOR_HEX },
        ],
      },
      test2: {
        background: "#8c8c6b",
        colors: [
          { base: "#E1D4BD" },
          { base: "#b9b587" },
          { base: "#a6a674" },
          { base: "#007FB5" },
          { base: "#003889" },
          { base: "#D2BE27" },
          { base: "#C96C05" },
          { base: "#669E10" },
          { base: "#006B18" },
          { base: HAZARD_BALLOON_COLOR_HEX },
        ],
      },
      test3: {
        background: "#3b3025",
        colors: [
          { base: "#E1D4BD" },
          { base: "#d9a180" },
          { base: "#bc865d" },
          { base: "#007FB5" },
          { base: "#003889" },
          { base: "#D2BE27" },
          { base: "#C96C05" },
          { base: "#669E10" },
          { base: "#006B18" },
          { base: HAZARD_BALLOON_COLOR_HEX },
        ],
      },
    },
    autoMid: {
      enabled: true, // Auto-generera mid från base om mid saknas i paletten
      lightnessDelta: -0.06, // Negativt = mörkare midtone
      chromaDelta: -0.005, // Negativt = lite mindre mättnad, positivt = mer punch
      hueShift: 5, // Negativt = vrider mot kallare toner i denna setup
    },
  },

  // --- LINJER (Outlines & Creases) ---
  lines: {
    enabled: true,
    thickness: 1, // Tjocklek i pixlar
    creaseAngle: 30, // Vinkel i grader för inre linjer (30 = teknisk look)
    threshold: 0.005, // Känslighet för surface-ID edge-detektion
    composerMultisampling: 4, // MSAA i postprocess-composer (0 stanger av)
    smaaEnabled: true, // SMAA efter outline-pass (bra mot trappsteg)
    smaaPreset: "ultra", // low | medium | high | ultra
  },

  // --- KAMERA ---
  camera: {
    mode: "follow", // 'follow' eller 'static'
    base: {
      zoom: 300,
      near: 0.1,
      far: 2000,
    },
    static: {
      position: [20, 20, 20], // Fast kameraposition i static-mode
      lookAt: [0, 0, 0], // Punkt kameran tittar mot i static-mode
    },
    follow: {
      targetId: "player", // ID på target i scenen som kameran följer
      offset: [5, 5, 5], // Isometrisk offset från target
      lookAtOffset: [0, 0, 0], // Extra offset på kamerans lookAt
      followLerp: 0.025, // Kamera-drag position (0.01=trögt, 0.1=snappigt)
      lookAtLerp: 0.04, // Kamera-drag för lookAt-target
      zClampMode: "tilingOnly", // 'tilingOnly' = no-backtracking bara när level tiling är aktiv. Sätt 'never' för loop/backtracking-scenarion.
      lockRotation: true, // Låser kamerans rotation för stabil ortografisk/isometrisk känsla
      followAxes: { x: true, y: true, z: true }, // Följ bara sidled + djup, lås höjd
      lookAtAxes: { x: true, y: true, z: true }, // Lås valda axlar för lookAt
      moveLightWithTarget: true, // Flytta directional light tillsammans med follow-target
    },
  },

  // --- LJUS (Påverkar skuggor & material) ---
  light: {
    position: [0, 10, 5],
    intensity: 1,
    shadowMapSize: 4096, // 4096 = Skarpast skuggor
    shadowBias: 0, // Mycket liten bias (så skuggan sitter fast i objektet)
    shadowNormalBias: -0.001, // Denna fixar ränderna på bollen! (Prova 0.02 - 0.1)
    shadowArea: 5, // Tight frustum runt spelaren (följer med)
  },

  // --- MATERIAL (Toon Shading) ---
  material: {
    shadingDirection: [0, 4, 10], // Ljusriktning för toon-shading (oberoende av light.position)
    shadowFollowsLight: true, // Mörkaste banden följer light.position istället för shadingDirection
    highlightStep: 0.6, // Gräns för ljusaste zonen
    midtoneStep: 0.1, // Gräns för mellantonen
    castMidtoneStep: 0.2, // Start för cast-shadow midtone (0 = ingen skugga, 1 = full skugga)
    castShadowStep: 0.6, // Start för cast-shadow mörkaste zon
  },

  // --- GAMEPLAY ---
  gameplay: {
    contagion: {
      enabled: true,
      scorePerInfection: 200,
    },
    score: {
      lockOnGameOver: true,
      resetOnRunEnd: true,
      resetOnGameOver: true,
    },
    lives: {
      initial: 5,
      lossPerMiss: 1,
    },
    run: {
      mode: "time",
      timeLimitMs: 15000,
      // Combo time bonus step after X2: X3 = 1s, X4 = 2s with 1000ms.
      comboTimeBonusStepMs: 1000,
      popStreakTimeBonusEveryPops: 15,
      popStreakTimeBonusMs: 0,
      timeBonusLerpMs: 500,
      pulseSlowStartMs: 10000,
      pulseFastStartMs: 5000,
    },
    highScore: {
      storageMode: "database",
      maxEntries: 256,
      localStorageKey: "ikea-game.highscores.v1",
      databaseApiBaseUrl: "http://127.0.0.1:5175",
      databaseFallbackMode: "local_storage",
    },
    flow: {
      slowmoAffectsRunTimer: true,
      gameOverInputInactivityMs: 15000,
      gameOverInputCountdownMs: 15000,
      highScoreEntryMode: "alphabet_grid",
      highScoreEntrySwipe: {
        letterMinVelocityPx: 550,
        letterMinDistancePx: 18,
        letterCooldownMs: 140,
        buttonDwellMs: 1000,
        buttonDwellJitterGraceMs: 80,
      },
      gameOverTravelSpeedMultiplier: 20.0,
      gameOverTravelSpeedEaseInMs: 320,
      gameOverTravelSpeedEaseInEasing: "easeInSine",
    },
    balloons: {
      scorePerPop: 100,
      sensors: {
        lifeMargin: 0,
        cleanupMargin: 0.35,
      },
      popRelease: {
        linearSpeedMin: 0.12,
        linearSpeedMax: 4.4,
        linearSpeedVelocityRangeMaxPx: 3200,
        curve: "exponential",
      },
      combo: {
        enabled: true,
        strikeWindowMs: 100,
        chainWindowMs: 800,
        chainBonusCap: 2,
      },
    },
  },

  // --- LEVEL LOADING ---
  level: {
    defaultFile: "default.json", // filename inside public/levels/
    gridClonerSpawnChunkSize: 32, // Physics bodies registered per frame (0 = all at once)
    tiling: {
      enabled: true,
      // runFiles: ["test-dynamic.json"],
      // idleFiles: ["test-dynamic.json"],
      // runFiles: ["test.json"],
      // idleFiles: ["test.json"],
      runFiles: ["default.json"],
      idleFiles: ["default.json"],
      // runFiles: ["sl-comps.json"],
      // idleFiles: ["sl-comps.json"],
      gameOverFiles: ["gameover.json"],
      lookAheadDistance: 15,
      cullBehindDistance: 3,
    },
    liveSync: {
      enabled: false,
      url: "ws://localhost:5174/ws/level",
      reconnectMs: 1000,
    },
  },

  // --- ITEM SPAWNER (marker-based) ---
  spawner: {
    enabled: true,
    spawnIntervalMs: 800,
    speed: 0.5,
    speedVariance: 0.2,
    radius: 0,
    maxItems: 50,
    maxItemsCap: 100,
    spawnXRange: 2,
    spawnXRangeOffset: 0.8,
    cullOffset: 6,
    eventSelectionMode: "one_random",
    eventQueueEnabled: true,
    eventQueueGapMs: 4500,
    eventQueueMaxLength: 2,
    // Global event cooldown in milliseconds to prevent spamming events
    globalEventCooldownMs: 0,
    spawnAcceleration: 0.003,
    spawnAccelerationCurve: "exponential",
    maxItemsAcceleration: 0.0015,
    maxItemsAccelerationCurve: "exponential",
    itemDefinitions: [
      {
        id: "regular_balloon",
        label: "Regular Balloon",
        enabled: true,
        includeInDefaultPool: true,
        weight: 1,
        weightAcceleration: 0,
        weightAccelerationCurve: "linear",
        weightMaxMultiplier: 1,
        canTriggerSpawnEvents: true,
        color: 8,
        randomizeColor: true,
        randomizeDropType: true,
        lifeLossEnabled: true,
        scoreMode: "balloon_combo",
        scoreDelta: 0,
        timeDeltaMs: 0,
      },
      {
        id: "time_balloon",
        label: "Time Balloon",
        enabled: true,
        includeInDefaultPool: true,
        minScoreToSpawn: 0,
        weight: 0.03,
        weightAcceleration: 0.005,
        weightAccelerationCurve: "linear",
        weightMaxMultiplier: 2,
        maxConcurrent: 1,
        maxConcurrentAcceleration: 0,
        maxConcurrentAccelerationCurve: "linear",
        maxConcurrentCap: 1,
        canTriggerSpawnEvents: false,
        itemMarker: "time",
        color: -1,
        randomizeColor: false,
        randomizeDropType: true,
        lifeLossEnabled: false,
        scoreMode: "direct",
        scoreDelta: 0,
        timeDeltaMs: 5000,
      },
      // {
      //   id: "hazard_balloon",
      //   label: "Hazard Balloon",
      //   enabled: true,
      //   includeInDefaultPool: true,
      //   minScoreToSpawn: 20000,
      //   weight: 0.1,
      //   weightAcceleration: 0.008,
      //   weightAccelerationCurve: "linear",
      //   weightMaxMultiplier: 2,
      //   maxConcurrent: 3,
      //   maxConcurrentAcceleration: 0.02,
      //   maxConcurrentAccelerationCurve: "linear",
      //   maxConcurrentCap: 5,
      //   canTriggerSpawnEvents: false,
      //   itemMarker: "hazard",
      //   color: -1,
      //   randomizeColor: false,
      //   randomizeDropType: true,
      //   lifeLossEnabled: false,
      //   scoreMode: "direct",
      //   scoreDelta: -500,
      //   timeDeltaMs: -5000,
      //   feedbackText: "BAD POP!",
      // },
      {
        id: "gift_balloon",
        label: "Gift Balloon",
        enabled: true,
        includeInDefaultPool: true,
        weight: 0.035,
        weightAcceleration: 0,
        weightAccelerationCurve: "linear",
        weightMaxMultiplier: 1,
        maxConcurrent: 1,
        canTriggerSpawnEvents: false,
        itemMarker: "gift",
        color: 2,
        randomizeColor: false,
        randomizeDropType: true,
        lifeLossEnabled: false,
        scoreMode: "direct",
        scoreDelta: 0,
        timeDeltaMs: 0,
        feedbackText: "POWER UP!",
        triggerEventRuleIds: [
          "combo_cluster_reward",
          "ground_ball_wave_reward",
          "slowmo_reward",
          "track_sweeper_reward",
          "gravity_loss_reward",
        ],
      },
      {
        id: "combo_cluster_balloon",
        label: "Combo Cluster Balloon",
        enabled: true,
        includeInDefaultPool: false,
        weight: 0,
        weightAcceleration: 0,
        weightAccelerationCurve: "linear",
        weightMaxMultiplier: 1,
        canTriggerSpawnEvents: true,
        color: 7,
        randomizeColor: true,
        randomizeDropType: true,
        lifeLossEnabled: false,
        scoreMode: "balloon_combo",
        scoreDelta: 0,
        timeDeltaMs: 0,
      },
    ],
    eventRules: [
      {
        id: "combo_cluster_reward",
        enabled: true,
        selectionWeight: 1,
        trigger: {
          type: "pop_streak_without_miss",
          requiredPops: 15,
          cooldownMs: 5000,
        },
        action: {
          type: "spawn_burst",
          layout: "bouquet",
          spawnXOffset: 0,
          spacingX: 0.42,
          spacingY: 0.28,
          randomXJitter: 0.04,
          randomYJitter: 0.03,
          entries: [{ itemId: "combo_cluster_balloon", count: 7 }],
          feedbackText: "CLUSTER!",
        },
      },
      // {
      //   id: "ten_pop_cluster_reward",
      //   enabled: true,
      //   selectionWeight: 1,
      //   trigger: {
      //     type: "pop_streak_without_miss",
      //     requiredPops: 10,
      //     minScore: 50000,
      //     cooldownMs: 10000,
      //   },
      //   action: {
      //     type: "spawn_burst",
      //     layout: "bouquet",
      //     spawnXOffset: 0,
      //     spacingX: 0.42,
      //     spacingY: 0.28,
      //     randomXJitter: 0.04,
      //     randomYJitter: 0.03,
      //     entries: [{ itemId: "combo_cluster_balloon", count: 7 }],
      //   },
      // },
      // {
      //   id: "big_cursor_reward",
      //   enabled: true,
      //   selectionWeight: 1,
      //   trigger: {
      //     type: "combo_multiplier",
      //     minMultiplier: 3,
      //     maxMultiplier: 3,
      //     cooldownMs: 5000,
      //   },
      //   action: {
      //     type: "cursor_size_boost",
      //     scaleMultiplier: 3,
      //     durationMs: 5000,
      //     easeInMs: 350,
      //     easeOutMs: 450,
      //     feedbackText: "BIG CURSOR!",
      //   },
      // },
      // {
      //   id: "cursor_burst_reward",
      //   enabled: true,
      //   selectionWeight: 1,
      //   trigger: {
      //     type: "pop_streak_without_miss",
      //     requiredPops: 15,
      //     cooldownMs: 10000,
      //   },
      //   action: {
      //     type: "cursor_burst_ring",
      //     probeCount: 8,
      //     orbitRadiusPx: 8,
      //     probeRadiusPx: 12,
      //     rotationSpeedDeg: 0,
      //     burstIntervalMs: 90,
      //     travelSpeedPx: 900,
      //     durationMs: 3000,
      //     easeInMs: 250,
      //     easeOutMs: 350,
      //     feedbackText: "BURST!",
      //   },
      // },
      {
        id: "ground_ball_wave_reward",
        enabled: true,
        selectionWeight: 1,
        trigger: {
          type: "combo_multiplier",
          minMultiplier: 4,
          cooldownMs: 10000,
        },
        action: {
          type: "spawn_ground_ball_wave",
          count: 12,
          ballSizePreset: "lg",
          colorIndices: [7],
          entrySides: ["top", "left", "right", "bottom"],
          edgeInset: 0.15,
          spawnPadding: 1.5,
          speed: 6.5,
          speedJitter: 1.25,
          angleJitterDeg: 10,
          mass: 240,
          friction: 0.5,
          restitution: 0.2,
          linearDamping: 0.35,
          angularDamping: 0.6,
          lifetimeMs: 20000,
          feedbackText: "MULTI BALL!",
        },
      },
      {
        id: "slowmo_reward",
        enabled: true,
        selectionWeight: 1,
        trigger: {
          type: "combo_multiplier",
          minMultiplier: 4,
          cooldownMs: 10000,
        },
        action: {
          type: "time_scale_boost",
          scaleMultiplier: 0.35,
          durationMs: 9000,
          easeInMs: 250,
          easeOutMs: 600,
          feedbackText: "SLOW MOTION!",
        },
      },
      {
        id: "track_sweeper_reward",
        enabled: true,
        selectionWeight: 1,
        trigger: {
          type: "combo_multiplier",
          minMultiplier: 4,
          cooldownMs: 10000,
        },
        action: {
          type: "spawn_track_sweeper",
          colorIndex: 5,
          entrySides: ["left", "right"],
          radius: 0.18,
          length: 4.5,
          spanPadding: 2.6,
          spawnPadding: 1.4,
          speed: 4.5,
          rollAngularSpeedMultiplier: 1,
          friction: 0.7,
          restitution: 0.05,
          linearDamping: 0.1,
          angularDamping: 0.05,
          lifetimeMs: 20000,
          feedbackText: "STEAM ROLLER!",
        },
      },
      {
        id: "gravity_loss_reward",
        enabled: true,
        selectionWeight: 1,
        trigger: {
          type: "combo_multiplier",
          minMultiplier: 4,
          cooldownMs: 12000,
        },
        action: {
          type: "gravity_shift",
          gravityY: 1.25,
          bodyDelayMinMs: 0,
          bodyDelayMaxMs: 450,
          bodyGravityYMin: 0.45,
          bodyGravityYMax: 2.05,
          durationMs: 1800,
          easeInMs: 250,
          easeOutMs: 550,
          contagionColorIndices: [5, 6, 7, 8],
          feedbackText: "ZERO GRAVITY!",
        },
      },
    ],
  },

  // --- MOTION ACCELERATION ---
  motionAcceleration: {
    cameraTracker: {
      timeScaleAcceleration: 0.0015,
      timeScaleAccelerationCurve: "exponential",
      timeScaleAccelerationMaxMultiplier: 1.2,
    },
    balloons: {
      timeScaleAcceleration: 0.0015,
      timeScaleAccelerationCurve: "exponential",
      timeScaleAccelerationMaxMultiplier: 1.2,
    },
  },

  // --- CURSOR ---
  cursor: {
    inputSource: "external", // "mouse" or "external"
    minPopVelocity: 220,
    pointerRadiusPx: 4,
    hitRadiusPx: 28,
    external: {
      enabled: true,
      websocket: {
        // url: "ws://127.0.0.1:5173/ws/cursor",
        // url: "ws://localhost:5173/ws/cursor",
        url: EXTERNAL_CURSOR_WS_URL,
        reconnectMs: 1000,
      },
      staleTimeoutMs: 120,
      frameWatchdog: {
        enabled: true,
        staleFrameMs: 3000,
        reconnectCooldownMs: 5000,
        reloadWhenIdleAfterMs: 30000,
      },
      maxPointers: 2,
      alphabetGridEntryMaxPointers: 1,
    },
    trail: {
      maxAge: 0.25,
      color: "#ffffff",
      lineWidth: 8,
      followSmoothing: 0.1,
      smoothing: 0.1,
    },
  },
};

// Pre-computed shading direction — reuses a single Vector3, zero allocation
const _shadingDir = new THREE.Vector3();
let _shadingDirDirty = true;

export function markShadingDirDirty() {
  _shadingDirDirty = true;
}

export function getShadingDir(): THREE.Vector3 {
  if (_shadingDirDirty) {
    _shadingDir.set(...SETTINGS.material.shadingDirection).normalize();
    _shadingDirDirty = false;
  }
  return _shadingDir;
}

// Pre-computed shadow light direction — normalized light.position, zero allocation
const _shadowLightDir = new THREE.Vector3();
let _shadowLightDirDirty = true;

export function markShadowLightDirDirty() {
  _shadowLightDirDirty = true;
}

export function getShadowLightDir(): THREE.Vector3 {
  if (_shadowLightDirDirty) {
    _shadowLightDir.set(...SETTINGS.light.position).normalize();
    _shadowLightDirDirty = false;
  }
  return _shadowLightDir;
}

const FALLBACK_PALETTE_ENTRY: PaletteEntry = { base: "#ffffff" };

export const getActivePalette = (): PaletteVariant => {
  return SETTINGS.palette.variants[SETTINGS.palette.active];
};

export const getActiveBackground = (): string => {
  return SETTINGS.palette.variants[SETTINGS.palette.active].background;
};

export const normalizePaletteIndex = (
  index: number,
  paletteLength: number,
): number => {
  if (paletteLength <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  const truncated = Math.trunc(index);
  return ((truncated % paletteLength) + paletteLength) % paletteLength;
};

export const resolveMaterialColorIndex = (
  index: MaterialColorIndex | null | undefined,
): number => {
  const palette = getActivePalette();
  return normalizePaletteIndex(index ?? 0, palette.colors.length);
};

export const getPaletteEntry = (
  index: MaterialColorIndex | null | undefined,
): PaletteEntry => {
  const palette = getActivePalette();
  if (palette.colors.length === 0) return FALLBACK_PALETTE_ENTRY;
  return palette.colors[resolveMaterialColorIndex(index)];
};

// Current spawn event summary:
// - Bonus events are currently direct reward effects, triggered by gift_balloon triggerEventRuleIds.
// - Automatic combo/streak bonus triggers are disabled in gameplayStore.ts
//   (ENABLE_AUTOMATIC_SPAWN_EVENT_TRIGGERS = false).
// - The trigger.type / minMultiplier / requiredPops fields on these rules are retained for the
//   disabled automatic path and debug tooling; gift_balloon direct triggers do not require them.
// - combo_cluster_reward: spawns 7 cluster balloons. = cluster
// - ten_pop_cluster_reward: 10 pops without miss + score >= 50000 -> spawn 7 cluster balloons. = cluster
// - ground_ball_wave_reward: ground ball wave.
// - slowmo_reward: slow motion.
// - track_sweeper_reward: track sweeper.
// - gravity_loss_reward: gravity loss.
// - gift_balloon: higher-weight direct reward; pops one random enabled effect from triggerEventRuleIds.
// - eventSelectionMode "one_random": pick one eligible event if several qualify together.
// - globalEventCooldownMs: shared cooldown after any event; 0 disables the global lockout.
