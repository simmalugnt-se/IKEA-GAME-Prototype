import type { AccelerationCurveName } from '@/utils/accelerationCurve'
import type { EasingName } from '@/utils/easing'

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

export const PALETTE_VARIANT_NAMES = ['classic', 'greyscale', 'green', 'test1', 'test2', 'test3'] as const
export const SMAA_PRESET_NAMES = ['low', 'medium', 'high', 'ultra'] as const
export const CAMERA_MODES = ['static', 'follow'] as const
export const CAMERA_FOLLOW_Z_CLAMP_MODES = ['always', 'tilingOnly', 'never'] as const
export const RENDER_STYLES = ['toon'] as const
export const CURSOR_INPUT_SOURCES = ['mouse', 'external'] as const
export const RUN_MODES = ['lives', 'time'] as const
export const HIGH_SCORE_STORAGE_MODES = ['local_storage', 'memory', 'database'] as const
export const HIGH_SCORE_DATABASE_FALLBACK_MODES = ['local_storage', 'memory'] as const
export const HIGH_SCORE_ENTRY_MODES = ['swipe_letters', 'alphabet_grid'] as const
export const BALLOON_DROP_TYPES = ['block', 'ball'] as const
export const SPAWN_ITEM_MARKERS = ['none', 'hazard', 'bonus'] as const
export const SPAWN_ITEM_SCORE_MODES = ['balloon_combo', 'direct'] as const
export const COMBO_BURST_LAYOUTS = ['line', 'bouquet'] as const
export const SPAWN_EVENT_TRIGGER_TYPES = ['combo_multiplier', 'pop_streak_without_miss'] as const
export const SPAWN_EVENT_ACTION_TYPES = ['spawn_burst', 'cursor_size_boost', 'spawn_ground_ball_wave', 'spawn_track_sweeper', 'cursor_burst_ring'] as const
export const SPAWN_EVENT_SELECTION_MODES = ['all', 'one_random'] as const
export const SPAWN_EVENT_BALL_SIZE_PRESETS = ['lg', 'md', 'sm', 'xs'] as const
export const GROUND_BALL_ENTRY_SIDES = ['top', 'right', 'bottom', 'left'] as const

export type PaletteVariantName = (typeof PALETTE_VARIANT_NAMES)[number]
export type SMAAPresetName = (typeof SMAA_PRESET_NAMES)[number]
export type CameraMode = (typeof CAMERA_MODES)[number]
export type CameraFollowZClampMode = (typeof CAMERA_FOLLOW_Z_CLAMP_MODES)[number]
export type RenderStyle = (typeof RENDER_STYLES)[number]
export type CursorInputSource = (typeof CURSOR_INPUT_SOURCES)[number]
export type GameRunMode = (typeof RUN_MODES)[number]
export type HighScoreStorageMode = (typeof HIGH_SCORE_STORAGE_MODES)[number]
export type HighScoreDatabaseFallbackMode = (typeof HIGH_SCORE_DATABASE_FALLBACK_MODES)[number]
export type HighScoreEntryMode = (typeof HIGH_SCORE_ENTRY_MODES)[number]
export type BalloonDropType = (typeof BALLOON_DROP_TYPES)[number]
export type SpawnItemMarker = (typeof SPAWN_ITEM_MARKERS)[number]
export type SpawnItemScoreMode = (typeof SPAWN_ITEM_SCORE_MODES)[number]
export type ComboBurstLayout = (typeof COMBO_BURST_LAYOUTS)[number]
export type SpawnEventTriggerType = (typeof SPAWN_EVENT_TRIGGER_TYPES)[number]
export type SpawnEventActionType = (typeof SPAWN_EVENT_ACTION_TYPES)[number]
export type SpawnEventSelectionMode = (typeof SPAWN_EVENT_SELECTION_MODES)[number]
export type SpawnEventBallSizePreset = (typeof SPAWN_EVENT_BALL_SIZE_PRESETS)[number]
export type GroundBallEntrySide = (typeof GROUND_BALL_ENTRY_SIDES)[number]

