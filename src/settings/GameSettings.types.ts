export type Vec3 = [number, number, number]

export type MaterialColorIndex = number

export type PaletteEntry = {
  base: string
  mid?: string
}

export type PaletteVariant = {
  background: string
  colors: PaletteEntry[]
}

export type PaletteAutoMidSettings = {
  enabled: boolean
  lightnessDelta: number
  chromaDelta: number
  hueShift: number
}

export const PALETTE_VARIANT_NAMES = ['classic', 'greyscale', 'green'] as const
export const SMAA_PRESET_NAMES = ['low', 'medium', 'high', 'ultra'] as const
export const CAMERA_MODES = ['static', 'follow'] as const
export const STREAMING_CENTER_SOURCES = ['target', 'cameraFocus'] as const
export const RENDER_STYLES = ['toon', 'pixel', 'retroPixelPass'] as const
export const CONTROL_INPUT_SOURCES = ['keyboard', 'external', 'hybrid'] as const
export const EXTERNAL_CONTROL_MODES = ['digital', 'absolute'] as const

export type PaletteVariantName = (typeof PALETTE_VARIANT_NAMES)[number]
export type SMAAPresetName = (typeof SMAA_PRESET_NAMES)[number]
export type CameraMode = (typeof CAMERA_MODES)[number]
export type StreamingCenterSource = (typeof STREAMING_CENTER_SOURCES)[number]
export type RenderStyle = (typeof RENDER_STYLES)[number]
export type ControlInputSource = (typeof CONTROL_INPUT_SOURCES)[number]
export type ExternalControlMode = (typeof EXTERNAL_CONTROL_MODES)[number]

export type AxisMask = {
  x: boolean
  y: boolean
  z: boolean
}

export type Settings = {
  render: {
    style: RenderStyle
  }
  controls: {
    inputSource: ControlInputSource
    external: {
      mode: ExternalControlMode
      staleTimeoutMs: number
      absolute: {
        followLerp: number
        maxUnitsPerSecond: number
        maxTargetStep: number
      }
      websocket: {
        enabled: boolean
        url: string
        reconnectMs: number
      }
    }
  }
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
    center: {
      source: StreamingCenterSource
      targetId: string
    }
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
    composerMultisampling: number
    smaaEnabled: boolean
    smaaPreset: SMAAPresetName
  }
  pixelation: {
    enabled: boolean
    granularity: number
  }
  retroPixelPass: {
    pixelSize: number
    normalEdgeStrength: number
    depthEdgeStrength: number
    depthEdgeThresholdMin: number
    depthEdgeThresholdMax: number
  }
  camera: {
    mode: CameraMode
    base: {
      zoom: number
      near: number
      far: number
    }
    static: {
      position: Vec3
      lookAt: Vec3
    }
    follow: {
      targetId: string
      offset: Vec3
      lookAtOffset: Vec3
      followLerp: number
      lookAtLerp: number
      lockRotation: boolean
      followAxes: AxisMask
      lookAtAxes: AxisMask
      moveLightWithTarget: boolean
    }
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
  level: {
    defaultFile: string
    liveSync: {
      enabled: boolean
      url: string
      reconnectMs: number
    }
  }
}
