import * as THREE from 'three'

export type Vec3 = [number, number, number]

export type PaletteTone = 'one' | 'two' | 'three' | 'four' | 'five'
export type PaletteName = PaletteTone | 'default'

export type PaletteEntry = {
  base: string
  mid?: string
}

export type PaletteDefinition = Record<PaletteName, PaletteEntry>
export type PaletteVariant = PaletteDefinition & { background: string }

export type PaletteAutoMidSettings = {
  enabled: boolean
  lightnessDelta: number
  chromaDelta: number
  hueShift: number
}

export type PaletteVariantName = 'classic' | 'pine' | 'green'

type Settings = {
  debug: {
    enabled: boolean
    showColliders: boolean
    showStats: boolean
    streaming: {
      enabled: boolean
      showRadii: boolean
      showChunkBounds: boolean
      showAllChunkBounds: boolean
    }
    benchmark: {
      enabled: boolean
      gridX: number
      gridZ: number
      layers: number
      spacing: number
      heightStep: number
      origin: Vec3
      usePhysics: boolean
      fixedColliderEvery: number
    }
  }
  streaming: {
    enabled: boolean
    cellSize: number
    updateIntervalMs: number
    preloadRadius: number
    renderLoadRadius: number
    renderUnloadRadius: number
    physicsLoadRadius: number
    physicsUnloadRadius: number
  }
  colors: {
    shadow: string
    outline: string
  }
  palette: {
    active: PaletteVariantName
    variants: Record<PaletteVariantName, PaletteVariant>
    autoMid: PaletteAutoMidSettings
  }
  lines: {
    enabled: boolean
    thickness: number
    creaseAngle: number
    threshold: number
  }
  camera: {
    zoom: number
    position: Vec3
    near: number
    far: number
    followLerp: number
  }
  light: {
    position: Vec3
    intensity: number
    shadowMapSize: number
    shadowBias: number
    shadowNormalBias: number
    shadowArea: number
  }
  material: {
    highlightStep: number
    midtoneStep: number
    castMidtoneStep: number
    castShadowStep: number
  }
  player: {
    impulseStrength: number
    jumpStrength: number
    linearDamping: number
    angularDamping: number
    mass: number
    friction: number
  }
}