export type AxisMask = {
  x: boolean
  y: boolean
  z: boolean
}

export type WebSocketChannelSettings = {
  enabled: boolean
  url: string
  reconnectMs: number
}

export type SpawnItemDefinition = {
  id: string
  label: string
  enabled: boolean
  includeInDefaultPool: boolean
  minScoreToSpawn?: number
  weight: number
  weightAcceleration?: number
  weightAccelerationCurve?: AccelerationCurveName
  weightMaxMultiplier?: number
  maxConcurrent?: number
  maxConcurrentAcceleration?: number
  maxConcurrentAccelerationCurve?: AccelerationCurveName
  maxConcurrentCap?: number
  canTriggerSpawnEvents?: boolean
  itemMarker?: SpawnItemMarker
  color: MaterialColorIndex
  randomizeColor: boolean
  randomizeDropType: boolean
  dropType?: BalloonDropType
  lifeLossEnabled: boolean
  scoreMode: SpawnItemScoreMode
  scoreDelta: number
  timeDeltaMs: number
  feedbackText?: string
  triggerEventRuleId?: string
}

export type ComboBurstRuleEntry = {
  itemId: string
  count: number
}

export type SpawnEventTriggerComboMultiplier = {
  type: 'combo_multiplier'
  minMultiplier: number
  maxMultiplier?: number
  cooldownMs: number
}

export type SpawnEventTriggerPopStreakWithoutMiss = {
  type: 'pop_streak_without_miss'
  requiredPops: number
  cooldownMs: number
}

export type SpawnEventActionSpawnBurst = {
  type: 'spawn_burst'
  layout: ComboBurstLayout
  spawnXOffset: number
  spacingX: number
  spacingY: number
  randomXJitter: number
  randomYJitter: number
  entries: ComboBurstRuleEntry[]
}

export type SpawnEventActionCursorSizeBoost = {
  type: 'cursor_size_boost'
  scaleMultiplier: number
  durationMs: number
  easeInMs: number
  easeOutMs: number
  feedbackText?: string
}

export type SpawnEventActionGroundBallWave = {
  type: 'spawn_ground_ball_wave'
  count: number
  ballSizePreset: SpawnEventBallSizePreset
  colorIndices: MaterialColorIndex[]
  entrySides: GroundBallEntrySide[]
  edgeInset: number
  spawnPadding: number
  speed: number
  speedJitter: number
  angleJitterDeg: number
  mass?: number
  friction?: number
  restitution?: number
  linearDamping?: number
  angularDamping?: number
  lifetimeMs: number
  feedbackText?: string
}

export type SpawnEventActionTrackSweeper = {
  type: 'spawn_track_sweeper'
  colorIndex: MaterialColorIndex
  entrySides: GroundBallEntrySide[]
  radius: number
  length?: number
  spanPadding: number
  spawnPadding: number
  speed: number
  rollAngularSpeedMultiplier: number
  friction?: number
  restitution?: number
  linearDamping?: number
  angularDamping?: number
  lifetimeMs: number
  feedbackText?: string
}

export type SpawnEventActionCursorBurstRing = {
  type: 'cursor_burst_ring'
  probeCount: number
  orbitRadiusPx: number
  probeRadiusPx: number
  rotationSpeedDeg: number
  burstIntervalMs?: number
  travelSpeedPx?: number
  durationMs: number
  easeInMs: number
  easeOutMs: number
  feedbackText?: string
}

export type SpawnEventTrigger =
  | SpawnEventTriggerComboMultiplier
  | SpawnEventTriggerPopStreakWithoutMiss
export type SpawnEventAction =
  | SpawnEventActionSpawnBurst
  | SpawnEventActionCursorSizeBoost
  | SpawnEventActionGroundBallWave
  | SpawnEventActionTrackSweeper
  | SpawnEventActionCursorBurstRing

