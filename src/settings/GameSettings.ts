import type {
  MaterialColorIndex,
  PaletteEntry,
  PaletteVariant,
  Settings,
} from "@/settings/GameSettings.types";
import * as THREE from "three";

export {
  CAMERA_MODES,
  CURSOR_INPUT_SOURCES,
  HIGH_SCORE_DATABASE_FALLBACK_MODES,
  HIGH_SCORE_STORAGE_MODES,
  PALETTE_VARIANT_NAMES,
  RENDER_STYLES,
  RUN_MODES,
  SMAA_PRESET_NAMES,
} from "@/settings/GameSettings.types";

export type {
  AxisMask,
  CameraMode,
  CursorInputSource,
  GameRunMode,
  MaterialColorIndex,
  PaletteAutoMidSettings,
  PaletteEntry,
  PaletteVariant,
  PaletteVariantName,
  RenderStyle,
  Settings,
  SMAAPresetName,
  Vec3,
  WebSocketChannelSettings,
} from "@/settings/GameSettings.types";

export const SETTINGS: Settings = {
  // --- RENDER STYLE ---
  render: {
    style: "toon",
  },

  // --- SCOREBOARD ---
  // BroadcastChannel (cross-tab, same origin) is always active.
  // WebSocket below is optional — enable only when a relay server is running.
  scoreboard: {
    websocket: {
      enabled: false,
      url: "ws://localhost:5175/ws/scoreboard",
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
    shadow: "#141414", // Färgen på skuggan (används av golvet och C4DMaterial)
    outline: "#141414", // Färgen på outlines (oftast samma som skugga)
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
      timeLimitMs: 120000,
      comboTimeBonusStepMs: 5000,
      timeBonusLerpMs: 500,
      pulseSlowStartMs: 10000,
      pulseFastStartMs: 5000,
    },
    highScore: {
      storageMode: "local_storage",
      maxEntries: 256,
      localStorageKey: "ikea-game.highscores.v1",
      databaseFallbackMode: "local_storage",
    },
    flow: {
      gameOverInputInactivityMs: 15000,
      gameOverInputCountdownMs: 15000,
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
        linearSpeedMin: 0.02,
        linearSpeedMax: 2.8,
        linearSpeedVelocityRangeMaxPx: 9500,
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
      runFiles: ["default.json"],
      idleFiles: ["default.json"],
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
    maxItems: 60,
    maxItemsCap: 120,
    spawnXRange: 2,
    spawnXRangeOffset: 0.8,
    cullOffset: 6,
    spawnAcceleration: 0.003,
    spawnAccelerationCurve: "exponential",
    maxItemsAcceleration: 0.003,
    maxItemsAccelerationCurve: "exponential",
  },

  // --- MOTION ACCELERATION ---
  motionAcceleration: {
    cameraTracker: {
      timeScaleAcceleration: 0.003,
      timeScaleAccelerationCurve: "exponential",
    },
    balloons: {
      timeScaleAcceleration: 0.003,
      timeScaleAccelerationCurve: "exponential",
    },
  },

  // --- CURSOR ---
  cursor: {
    inputSource: "mouse", // "mouse" or "external"
    minPopVelocity: 300,
    external: {
      enabled: false,
      websocket: {
        // url: "ws://127.0.0.1:5173/ws/cursor",
        url: "ws://localhost:5173/ws/cursor",
        reconnectMs: 1000,
      },
      staleTimeoutMs: 120,
      maxPointers: 2,
    },
    trail: {
      maxAge: 0.2,
      color: "#ffffff",
      lineWidth: 3,
      smoothing: 0.75,
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