export const SETTINGS: Settings = {
  // --- DEBUG ---
  debug: {
    enabled: false,        // Master-toggle för allt debug
    showColliders: true,  // Visa fysik-kollisions-proxys (wireframe)
    showStats: true,      // Visa FPS / MS / MB
    streaming: {
      enabled: true,      // Visa streaming-debug i scenen
      showRadii: true,     // Visar preload/render/physics-radier runt spelaren
      showChunkBounds: true, // Visar chunk-gridfärger för aktiva zoner
      showAllChunkBounds: true, // Om true: visar alla chunk-rutor (mycket brus)
    },
    benchmark: {
      enabled: false,      // Aktivera tung benchmark-scen (många auto-genererade objekt)
      gridX: 20,           // Antal objekt i X-led
      gridZ: 20,           // Antal objekt i Z-led
      layers: 2,           // Antal vertikala lager
      spacing: 1.25,       // Avstånd mellan benchmark-objekt
      heightStep: 0.45,    // Höjdskillnad mellan lager
      origin: [-12, 0, -12], // Startposition för benchmark-grid
      usePhysics: false,   // Om true: vissa benchmark-objekt får fixed physics
      fixedColliderEvery: 4, // Var N:te objekt får fixed physics när usePhysics=true
    },
  },

  // --- STREAMING (Automatisk chunk-aktivering) ---
  streaming: {
    enabled: true,        // Master-toggle för streaming av auto-genererade/world-objekt
    cellSize: 8,           // Storlek på varje chunk-cell i world-units
    updateIntervalMs: 120, // Hur ofta chunk-aktivering uppdateras
    preloadRadius: 26,     // Chunks inom denna radie markeras som preload
    renderLoadRadius: 20,  // Chunks laddas in visuellt inom denna radie
    renderUnloadRadius: 24, // Chunks tas bort visuellt först utanför denna radie
    physicsLoadRadius: 14, // Physics aktiveras inom denna radie
    physicsUnloadRadius: 18, // Physics stängs av först utanför denna radie
  },

  // --- FÄRGER ---
  colors: {
    shadow: '#141414',     // Färgen på skuggan (används av golvet och C4DMaterial)
    outline: '#141414',    // Färgen på outlines (oftast samma som skugga)
  },

  // --- FÄRGPALETT (Toon Material) ---
  palette: {
    active: 'green',
    variants: {
      classic: {
        background: '#3D2C23',
        one: { base: '#45253A' },
        two: { base: '#558DCE' },
        three: { base: '#D9B5A3' },
        four: { base: '#665747' },
        five: { base: '#FF2D19' },
        default: { base: '#45253A' },
      },
      pine: {
        background: '#2F3B2A',
        one: { base: '#44553A' },
        two: { base: '#5A8C7A' },
        three: { base: '#D8C29A' },
        four: { base: '#6D5A45' },
        five: { base: '#C35C3B' },
        default: { base: '#44553A' },
      },
      green: {
        background: '#0E3420',
        one: { base: '#669E10' },
        two: { base: '#006B18' },
        three: { base: '#e7e1d7' },
        four: { base: '#007FB5' },
        five: { base: '#C96C05' },
        default: { base: '#006B18' },
      },
    },
    autoMid: {
      enabled: true,        // Auto-generera mid från base om mid saknas i paletten
      lightnessDelta: -0.06, // Negativt = mörkare midtone
      chromaDelta: -0.002,   // Negativt = lite mindre mättnad, positivt = mer punch
      hueShift: -4,          // Negativt = vrider mot kallare toner i denna setup
    },
  },

  // --- LINJER (Outlines & Creases) ---
  lines: {
    enabled: true,
    thickness: 1,     // Tjocklek i pixlar
    creaseAngle: 30,    // Vinkel i grader för inre linjer (30 = teknisk look)
    threshold: 0.01,    // Känslighet (rör ej)
  },

  // --- KAMERA ---
  camera: {
    zoom: 300,
    position: [5, 5, 5],
    near: 0.1,
    far: 2000,
    followLerp: 0.025, // Kamera-drag (0.01=trögt, 0.1=snappigt)
  },

  // --- LJUS (Påverkar skuggor & material) ---
  light: {
    position: [0, 2.0, 5],
    intensity: 1,
    shadowMapSize: 4096, // 4096 = Skarpast skuggor
    shadowBias: 0,      // Mycket liten bias (så skuggan sitter fast i objektet)
    shadowNormalBias: -0.001,   // Denna fixar ränderna på bollen! (Prova 0.02 - 0.1)
    shadowArea: 4,       // Tight frustum runt spelaren (följer med)
  },

  // --- MATERIAL (Toon Shading) ---
  material: {
    highlightStep: 0.6, // Gräns för ljusaste zonen
    midtoneStep: -1,   // Gräns för mellantonen
    castMidtoneStep: 0.2, // Start för cast-shadow midtone (0 = ingen skugga, 1 = full skugga)
    castShadowStep: 0.6,  // Start för cast-shadow mörkaste zon
  },

  // --- SPELARFYSIK ---
  player: {
    impulseStrength: 0.02, // Hur hårt bollen knuffas
    jumpStrength: 0.08,       // Hur högt bollen hoppar
    linearDamping: 1.5,      // Luftmotstånd (bromsar farten framåt)
    angularDamping: 2.0,     // Rotationsmotstånd (bromsar rullandet)
    mass: 0.1,               // Bollens tyngd
    friction: 1.5,           // Grepp mot underlaget
  },
}

// Hjälpfunktion för att få ljusets position som en Vector3
export const getLightDir = () => {
  return new THREE.Vector3(...SETTINGS.light.position).normalize()
}

export const getActivePalette = (): PaletteDefinition => {
  return SETTINGS.palette.variants[SETTINGS.palette.active]
}

export const getActiveBackground = (): string => {
  return SETTINGS.palette.variants[SETTINGS.palette.active].background
}
