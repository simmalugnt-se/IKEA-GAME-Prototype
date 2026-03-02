import type { AccelerationCurveName } from '@/utils/accelerationCurve'

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
export const CAMERA_FOLLOW_Z_CLAMP_MODES = ['always', 'tilingOnly', 'never'] as const
export const STREAMING_CENTER_SOURCES = ['target', 'cameraFocus'] as const
export const RENDER_STYLES = ['toon', 'pixel', 'retroPixelPass'] as const
export const CONTROL_INPUT_SOURCES = ['keyboard', 'external', 'hybrid'] as const
export const EXTERNAL_CONTROL_MODES = ['digital', 'absolute'] as const

export type PaletteVariantName = (typeof PALETTE_VARIANT_NAMES)[number]
export type SMAAPresetName = (typeof SMAA_PRESET_NAMES)[number]
export type CameraMode = (typeof CAMERA_MODES)[number]
export type CameraFollowZClampMode = (typeof CAMERA_FOLLOW_Z_CLAMP_MODES)[number]
export type StreamingCenterSource = (typeof STREAMING_CENTER_SOURCES)[number]
export type RenderStyle = (typeof RENDER_STYLES)[number]
export type ControlInputSource = (typeof CONTROL_INPUT_SOURCES)[number]
export type ExternalControlMode = (typeof EXTERNAL_CONTROL_MODES)[number]

export type SoundCategorySettings = {
  files: string[]
  volume: number
}

export type SwooshSoundSettings = SoundCategorySettings & {
  minVelocity: number
  maxVelocity: number
  cooldownMs: number
}

export type SoundSettings = {
  enabled: boolean
  pop: SoundCategorySettings
  felt: SoundCategorySettings
  steel: SoundCategorySettings
  error: SoundCategorySettings
  bee: SoundCategorySettings
  swoosh: SwooshSoundSettings
}

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
    showGrid: boolean
    showCameraFrustum: boolean
    showDebugCamera: boolean
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
      zClampMode: CameraFollowZClampMode
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
    shadingDirection: Vec3
    shadowFollowsLight: boolean
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
  gameplay: {
    contagion: {
      enabled: boolean
      scorePerInfection: number
    }
    score: {
      lockOnGameOver: boolean
      resetOnRunEnd: boolean
      resetOnGameOver: boolean
    }
    lives: {
      initial: number
      lossPerMiss: number
      autoReset: boolean
    }
    balloons: {
      scorePerPop: number
      sensors: {
        lifeMargin: number
        cleanupMargin: number
      }
    }
  }
  level: {
    defaultFile: string
    gridClonerSpawnChunkSize: number
    tiling: {
      enabled: boolean
      files: string[]
      lookAheadDistance: number
      cullBehindDistance: number
    }
    liveSync: {
      enabled: boolean
      url: string
      reconnectMs: number
    }
  }
  spawner: {
    enabled: boolean
    spawnIntervalMs: number
    speed: number
    speedVariance: number
    radius: number
    maxItems: number
    spawnAcceleration: number
    spawnAccelerationCurve: AccelerationCurveName
    maxItemsAcceleration: number
    maxItemsAccelerationCurve: AccelerationCurveName
    maxItemsCap: number
    /** Half-width for random x offset along the spawn marker line */
    spawnXRange: number
    /** Units past the cull line before the item is actually removed */
    cullOffset: number
  }
  motionAcceleration: {
    cameraTracker: {
      timeScaleAcceleration: number
      timeScaleAccelerationCurve: AccelerationCurveName
    }
    balloons: {
      timeScaleAcceleration: number
      timeScaleAccelerationCurve: AccelerationCurveName
    }
  }
  cursor: {
    /** Minimum cursor speed in px/s required to pop a balloon on hover */
    minPopVelocity: number
    trail: {
      /** How long (in seconds) trail points persist before fading out */
      maxAge: number
      color: string
      /** Line width in pixels */
      lineWidth: number
      /** Curve smoothing: 0 = tight polyline, 1 = fully smoothed quadratic curve */
      smoothing: number
    }
  }
  sounds: SoundSettings
}
