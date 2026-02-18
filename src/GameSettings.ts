import * as THREE from "three";

export type Vec3 = [number, number, number];

export type MaterialColorIndex = number

export type PaletteEntry = {
  base: string;
  mid?: string;
};

export type PaletteVariant = {
  background: string
  colors: PaletteEntry[]
}

export type PaletteAutoMidSettings = {
  enabled: boolean;
  lightnessDelta: number;
  chromaDelta: number;
  hueShift: number;
};

export type PaletteVariantName = "classic" | "greyscale" | "green";
export type SMAAPresetName = "low" | "medium" | "high" | "ultra";
export type CameraMode = "static" | "follow";
export type StreamingCenterSource = "target" | "cameraFocus";
export type RenderStyle = "toon" | "pixel" | "retroPixelPass";
export type ControlInputSource = "keyboard" | "external" | "hybrid";
export type ExternalControlMode = "digital" | "absolute";

type AxisMask = {
  x: boolean;
  y: boolean;
  z: boolean;
};

type Settings = {
  render: {
    style: RenderStyle;
  };
  controls: {
    inputSource: ControlInputSource;
    external: {
      mode: ExternalControlMode;
      staleTimeoutMs: number;
      absolute: {
        followLerp: number;
        maxUnitsPerSecond: number;
        maxTargetStep: number;
      };
      websocket: {
        enabled: boolean;
        url: string;
        reconnectMs: number;
      };
    };
  };
  debug: {
    enabled: boolean;
    showColliders: boolean;
    showStats: boolean;
    streaming: {
      enabled: boolean;
      showRadii: boolean;
      showChunkBounds: boolean;
      showAllChunkBounds: boolean;
    };
    benchmark: {
      enabled: boolean;
      gridX: number;
      gridZ: number;
      layers: number;
      spacing: number;
      heightStep: number;
      origin: Vec3;
      usePhysics: boolean;
      fixedColliderEvery: number;
    };
  };
  streaming: {
    enabled: boolean;
    cellSize: number;
    updateIntervalMs: number;
    preloadRadius: number;
    renderLoadRadius: number;
    renderUnloadRadius: number;
    physicsLoadRadius: number;
    physicsUnloadRadius: number;
    center: {
      source: StreamingCenterSource;
      targetId: string;
    };
  };
  colors: {
    shadow: string;
    outline: string;
  };
  palette: {
    active: PaletteVariantName;
    variants: Record<PaletteVariantName, PaletteVariant>;
    autoMid: PaletteAutoMidSettings;
  };
  lines: {
    enabled: boolean;
    thickness: number;
    creaseAngle: number;
    threshold: number;
    composerMultisampling: number;
    smaaEnabled: boolean;
    smaaPreset: SMAAPresetName;
  };
  pixelation: {
    enabled: boolean;
    granularity: number;
  };
  retroPixelPass: {
    pixelSize: number;
    normalEdgeStrength: number;
    depthEdgeStrength: number;
    depthEdgeThresholdMin: number;
    depthEdgeThresholdMax: number;
  };
  camera: {
    mode: CameraMode;
    base: {
      zoom: number;
      near: number;
      far: number;
    };
    static: {
      position: Vec3;
      lookAt: Vec3;
    };
    follow: {
      targetId: string;
      offset: Vec3;
      lookAtOffset: Vec3;
      followLerp: number;
      lookAtLerp: number;
      lockRotation: boolean;
      followAxes: AxisMask;
      lookAtAxes: AxisMask;
      moveLightWithTarget: boolean;
    };
  };
  light: {
    position: Vec3;
    intensity: number;
    shadowMapSize: number;
    shadowBias: number;
    shadowNormalBias: number;
    shadowArea: number;
  };
  material: {
    highlightStep: number;
    midtoneStep: number;
    castMidtoneStep: number;
    castShadowStep: number;
  };
  player: {
    impulseStrength: number;
    jumpStrength: number;
    linearDamping: number;
    angularDamping: number;
    mass: number;
    friction: number;
  };
};

