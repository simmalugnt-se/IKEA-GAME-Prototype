import * as THREE from 'three'

export const SETTINGS = {
  // --- DEBUG ---
  debug: {
    enabled: true,        // Master-toggle för allt debug
    showColliders: true,  // Visa fysik-kollisions-proxys (wireframe)
    showStats: true,      // Visa FPS / MS / MB
  },

  // --- FÄRGER ---
  colors: {
    background: '#3D2C23', // Hemsidans/Canvasens bakgrund
    shadow: '#141414',     // Färgen på skuggan (används av golvet och C4DMaterial)
    outline: '#141414',    // Färgen på outlines (oftast samma som skugga)
  },

  // --- FÄRGPALETT (Toon Material) ---
  palette: (() => {
    const p = {
      one: { base: '#45253A', mid: '#3C1F33' },
      two: { base: '#558DCE', mid: '#4781C6' },
      three: { base: '#D9B5A3', mid: '#B38F7D' },
      four: { base: '#665747', mid: '#59443A' },
      five: { base: '#FF2D19', mid: '#E52233' },
    }
    p.default = p.one
    return p
  })(),

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
    midtoneStep: 0.1,   // Gräns för mellantonen
  },

  // --- SPELARFYSIK ---
  player: {
    impulseStrength: .02, // Hur hårt bollen knuffas
    jumpStrength: 0.08,       // Hur högt bollen hoppar
    linearDamping: 1.5,      // Luftmotstånd (bromsar farten framåt)
    angularDamping: 2.0,     // Rotationsmotstånd (bromsar rullandet)
    mass: .1,               // Bollens tyngd
    friction: 1.5,           // Grepp mot underlaget
  },
}


// Hjälpfunktion för att få ljusets position som en Vector3
export const getLightDir = () => {
  return new THREE.Vector3(...SETTINGS.light.position).normalize()
}