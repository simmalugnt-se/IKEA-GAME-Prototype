import type {
  MaterialColorIndex,
  PaletteEntry,
  PaletteVariant,
  Settings,
} from "@/settings/GameSettings.types";
import * as THREE from "three";

export {
  CAMERA_MODES,
  CONTROL_INPUT_SOURCES,
  EXTERNAL_CONTROL_MODES,
  PALETTE_VARIANT_NAMES,
  RENDER_STYLES,
  SMAA_PRESET_NAMES,
  STREAMING_CENTER_SOURCES,
} from "@/settings/GameSettings.types";

export type {
  AxisMask,
  CameraMode,
  ControlInputSource,
  ExternalControlMode,
  MaterialColorIndex,
  PaletteAutoMidSettings,
  PaletteEntry,
  PaletteVariant,
  PaletteVariantName,
  RenderStyle,
  Settings,
  SMAAPresetName,
  SoundCategorySettings,
  SoundSettings,
  StreamingCenterSource,
  SwooshSoundSettings,
  Vec3,
  WebSocketChannelSettings,
} from "@/settings/GameSettings.types";

export const SETTINGS: Settings = {
  // --- RENDER STYLE ---
  render: {
    style: "toon", // 'toon' | 'pixel' | 'retroPixelPass'
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

  // --- INPUT PIPELINE ---
  controls: {
    inputSource: "keyboard", // 'keyboard' | 'external' | 'hybrid'
    external: {
      mode: "digital", // 'digital' = piltangent-triggers, 'absolute' = målposition (x,z)
      staleTimeoutMs: 160, // Om paket uteblir längre än detta släpps extern input
      absolute: {
        followLerp: 0.5, // Kort smoothing för att dämpa jitter i måldata
        maxUnitsPerSecond: 8, // Hastighets-clamp mot målpunkten
        maxTargetStep: 0.75, // Max tillåtet hopp i målpunkt per update (anti-glitch)
      },
      websocket: {
        enabled: true, // Sätt true för inbyggd WS-klient i spelet
        url: "ws://127.0.0.1:8080",
        reconnectMs: 1000,
      },
    },
  },

  // --- DEBUG ---
  debug: {
    enabled: false, // Master-toggle för allt debug
    showColliders: true, // Visa fysik-kollisions-proxys (wireframe)
    showStats: true, // Visa FPS / MS / MB
    showGrid: false, // Visa rutnät på marken
    showCameraFrustum: false, // Visa kamerans synliga område projicerat på golvet
    showDebugCamera: true, // PiP top-down view som visar default-kamerans FOV
    streaming: {
      enabled: false, // Visa streaming-debug i scenen
      showRadii: true, // Visar preload/render/physics-radier runt spelaren
      showChunkBounds: true, // Visar chunk-gridfärger för aktiva zoner
      showAllChunkBounds: true, // Om true: visar alla chunk-rutor (mycket brus)
    },
    benchmark: {
      enabled: false, // Aktivera tung benchmark-scen (många auto-genererade objekt)
      gridX: 20, // Antal objekt i X-led
      gridZ: 20, // Antal objekt i Z-led
      layers: 2, // Antal vertikala lager
      spacing: 1.25, // Avstånd mellan benchmark-objekt
      heightStep: 0.45, // Höjdskillnad mellan lager
      origin: [-12, 0, -12], // Startposition för benchmark-grid
      usePhysics: false, // Om true: vissa benchmark-objekt får fixed physics
      fixedColliderEvery: 4, // Var N:te objekt får fixed physics när usePhysics=true
    },
  },

  // --- STREAMING (Automatisk chunk-aktivering) ---
  streaming: {
    enabled: false, // Master-toggle för streaming av auto-genererade/world-objekt
    cellSize: 1, // Storlek på varje chunk-cell i world-units
    updateIntervalMs: 120, // Hur ofta chunk-aktivering uppdateras
    preloadRadius: 2.6, // Chunks inom denna radie markeras som preload
    renderLoadRadius: 2.0, // Chunks laddas in visuellt inom denna radie
    renderUnloadRadius: 2.4, // Chunks tas bort visuellt först utanför denna radie
    physicsLoadRadius: 1.4, // Physics aktiveras inom denna radie
    physicsUnloadRadius: 1.8, // Physics stängs av först utanför denna radie
    center: {
      source: "target", // 'target' = följ targetId, 'cameraFocus' = följ kamerans focus/lookAt
      targetId: "player",
    },
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

  // --- PIXELATION (Pixelart-test via postprocess-pass) ---
  pixelation: {
    enabled: true, // Används när render.style = 'pixel'
    granularity: 8, // 1 = subtilt, högre = mer pixligt
  },

  // --- RETRO PIXEL PASS (three/examples RenderPixelatedPass) ---
  retroPixelPass: {
    pixelSize: 8, // Storlek på "pixlarna"
    normalEdgeStrength: 0.5, // Kantstyrka baserad på normaler
    depthEdgeStrength: 0.45, // Kantstyrka baserad på depth
    depthEdgeThresholdMin: 0.0005, // Lägre värden gör depth-kanter känsligare (bra för ortografisk kamera)
    depthEdgeThresholdMax: 0.003, // Bör vara större än min-värdet
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
    shadowArea: 4, // Tight frustum runt spelaren (följer med)
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

  // --- SPELARFYSIK ---
  player: {
    impulseStrength: 0.01, // Hur hårt bollen knuffas
    jumpStrength: 0.08, // Hur högt bollen hoppar
    linearDamping: 1.5, // Luftmotstånd (bromsar farten framåt)
    angularDamping: 2.0, // Rotationsmotstånd (bromsar rullandet)
    mass: 0.1, // Bollens tyngd
    friction: 1.5, // Grepp mot underlaget
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
      autoReset: true,
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
    },
  },

  // --- LEVEL LOADING ---
  level: {
    defaultFile: "default.json", // filename inside public/levels/
    gridClonerSpawnChunkSize: 32, // Physics bodies registered per frame (0 = all at once)
    tiling: {
      enabled: true,
      files: ["default.json"],
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
    spawnXRange: 1.5,
    cullOffset: 6,
    spawnAcceleration: 0.005,
    spawnAccelerationCurve: "exponential",
    maxItemsAcceleration: 0.005,
    maxItemsAccelerationCurve: "exponential",
  },

  // --- MOTION ACCELERATION ---
  motionAcceleration: {
    cameraTracker: {
      timeScaleAcceleration: 0.005,
      timeScaleAccelerationCurve: "exponential",
    },
    balloons: {
      timeScaleAcceleration: 0.005,
      timeScaleAccelerationCurve: "exponential",
    },
  },

  // --- CURSOR ---
  cursor: {
    minPopVelocity: 300,
    trail: {
      maxAge: 0.2,
      color: "#ffffff",
      lineWidth: 3,
      smoothing: 0.75,
    },
  },

  // --- LJUD ---
  sounds: {
    enabled: true,
    pop: {
      files: [
        "/sounds/pop/pop1.wav",
        "/sounds/pop/pop2.wav",
        "/sounds/pop/pop3.wav",
        "/sounds/pop/pop4.wav",
      ],
      volume: 1,
    },
    felt: {
      files: [
        "/sounds/felt/felt1.wav",
        "/sounds/felt/felt2.wav",
        "/sounds/felt/felt3.wav",
      ],
      volume: 1,
    },
    steel: {
      files: [
        "/sounds/steel/steel1.wav",
        "/sounds/steel/steel2.wav",
        "/sounds/steel/steel3.wav",
      ],
      volume: 0.5,
    },
    error: {
      files: [
        "/sounds/error/error1.wav",
        "/sounds/error/error2.wav",
        "/sounds/error/error3.wav",
        "/sounds/error/error4.wav",
      ],
      volume: 1,
    },
    bee: {
      files: ["/sounds/bee/bee1.wav"],
      volume: 1.2,
    },
    swoosh: {
      files: [
        "/sounds/swoosh/swoosh1.wav",
        "/sounds/swoosh/swoosh2.wav",
        "/sounds/swoosh/swoosh3.wav",
        "/sounds/swoosh/swoosh4.wav",
        "/sounds/swoosh/swoosh65.wav",
      ],
      volume: 0,
      minVelocity: 300,
      maxVelocity: 2000,
      cooldownMs: 300,
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