export const SETTINGS: Settings = {
  // --- RENDER STYLE ---
  render: {
    style: "toon", // 'toon' | 'pixel' | 'retroPixelPass'
  },

  // --- INPUT PIPELINE ---
  controls: {
    inputSource: "keyboard", // 'keyboard' | 'external' | 'hybrid'
    external: {
      mode: "absolute", // 'digital' = piltangent-triggers, 'absolute' = målposition (x,z)
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
    enabled: true, // Master-toggle för allt debug
    showColliders: true, // Visa fysik-kollisions-proxys (wireframe)
    showStats: true, // Visa FPS / MS / MB
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
    enabled: false,        // Master-toggle för streaming av auto-genererade/world-objekt
    cellSize: 1,           // Storlek på varje chunk-cell i world-units
    updateIntervalMs: 120, // Hur ofta chunk-aktivering uppdateras
    preloadRadius: 2.6,     // Chunks inom denna radie markeras som preload
    renderLoadRadius: 2.0,  // Chunks laddas in visuellt inom denna radie
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
    active: "greyscale",
    variants: {
      classic: {
        background: '#3D2C23',
        colors: [
          { base: '#45253A' },
          { base: '#558DCE' },
          { base: '#D9B5A3' },
          { base: '#665747' },
          { base: '#FF2D19' },
          { base: '#78C850' },
          { base: '#E0C24A' },
          { base: '#8A6BEA' },
          { base: '#2FB9A6' },
          { base: '#F2E5C4' },
        ],
      },
      greyscale: {
        background: '#1b1b1b',
        colors: [
          { base: '#717171' },
          { base: '#424242' },
          { base: '#007FB5' },
          { base: '#C96C05' },
          { base: '#ffffff' },
          { base: '#2A2A2A' },
          { base: '#5B5B5B' },
          { base: '#8D8D8D' },
          { base: '#BFBFBF' },
          { base: '#E8E8E8' },
        ],
      },
      green: {
        background: '#0E3420',
        colors: [
          { base: '#669E10' },
          { base: '#006B18' },
          { base: '#007FB5' },
          { base: '#C96C05' },
          { base: '#E1D4BD' },
          { base: '#8BC34A' },
          { base: '#2E8B57' },
          { base: '#A7C957' },
          { base: '#3FA34D' },
          { base: '#F0E6CC' },
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
    thickness: 1,     // Tjocklek i pixlar
    creaseAngle: 30,    // Vinkel i grader för inre linjer (30 = teknisk look)
    threshold: 0.005,    // Känslighet för surface-ID edge-detektion
    composerMultisampling: 4, // MSAA i postprocess-composer (0 stanger av)
    smaaEnabled: true,  // SMAA efter outline-pass (bra mot trappsteg)
    smaaPreset: 'ultra', // low | medium | high | ultra
  },

  // --- PIXELATION (Pixelart-test via postprocess-pass) ---
  pixelation: {
    enabled: false, // Används när render.style = 'pixel'
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
    mode: 'follow', // 'follow' eller 'static'
    base: {
      zoom: 300,
      near: 0.1,
      far: 2000,
    },
    static: {
      position: [5, 5, 5], // Fast kameraposition i static-mode
      lookAt: [0, 0, 0], // Punkt kameran tittar mot i static-mode
    },
    follow: {
      targetId: "player", // ID på target i scenen som kameran följer
      offset: [5, 5, 5], // Isometrisk offset från target
      lookAtOffset: [0, 0, 0], // Extra offset på kamerans lookAt
      followLerp: 0.025, // Kamera-drag position (0.01=trögt, 0.1=snappigt)
      lookAtLerp: 0.04, // Kamera-drag för lookAt-target
      lockRotation: true, // Låser kamerans rotation för stabil ortografisk/isometrisk känsla
      followAxes: { x: true, y: false, z: true }, // Följ bara sidled + djup, lås höjd
      lookAtAxes: { x: true, y: true, z: true }, // Lås valda axlar för lookAt
      moveLightWithTarget: true, // Flytta directional light tillsammans med follow-target
    },
  },

  // --- LJUS (Påverkar skuggor & material) ---
  light: {
    position: [0, 2.0, 5],
    intensity: 1,
    shadowMapSize: 4096, // 4096 = Skarpast skuggor
    shadowBias: 0, // Mycket liten bias (så skuggan sitter fast i objektet)
    shadowNormalBias: -0.001, // Denna fixar ränderna på bollen! (Prova 0.02 - 0.1)
    shadowArea: 4, // Tight frustum runt spelaren (följer med)
  },

  // --- MATERIAL (Toon Shading) ---
  material: {
    highlightStep: 0.6, // Gräns för ljusaste zonen
    midtoneStep: 0.1, // Gräns för mellantonen
    castMidtoneStep: 0.2, // Start för cast-shadow midtone (0 = ingen skugga, 1 = full skugga)
    castShadowStep: 0.6, // Start för cast-shadow mörkaste zon
  },

  // --- SPELARFYSIK ---
  player: {
    impulseStrength: 0.02, // Hur hårt bollen knuffas
    jumpStrength: 0.08, // Hur högt bollen hoppar
    linearDamping: 1.5, // Luftmotstånd (bromsar farten framåt)
    angularDamping: 2.0, // Rotationsmotstånd (bromsar rullandet)
    mass: 0.1, // Bollens tyngd
    friction: 1.5, // Grepp mot underlaget
  },
};

// Hjälpfunktion för att få ljusets position som en Vector3
export const getLightDir = () => {
  return new THREE.Vector3(...SETTINGS.light.position).normalize();
};

const FALLBACK_PALETTE_ENTRY: PaletteEntry = { base: '#ffffff' }

export const getActivePalette = (): PaletteVariant => {
  return SETTINGS.palette.variants[SETTINGS.palette.active]
}

export const getActiveBackground = (): string => {
  return SETTINGS.palette.variants[SETTINGS.palette.active].background
}

export const normalizePaletteIndex = (index: number, paletteLength: number): number => {
  if (paletteLength <= 0) return 0
  if (!Number.isFinite(index)) return 0
  const truncated = Math.trunc(index)
  return ((truncated % paletteLength) + paletteLength) % paletteLength
}

export const resolveMaterialColorIndex = (index: MaterialColorIndex | null | undefined): number => {
  const palette = getActivePalette()
  return normalizePaletteIndex(index ?? 0, palette.colors.length)
}

export const getPaletteEntry = (index: MaterialColorIndex | null | undefined): PaletteEntry => {
  const palette = getActivePalette()
  if (palette.colors.length === 0) return FALLBACK_PALETTE_ENTRY
  return palette.colors[resolveMaterialColorIndex(index)]
}