export type SpawnEventRule = {
  id: string
  enabled: boolean
  selectionWeight?: number
  trigger: SpawnEventTrigger
  action: SpawnEventAction
}

export type Settings = {
  render: {
    style: RenderStyle
  }
  scoreboard: {
    websocket: WebSocketChannelSettings
    ui: {
      showEventLog: boolean
    }
  }
  debug: {
    enabled: boolean
    showColliders: boolean
    showStats: boolean
    showGrid: boolean
    showCameraFrustum: boolean
    showDebugCamera: boolean
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
    }
    run: {
      mode: GameRunMode
      timeLimitMs: number
      comboTimeBonusStepMs: number
      popStreakTimeBonusEveryPops: number
      popStreakTimeBonusMs: number
      timeBonusLerpMs: number
      pulseSlowStartMs: number
      pulseFastStartMs: number
    }
    highScore: {
      storageMode: HighScoreStorageMode
      maxEntries: number
      localStorageKey: string
      databaseApiBaseUrl: string
      databaseFallbackMode: HighScoreDatabaseFallbackMode
    }
    flow: {
      gameOverInputInactivityMs: number
      gameOverInputCountdownMs: number
      highScoreEntryMode: HighScoreEntryMode
      highScoreEntrySwipe: {
        letterMinVelocityPx: number
        letterMinDistancePx: number
        letterCooldownMs: number
        buttonDwellMs: number
        buttonDwellJitterGraceMs: number
      }
      gameOverTravelSpeedMultiplier: number
      gameOverTravelSpeedEaseInMs: number
      gameOverTravelSpeedEaseInEasing: EasingName
    }
    balloons: {
      scorePerPop: number
      sensors: {
        lifeMargin: number
        cleanupMargin: number
      }
      popRelease: {
        linearSpeedMin: number
        linearSpeedMax: number
        linearSpeedVelocityRangeMaxPx: number
        curve: AccelerationCurveName
      }
      combo: {
        enabled: boolean
        strikeWindowMs: number
        chainWindowMs: number
        chainBonusCap: number
      }
    }
  }
  level: {
    defaultFile: string
    gridClonerSpawnChunkSize: number
    tiling: {
      enabled: boolean
      runFiles: string[]
      idleFiles: string[]
      gameOverFiles: string[]
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
    /** Center offset for random x spawn band relative to spawn marker */
    spawnXRangeOffset: number
    /** Units past the cull line before the item is actually removed */
    cullOffset: number
    eventSelectionMode: SpawnEventSelectionMode
    eventQueueEnabled: boolean
    eventQueueGapMs: number
    eventQueueMaxLength: number
    itemDefinitions: SpawnItemDefinition[]
    eventRules: SpawnEventRule[]
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
    inputSource: CursorInputSource
    /** Minimum cursor speed in px/s required to pop a balloon on hover */
    minPopVelocity: number
    /**
     * Screen-space radius of the cursor head (filled circle) in CSS pixels.
     * Trail thickness is controlled separately by `trail.lineWidth`.
     * Balloon pop tests expand the target ellipse by this amount in screen space.
     */
    pointerRadiusPx: number
    external: {
      enabled: boolean
      websocket: {
        url: string
        reconnectMs: number
      }
      staleTimeoutMs: number
      maxPointers: number
      alphabetGridEntryMaxPointers: number
    }
    trail: {
      /** How long (in seconds) trail points persist before fading out */
      maxAge: number
      color: string
      /** Line width in pixels */
      lineWidth: number
      /** Visual trail follow smoothing: 0 = raw head positions, 1 = strongest lagged trail */
      followSmoothing: number
      /** Curve smoothing: 0 = tight polyline, 1 = fully smoothed quadratic curve */
      smoothing: number
    }
  }
}
