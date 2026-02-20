import { useControls, folder, button } from 'leva'
import { useEffect, useRef, useState } from 'react'
import { SETTINGS } from '@/settings/GameSettings'
import { bump } from '@/settings/settingsStore'
import {
  savePreset,
  loadPresetFromFile,
  loadBundledPreset,
  fetchPresetManifest,
} from '@/settings/presets'
import { useLevelStore } from '@/levelStore'

// Stores leva set-functions so we can update the panel after loading a preset
type SetterMap = Record<string, (value: Record<string, unknown>) => void>
const setters: SetterMap = {}

function registerSetter(key: string, set: (value: Record<string, unknown>) => void) {
  setters[key] = set
}

/**
 * Push current SETTINGS values back into every leva panel.
 * Called after applying a preset so the UI reflects the new values.
 */
function syncLevaFromSettings() {
  setters['Render']?.({ style: SETTINGS.render.style })

  setters['Controls']?.({
    inputSource: SETTINGS.controls.inputSource,
    'external.mode': SETTINGS.controls.external.mode,
    'external.staleTimeoutMs': SETTINGS.controls.external.staleTimeoutMs,
    'external.absolute.followLerp': SETTINGS.controls.external.absolute.followLerp,
    'external.absolute.maxUnitsPerSecond': SETTINGS.controls.external.absolute.maxUnitsPerSecond,
    'external.absolute.maxTargetStep': SETTINGS.controls.external.absolute.maxTargetStep,
    'external.websocket.enabled': SETTINGS.controls.external.websocket.enabled,
    'external.websocket.url': SETTINGS.controls.external.websocket.url,
    'external.websocket.reconnectMs': SETTINGS.controls.external.websocket.reconnectMs,
  })

  setters['Debug']?.({
    enabled: SETTINGS.debug.enabled,
    showColliders: SETTINGS.debug.showColliders,
    showStats: SETTINGS.debug.showStats,
    'streaming.enabled': SETTINGS.debug.streaming.enabled,
    'streaming.showRadii': SETTINGS.debug.streaming.showRadii,
    'streaming.showChunkBounds': SETTINGS.debug.streaming.showChunkBounds,
    'streaming.showAllChunkBounds': SETTINGS.debug.streaming.showAllChunkBounds,
    'benchmark.enabled': SETTINGS.debug.benchmark.enabled,
    'benchmark.gridX': SETTINGS.debug.benchmark.gridX,
    'benchmark.gridZ': SETTINGS.debug.benchmark.gridZ,
    'benchmark.layers': SETTINGS.debug.benchmark.layers,
    'benchmark.spacing': SETTINGS.debug.benchmark.spacing,
    'benchmark.heightStep': SETTINGS.debug.benchmark.heightStep,
    'benchmark.originX': SETTINGS.debug.benchmark.origin[0],
    'benchmark.originY': SETTINGS.debug.benchmark.origin[1],
    'benchmark.originZ': SETTINGS.debug.benchmark.origin[2],
    'benchmark.usePhysics': SETTINGS.debug.benchmark.usePhysics,
    'benchmark.fixedColliderEvery': SETTINGS.debug.benchmark.fixedColliderEvery,
  })

  setters['Streaming']?.({
    enabled: SETTINGS.streaming.enabled,
    cellSize: SETTINGS.streaming.cellSize,
    updateIntervalMs: SETTINGS.streaming.updateIntervalMs,
    preloadRadius: SETTINGS.streaming.preloadRadius,
    renderLoadRadius: SETTINGS.streaming.renderLoadRadius,
    renderUnloadRadius: SETTINGS.streaming.renderUnloadRadius,
    physicsLoadRadius: SETTINGS.streaming.physicsLoadRadius,
    physicsUnloadRadius: SETTINGS.streaming.physicsUnloadRadius,
    'center.source': SETTINGS.streaming.center.source,
    'center.targetId': SETTINGS.streaming.center.targetId,
  })

  setters['Colors']?.({
    shadow: SETTINGS.colors.shadow,
    outline: SETTINGS.colors.outline,
  })

  setters['Palette']?.({
    active: SETTINGS.palette.active,
    'autoMid.enabled': SETTINGS.palette.autoMid.enabled,
    'autoMid.lightnessDelta': SETTINGS.palette.autoMid.lightnessDelta,
    'autoMid.chromaDelta': SETTINGS.palette.autoMid.chromaDelta,
    'autoMid.hueShift': SETTINGS.palette.autoMid.hueShift,
  })

  setters['Lines']?.({
    enabled: SETTINGS.lines.enabled,
    thickness: SETTINGS.lines.thickness,
    creaseAngle: SETTINGS.lines.creaseAngle,
    threshold: SETTINGS.lines.threshold,
    composerMultisampling: SETTINGS.lines.composerMultisampling,
    smaaEnabled: SETTINGS.lines.smaaEnabled,
    smaaPreset: SETTINGS.lines.smaaPreset,
  })

  setters['Pixelation']?.({
    enabled: SETTINGS.pixelation.enabled,
    granularity: SETTINGS.pixelation.granularity,
  })

  setters['RetroPixelPass']?.({
    pixelSize: SETTINGS.retroPixelPass.pixelSize,
    normalEdgeStrength: SETTINGS.retroPixelPass.normalEdgeStrength,
    depthEdgeStrength: SETTINGS.retroPixelPass.depthEdgeStrength,
    depthEdgeThresholdMin: SETTINGS.retroPixelPass.depthEdgeThresholdMin,
    depthEdgeThresholdMax: SETTINGS.retroPixelPass.depthEdgeThresholdMax,
  })

  setters['Camera']?.({
    mode: SETTINGS.camera.mode,
    'base.zoom': SETTINGS.camera.base.zoom,
    'base.near': SETTINGS.camera.base.near,
    'base.far': SETTINGS.camera.base.far,
    'static.posX': SETTINGS.camera.static.position[0],
    'static.posY': SETTINGS.camera.static.position[1],
    'static.posZ': SETTINGS.camera.static.position[2],
    'static.lookAtX': SETTINGS.camera.static.lookAt[0],
    'static.lookAtY': SETTINGS.camera.static.lookAt[1],
    'static.lookAtZ': SETTINGS.camera.static.lookAt[2],
    'follow.targetId': SETTINGS.camera.follow.targetId,
    'follow.offsetX': SETTINGS.camera.follow.offset[0],
    'follow.offsetY': SETTINGS.camera.follow.offset[1],
    'follow.offsetZ': SETTINGS.camera.follow.offset[2],
    'follow.lookAtOffsetX': SETTINGS.camera.follow.lookAtOffset[0],
    'follow.lookAtOffsetY': SETTINGS.camera.follow.lookAtOffset[1],
    'follow.lookAtOffsetZ': SETTINGS.camera.follow.lookAtOffset[2],
    'follow.followLerp': SETTINGS.camera.follow.followLerp,
    'follow.lookAtLerp': SETTINGS.camera.follow.lookAtLerp,
    'follow.lockRotation': SETTINGS.camera.follow.lockRotation,
    'follow.followAxes.x': SETTINGS.camera.follow.followAxes.x,
    'follow.followAxes.y': SETTINGS.camera.follow.followAxes.y,
    'follow.followAxes.z': SETTINGS.camera.follow.followAxes.z,
    'follow.lookAtAxes.x': SETTINGS.camera.follow.lookAtAxes.x,
    'follow.lookAtAxes.y': SETTINGS.camera.follow.lookAtAxes.y,
    'follow.lookAtAxes.z': SETTINGS.camera.follow.lookAtAxes.z,
    'follow.moveLightWithTarget': SETTINGS.camera.follow.moveLightWithTarget,
  })

  setters['Light']?.({
    posX: SETTINGS.light.position[0],
    posY: SETTINGS.light.position[1],
    posZ: SETTINGS.light.position[2],
    intensity: SETTINGS.light.intensity,
    shadowMapSize: SETTINGS.light.shadowMapSize,
    shadowBias: SETTINGS.light.shadowBias,
    shadowNormalBias: SETTINGS.light.shadowNormalBias,
    shadowArea: SETTINGS.light.shadowArea,
  })

  setters['Material']?.({
    highlightStep: SETTINGS.material.highlightStep,
    midtoneStep: SETTINGS.material.midtoneStep,
    castMidtoneStep: SETTINGS.material.castMidtoneStep,
    castShadowStep: SETTINGS.material.castShadowStep,
  })

  setters['Player']?.({
    impulseStrength: SETTINGS.player.impulseStrength,
    jumpStrength: SETTINGS.player.jumpStrength,
    linearDamping: SETTINGS.player.linearDamping,
    angularDamping: SETTINGS.player.angularDamping,
    mass: SETTINGS.player.mass,
    friction: SETTINGS.player.friction,
  })

  setters['Level']?.({
    'liveSync.enabled': SETTINGS.level.liveSync.enabled,
    'liveSync.url': SETTINGS.level.liveSync.url,
    'liveSync.reconnectMs': SETTINGS.level.liveSync.reconnectMs,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// Section hooks – each one owns a leva folder for its Settings section
// ═══════════════════════════════════════════════════════════════════════════

function useRenderControls() {
  const [, set] = useControls('Render', () => ({
    style: {
      value: SETTINGS.render.style,
      options: ['toon', 'pixel', 'retroPixelPass'] as const,
      onChange: (v: string) => { SETTINGS.render.style = v as typeof SETTINGS.render.style; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('Render', set) }, [set])
}

function useControlsControls() {
  const [, set] = useControls('Controls', () => ({
    inputSource: {
      value: SETTINGS.controls.inputSource,
      options: ['keyboard', 'external', 'hybrid'] as const,
      onChange: (v: string) => { SETTINGS.controls.inputSource = v as typeof SETTINGS.controls.inputSource; bump() },
    },
    external: folder({
      mode: {
        value: SETTINGS.controls.external.mode,
        options: ['digital', 'absolute'] as const,
        onChange: (v: string) => { SETTINGS.controls.external.mode = v as typeof SETTINGS.controls.external.mode; bump() },
      },
      staleTimeoutMs: {
        value: SETTINGS.controls.external.staleTimeoutMs, min: 0, max: 2000, step: 10,
        onChange: (v: number) => { SETTINGS.controls.external.staleTimeoutMs = v; bump() },
      },
      absolute: folder({
        followLerp: {
          value: SETTINGS.controls.external.absolute.followLerp, min: 0, max: 1, step: 0.01,
          onChange: (v: number) => { SETTINGS.controls.external.absolute.followLerp = v; bump() },
        },
        maxUnitsPerSecond: {
          value: SETTINGS.controls.external.absolute.maxUnitsPerSecond, min: 0, max: 50, step: 0.5,
          onChange: (v: number) => { SETTINGS.controls.external.absolute.maxUnitsPerSecond = v; bump() },
        },
        maxTargetStep: {
          value: SETTINGS.controls.external.absolute.maxTargetStep, min: 0, max: 5, step: 0.05,
          onChange: (v: number) => { SETTINGS.controls.external.absolute.maxTargetStep = v; bump() },
        },
      }),
      websocket: folder({
        enabled: {
          value: SETTINGS.controls.external.websocket.enabled,
          onChange: (v: boolean) => { SETTINGS.controls.external.websocket.enabled = v; bump() },
        },
        url: {
          value: SETTINGS.controls.external.websocket.url,
          onChange: (v: string) => { SETTINGS.controls.external.websocket.url = v; bump() },
        },
        reconnectMs: {
          value: SETTINGS.controls.external.websocket.reconnectMs, min: 100, max: 10000, step: 100,
          onChange: (v: number) => { SETTINGS.controls.external.websocket.reconnectMs = v; bump() },
        },
      }),
    }),
  }), { collapsed: true })
  useEffect(() => { registerSetter('Controls', set) }, [set])
}

function useDebugControls() {
  const [, set] = useControls('Debug', () => ({
    enabled: {
      value: SETTINGS.debug.enabled,
      onChange: (v: boolean) => { SETTINGS.debug.enabled = v; bump() },
    },
    showColliders: {
      value: SETTINGS.debug.showColliders,
      onChange: (v: boolean) => { SETTINGS.debug.showColliders = v; bump() },
    },
    showStats: {
      value: SETTINGS.debug.showStats,
      onChange: (v: boolean) => { SETTINGS.debug.showStats = v; bump() },
    },
    streaming: folder({
      enabled: {
        value: SETTINGS.debug.streaming.enabled,
        onChange: (v: boolean) => { SETTINGS.debug.streaming.enabled = v; bump() },
      },
      showRadii: {
        value: SETTINGS.debug.streaming.showRadii,
        onChange: (v: boolean) => { SETTINGS.debug.streaming.showRadii = v; bump() },
      },
      showChunkBounds: {
        value: SETTINGS.debug.streaming.showChunkBounds,
        onChange: (v: boolean) => { SETTINGS.debug.streaming.showChunkBounds = v; bump() },
      },
      showAllChunkBounds: {
        value: SETTINGS.debug.streaming.showAllChunkBounds,
        onChange: (v: boolean) => { SETTINGS.debug.streaming.showAllChunkBounds = v; bump() },
      },
    }),
    benchmark: folder({
      enabled: {
        value: SETTINGS.debug.benchmark.enabled,
        onChange: (v: boolean) => { SETTINGS.debug.benchmark.enabled = v; bump() },
      },
      gridX: {
        value: SETTINGS.debug.benchmark.gridX, min: 1, max: 100, step: 1,
        onChange: (v: number) => { SETTINGS.debug.benchmark.gridX = v; bump() },
      },
      gridZ: {
        value: SETTINGS.debug.benchmark.gridZ, min: 1, max: 100, step: 1,
        onChange: (v: number) => { SETTINGS.debug.benchmark.gridZ = v; bump() },
      },
      layers: {
        value: SETTINGS.debug.benchmark.layers, min: 1, max: 20, step: 1,
        onChange: (v: number) => { SETTINGS.debug.benchmark.layers = v; bump() },
      },
      spacing: {
        value: SETTINGS.debug.benchmark.spacing, min: 0.1, max: 10, step: 0.05,
        onChange: (v: number) => { SETTINGS.debug.benchmark.spacing = v; bump() },
      },
      heightStep: {
        value: SETTINGS.debug.benchmark.heightStep, min: 0.01, max: 5, step: 0.01,
        onChange: (v: number) => { SETTINGS.debug.benchmark.heightStep = v; bump() },
      },
      originX: {
        value: SETTINGS.debug.benchmark.origin[0], min: -50, max: 50, step: 0.5,
        onChange: (v: number) => { SETTINGS.debug.benchmark.origin[0] = v; bump() },
      },
      originY: {
        value: SETTINGS.debug.benchmark.origin[1], min: -50, max: 50, step: 0.5,
        onChange: (v: number) => { SETTINGS.debug.benchmark.origin[1] = v; bump() },
      },
      originZ: {
        value: SETTINGS.debug.benchmark.origin[2], min: -50, max: 50, step: 0.5,
        onChange: (v: number) => { SETTINGS.debug.benchmark.origin[2] = v; bump() },
      },
      usePhysics: {
        value: SETTINGS.debug.benchmark.usePhysics,
        onChange: (v: boolean) => { SETTINGS.debug.benchmark.usePhysics = v; bump() },
      },
      fixedColliderEvery: {
        value: SETTINGS.debug.benchmark.fixedColliderEvery, min: 1, max: 50, step: 1,
        onChange: (v: number) => { SETTINGS.debug.benchmark.fixedColliderEvery = v; bump() },
      },
    }),
  }), { collapsed: true })
  useEffect(() => { registerSetter('Debug', set) }, [set])
}

function useStreamingControls() {
  const [, set] = useControls('Streaming', () => ({
    enabled: {
      value: SETTINGS.streaming.enabled,
      onChange: (v: boolean) => { SETTINGS.streaming.enabled = v; bump() },
    },
    cellSize: {
      value: SETTINGS.streaming.cellSize, min: 1, max: 64, step: 1,
      onChange: (v: number) => { SETTINGS.streaming.cellSize = v; bump() },
    },
    updateIntervalMs: {
      value: SETTINGS.streaming.updateIntervalMs, min: 16, max: 1000, step: 1,
      onChange: (v: number) => { SETTINGS.streaming.updateIntervalMs = v; bump() },
    },
    preloadRadius: {
      value: SETTINGS.streaming.preloadRadius, min: 0, max: 100, step: 0.1,
      onChange: (v: number) => { SETTINGS.streaming.preloadRadius = v; bump() },
    },
    renderLoadRadius: {
      value: SETTINGS.streaming.renderLoadRadius, min: 0, max: 100, step: 0.1,
      onChange: (v: number) => { SETTINGS.streaming.renderLoadRadius = v; bump() },
    },
    renderUnloadRadius: {
      value: SETTINGS.streaming.renderUnloadRadius, min: 0, max: 100, step: 0.1,
      onChange: (v: number) => { SETTINGS.streaming.renderUnloadRadius = v; bump() },
    },
    physicsLoadRadius: {
      value: SETTINGS.streaming.physicsLoadRadius, min: 0, max: 100, step: 0.1,
      onChange: (v: number) => { SETTINGS.streaming.physicsLoadRadius = v; bump() },
    },
    physicsUnloadRadius: {
      value: SETTINGS.streaming.physicsUnloadRadius, min: 0, max: 100, step: 0.1,
      onChange: (v: number) => { SETTINGS.streaming.physicsUnloadRadius = v; bump() },
    },
    center: folder({
      source: {
        value: SETTINGS.streaming.center.source,
        options: ['target', 'cameraFocus'] as const,
        onChange: (v: string) => { SETTINGS.streaming.center.source = v as typeof SETTINGS.streaming.center.source; bump() },
      },
      targetId: {
        value: SETTINGS.streaming.center.targetId,
        onChange: (v: string) => { SETTINGS.streaming.center.targetId = v; bump() },
      },
    }),
  }), { collapsed: true })
  useEffect(() => { registerSetter('Streaming', set) }, [set])
}

function useColorsControls() {
  const [, set] = useControls('Colors', () => ({
    shadow: {
      value: SETTINGS.colors.shadow,
      onChange: (v: string) => { SETTINGS.colors.shadow = v; bump() },
    },
    outline: {
      value: SETTINGS.colors.outline,
      onChange: (v: string) => { SETTINGS.colors.outline = v; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('Colors', set) }, [set])
}

function usePaletteControls() {
  const [, set] = useControls('Palette', () => ({
    active: {
      value: SETTINGS.palette.active,
      options: ['classic', 'greyscale', 'green'] as const,
      onChange: (v: string) => { SETTINGS.palette.active = v as typeof SETTINGS.palette.active; bump() },
    },
    autoMid: folder({
      enabled: {
        value: SETTINGS.palette.autoMid.enabled,
        onChange: (v: boolean) => { SETTINGS.palette.autoMid.enabled = v; bump() },
      },
      lightnessDelta: {
        value: SETTINGS.palette.autoMid.lightnessDelta, min: -0.5, max: 0.5, step: 0.005,
        onChange: (v: number) => { SETTINGS.palette.autoMid.lightnessDelta = v; bump() },
      },
      chromaDelta: {
        value: SETTINGS.palette.autoMid.chromaDelta, min: -0.1, max: 0.1, step: 0.001,
        onChange: (v: number) => { SETTINGS.palette.autoMid.chromaDelta = v; bump() },
      },
      hueShift: {
        value: SETTINGS.palette.autoMid.hueShift, min: -180, max: 180, step: 1,
        onChange: (v: number) => { SETTINGS.palette.autoMid.hueShift = v; bump() },
      },
    }),
  }), { collapsed: true })
  useEffect(() => { registerSetter('Palette', set) }, [set])
}

function useLinesControls() {
  const [, set] = useControls('Lines', () => ({
    enabled: {
      value: SETTINGS.lines.enabled,
      onChange: (v: boolean) => { SETTINGS.lines.enabled = v; bump() },
    },
    thickness: {
      value: SETTINGS.lines.thickness, min: 0, max: 10, step: 0.1,
      onChange: (v: number) => { SETTINGS.lines.thickness = v; bump() },
    },
    creaseAngle: {
      value: SETTINGS.lines.creaseAngle, min: 0, max: 180, step: 1,
      onChange: (v: number) => { SETTINGS.lines.creaseAngle = v; bump() },
    },
    threshold: {
      value: SETTINGS.lines.threshold, min: 0, max: 0.1, step: 0.0005,
      onChange: (v: number) => { SETTINGS.lines.threshold = v; bump() },
    },
    composerMultisampling: {
      value: SETTINGS.lines.composerMultisampling, min: 0, max: 8, step: 1,
      onChange: (v: number) => { SETTINGS.lines.composerMultisampling = v; bump() },
    },
    smaaEnabled: {
      value: SETTINGS.lines.smaaEnabled,
      onChange: (v: boolean) => { SETTINGS.lines.smaaEnabled = v; bump() },
    },
    smaaPreset: {
      value: SETTINGS.lines.smaaPreset,
      options: ['low', 'medium', 'high', 'ultra'] as const,
      onChange: (v: string) => { SETTINGS.lines.smaaPreset = v as typeof SETTINGS.lines.smaaPreset; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('Lines', set) }, [set])
}

function usePixelationControls() {
  const [, set] = useControls('Pixelation', () => ({
    enabled: {
      value: SETTINGS.pixelation.enabled,
      onChange: (v: boolean) => { SETTINGS.pixelation.enabled = v; bump() },
    },
    granularity: {
      value: SETTINGS.pixelation.granularity, min: 1, max: 32, step: 1,
      onChange: (v: number) => { SETTINGS.pixelation.granularity = v; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('Pixelation', set) }, [set])
}

function useRetroPixelPassControls() {
  const [, set] = useControls('RetroPixelPass', () => ({
    pixelSize: {
      value: SETTINGS.retroPixelPass.pixelSize, min: 1, max: 32, step: 1,
      onChange: (v: number) => { SETTINGS.retroPixelPass.pixelSize = v; bump() },
    },
    normalEdgeStrength: {
      value: SETTINGS.retroPixelPass.normalEdgeStrength, min: 0, max: 2, step: 0.01,
      onChange: (v: number) => { SETTINGS.retroPixelPass.normalEdgeStrength = v; bump() },
    },
    depthEdgeStrength: {
      value: SETTINGS.retroPixelPass.depthEdgeStrength, min: 0, max: 2, step: 0.01,
      onChange: (v: number) => { SETTINGS.retroPixelPass.depthEdgeStrength = v; bump() },
    },
    depthEdgeThresholdMin: {
      value: SETTINGS.retroPixelPass.depthEdgeThresholdMin, min: 0, max: 0.01, step: 0.00005,
      onChange: (v: number) => { SETTINGS.retroPixelPass.depthEdgeThresholdMin = v; bump() },
    },
    depthEdgeThresholdMax: {
      value: SETTINGS.retroPixelPass.depthEdgeThresholdMax, min: 0, max: 0.05, step: 0.0001,
      onChange: (v: number) => { SETTINGS.retroPixelPass.depthEdgeThresholdMax = v; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('RetroPixelPass', set) }, [set])
}

function useCameraControls() {
  const [, set] = useControls('Camera', () => ({
    mode: {
      value: SETTINGS.camera.mode,
      options: ['static', 'follow'] as const,
      onChange: (v: string) => { SETTINGS.camera.mode = v as typeof SETTINGS.camera.mode; bump() },
    },
    base: folder({
      zoom: {
        value: SETTINGS.camera.base.zoom, min: 10, max: 2000, step: 1,
        onChange: (v: number) => { SETTINGS.camera.base.zoom = v; bump() },
      },
      near: {
        value: SETTINGS.camera.base.near, min: 0.01, max: 10, step: 0.01,
        onChange: (v: number) => { SETTINGS.camera.base.near = v; bump() },
      },
      far: {
        value: SETTINGS.camera.base.far, min: 100, max: 10000, step: 10,
        onChange: (v: number) => { SETTINGS.camera.base.far = v; bump() },
      },
    }),
    static: folder({
      posX: {
        value: SETTINGS.camera.static.position[0], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.static.position[0] = v; bump() },
      },
      posY: {
        value: SETTINGS.camera.static.position[1], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.static.position[1] = v; bump() },
      },
      posZ: {
        value: SETTINGS.camera.static.position[2], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.static.position[2] = v; bump() },
      },
      lookAtX: {
        value: SETTINGS.camera.static.lookAt[0], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.static.lookAt[0] = v; bump() },
      },
      lookAtY: {
        value: SETTINGS.camera.static.lookAt[1], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.static.lookAt[1] = v; bump() },
      },
      lookAtZ: {
        value: SETTINGS.camera.static.lookAt[2], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.static.lookAt[2] = v; bump() },
      },
    }),
    follow: folder({
      targetId: {
        value: SETTINGS.camera.follow.targetId,
        onChange: (v: string) => { SETTINGS.camera.follow.targetId = v; bump() },
      },
      offsetX: {
        value: SETTINGS.camera.follow.offset[0], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.follow.offset[0] = v; bump() },
      },
      offsetY: {
        value: SETTINGS.camera.follow.offset[1], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.follow.offset[1] = v; bump() },
      },
      offsetZ: {
        value: SETTINGS.camera.follow.offset[2], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.follow.offset[2] = v; bump() },
      },
      lookAtOffsetX: {
        value: SETTINGS.camera.follow.lookAtOffset[0], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.follow.lookAtOffset[0] = v; bump() },
      },
      lookAtOffsetY: {
        value: SETTINGS.camera.follow.lookAtOffset[1], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.follow.lookAtOffset[1] = v; bump() },
      },
      lookAtOffsetZ: {
        value: SETTINGS.camera.follow.lookAtOffset[2], min: -50, max: 50, step: 0.1,
        onChange: (v: number) => { SETTINGS.camera.follow.lookAtOffset[2] = v; bump() },
      },
      followLerp: {
        value: SETTINGS.camera.follow.followLerp, min: 0.001, max: 1, step: 0.001,
        onChange: (v: number) => { SETTINGS.camera.follow.followLerp = v; bump() },
      },
      lookAtLerp: {
        value: SETTINGS.camera.follow.lookAtLerp, min: 0.001, max: 1, step: 0.001,
        onChange: (v: number) => { SETTINGS.camera.follow.lookAtLerp = v; bump() },
      },
      lockRotation: {
        value: SETTINGS.camera.follow.lockRotation,
        onChange: (v: boolean) => { SETTINGS.camera.follow.lockRotation = v; bump() },
      },
      'followAxes.x': {
        label: 'followAxes X', value: SETTINGS.camera.follow.followAxes.x,
        onChange: (v: boolean) => { SETTINGS.camera.follow.followAxes.x = v; bump() },
      },
      'followAxes.y': {
        label: 'followAxes Y', value: SETTINGS.camera.follow.followAxes.y,
        onChange: (v: boolean) => { SETTINGS.camera.follow.followAxes.y = v; bump() },
      },
      'followAxes.z': {
        label: 'followAxes Z', value: SETTINGS.camera.follow.followAxes.z,
        onChange: (v: boolean) => { SETTINGS.camera.follow.followAxes.z = v; bump() },
      },
      'lookAtAxes.x': {
        label: 'lookAtAxes X', value: SETTINGS.camera.follow.lookAtAxes.x,
        onChange: (v: boolean) => { SETTINGS.camera.follow.lookAtAxes.x = v; bump() },
      },
      'lookAtAxes.y': {
        label: 'lookAtAxes Y', value: SETTINGS.camera.follow.lookAtAxes.y,
        onChange: (v: boolean) => { SETTINGS.camera.follow.lookAtAxes.y = v; bump() },
      },
      'lookAtAxes.z': {
        label: 'lookAtAxes Z', value: SETTINGS.camera.follow.lookAtAxes.z,
        onChange: (v: boolean) => { SETTINGS.camera.follow.lookAtAxes.z = v; bump() },
      },
      moveLightWithTarget: {
        value: SETTINGS.camera.follow.moveLightWithTarget,
        onChange: (v: boolean) => { SETTINGS.camera.follow.moveLightWithTarget = v; bump() },
      },
    }),
  }), { collapsed: true })
  useEffect(() => { registerSetter('Camera', set) }, [set])
}

function useLightControls() {
  const [, set] = useControls('Light', () => ({
    posX: {
      value: SETTINGS.light.position[0], min: -20, max: 20, step: 0.1,
      onChange: (v: number) => { SETTINGS.light.position[0] = v; bump() },
    },
    posY: {
      value: SETTINGS.light.position[1], min: -20, max: 20, step: 0.1,
      onChange: (v: number) => { SETTINGS.light.position[1] = v; bump() },
    },
    posZ: {
      value: SETTINGS.light.position[2], min: -20, max: 20, step: 0.1,
      onChange: (v: number) => { SETTINGS.light.position[2] = v; bump() },
    },
    intensity: {
      value: SETTINGS.light.intensity, min: 0, max: 10, step: 0.1,
      onChange: (v: number) => { SETTINGS.light.intensity = v; bump() },
    },
    shadowMapSize: {
      value: SETTINGS.light.shadowMapSize, min: 256, max: 8192, step: 256,
      onChange: (v: number) => { SETTINGS.light.shadowMapSize = v; bump() },
    },
    shadowBias: {
      value: SETTINGS.light.shadowBias, min: -0.01, max: 0.01, step: 0.0001,
      onChange: (v: number) => { SETTINGS.light.shadowBias = v; bump() },
    },
    shadowNormalBias: {
      value: SETTINGS.light.shadowNormalBias, min: -0.1, max: 0.1, step: 0.001,
      onChange: (v: number) => { SETTINGS.light.shadowNormalBias = v; bump() },
    },
    shadowArea: {
      value: SETTINGS.light.shadowArea, min: 1, max: 50, step: 0.5,
      onChange: (v: number) => { SETTINGS.light.shadowArea = v; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('Light', set) }, [set])
}

function useMaterialControls() {
  const [, set] = useControls('Material', () => ({
    highlightStep: {
      value: SETTINGS.material.highlightStep, min: 0, max: 1, step: 0.01,
      onChange: (v: number) => { SETTINGS.material.highlightStep = v; bump() },
    },
    midtoneStep: {
      value: SETTINGS.material.midtoneStep, min: 0, max: 1, step: 0.01,
      onChange: (v: number) => { SETTINGS.material.midtoneStep = v; bump() },
    },
    castMidtoneStep: {
      value: SETTINGS.material.castMidtoneStep, min: 0, max: 1, step: 0.01,
      onChange: (v: number) => { SETTINGS.material.castMidtoneStep = v; bump() },
    },
    castShadowStep: {
      value: SETTINGS.material.castShadowStep, min: 0, max: 1, step: 0.01,
      onChange: (v: number) => { SETTINGS.material.castShadowStep = v; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('Material', set) }, [set])
}

function usePlayerControls() {
  const [, set] = useControls('Player', () => ({
    impulseStrength: {
      value: SETTINGS.player.impulseStrength, min: 0, max: 0.5, step: 0.001,
      onChange: (v: number) => { SETTINGS.player.impulseStrength = v; bump() },
    },
    jumpStrength: {
      value: SETTINGS.player.jumpStrength, min: 0, max: 1, step: 0.001,
      onChange: (v: number) => { SETTINGS.player.jumpStrength = v; bump() },
    },
    linearDamping: {
      value: SETTINGS.player.linearDamping, min: 0, max: 20, step: 0.1,
      onChange: (v: number) => { SETTINGS.player.linearDamping = v; bump() },
    },
    angularDamping: {
      value: SETTINGS.player.angularDamping, min: 0, max: 20, step: 0.1,
      onChange: (v: number) => { SETTINGS.player.angularDamping = v; bump() },
    },
    mass: {
      value: SETTINGS.player.mass, min: 0.01, max: 10, step: 0.01,
      onChange: (v: number) => { SETTINGS.player.mass = v; bump() },
    },
    friction: {
      value: SETTINGS.player.friction, min: 0, max: 10, step: 0.1,
      onChange: (v: number) => { SETTINGS.player.friction = v; bump() },
    },
  }), { collapsed: true })
  useEffect(() => { registerSetter('Player', set) }, [set])
}

function useLevelControls() {
  const [, set] = useControls('Level', () => ({
    liveSync: folder({
      enabled: {
        value: SETTINGS.level.liveSync.enabled,
        onChange: (v: boolean) => { SETTINGS.level.liveSync.enabled = v; bump() },
      },
      url: {
        value: SETTINGS.level.liveSync.url,
        onChange: (v: string) => { SETTINGS.level.liveSync.url = v; bump() },
      },
      reconnectMs: {
        value: SETTINGS.level.liveSync.reconnectMs, min: 100, max: 10000, step: 100,
        onChange: (v: number) => { SETTINGS.level.liveSync.reconnectMs = v; bump() },
      },
      'Reload level': button(() => {
        useLevelStore.getState().reloadCurrentLevel()
      }),
    }),
  }), { collapsed: true })
  useEffect(() => { registerSetter('Level', set) }, [set])
}

// ═══════════════════════════════════════════════════════════════════════════
// Preset controls
// ═══════════════════════════════════════════════════════════════════════════

function usePresetControls() {
  const presetNameRef = useRef('default')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [bundledPresets, setBundledPresets] = useState<string[]>([])

  useEffect(() => {
    fetchPresetManifest().then(setBundledPresets)
  }, [])

  useControls('Presets', {
    name: {
      value: 'default',
      onChange: (v: string) => { presetNameRef.current = v },
    },
    'Save Preset': button(() => {
      savePreset(presetNameRef.current)
    }),
    'Load from File': button(() => {
      if (!fileInputRef.current) {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.style.display = 'none'
        input.addEventListener('change', async () => {
          const file = input.files?.[0]
          if (!file) return
          await loadPresetFromFile(file)
          syncLevaFromSettings()
          input.value = ''
        })
        document.body.appendChild(input)
        fileInputRef.current = input
      }
      fileInputRef.current.click()
    }),
  }, { collapsed: false })

  useBundledPresetSelector(bundledPresets)
}

function useBundledPresetSelector(bundledPresets: string[]) {
  const options = bundledPresets.length > 0 ? bundledPresets : ['(none)']
  useControls('Presets', () => ({
    bundled: {
      value: options[0],
      options,
      onChange: async (v: string) => {
        if (v === '(none)') return
        await loadBundledPreset(v)
        syncLevaFromSettings()
      },
    },
  }), [bundledPresets])
}

// ═══════════════════════════════════════════════════════════════════════════
// Main component – renders nothing; leva provides its own overlay panel
// ═══════════════════════════════════════════════════════════════════════════

export function ControlCenter() {
  useRenderControls()
  useControlsControls()
  useDebugControls()
  useStreamingControls()
  useColorsControls()
  usePaletteControls()
  useLinesControls()
  usePixelationControls()
  useRetroPixelPassControls()
  useCameraControls()
  useLightControls()
  useMaterialControls()
  usePlayerControls()
  useLevelControls()
  usePresetControls()

  return null
}
