import { SETTINGS, markShadingDirDirty, markShadowLightDirDirty } from '@/settings/GameSettings'
import {
    RENDER_STYLES,
    CONTROL_INPUT_SOURCES,
    EXTERNAL_CONTROL_MODES,
    CAMERA_MODES,
    CAMERA_FOLLOW_Z_CLAMP_MODES,
    STREAMING_CENTER_SOURCES,
    SMAA_PRESET_NAMES,
    PALETTE_VARIANT_NAMES,
} from '@/settings/GameSettings.types'
import type { Vec3, AxisMask, PaletteVariant, PaletteVariantName } from '@/settings/GameSettings.types'
import { ACCELERATION_CURVE_NAMES } from '@/utils/accelerationCurve'
import { bump } from '@/settings/settingsStore'

const POP_RELEASE_CURVE_OPTIONS = [
    'power_1_25',
    'power_1_5',
    'exponential',
] as const

// ═══════════════════════════════════════════════════════════════════
// Field descriptor types
// ═══════════════════════════════════════════════════════════════════

type BooleanField = {
    type: 'boolean'
    label: string
    get: () => boolean
    set: (v: boolean) => void
    visible?: () => boolean
}

type NumberField = {
    type: 'number'
    label: string
    get: () => number
    set: (v: number) => void
    min?: number
    max?: number
    step?: number
    visible?: () => boolean
}

type TextField = {
    type: 'text'
    label: string
    get: () => string
    set: (v: string) => void
    visible?: () => boolean
}

type SelectField = {
    type: 'select'
    label: string
    get: () => string
    set: (v: string) => void
    options: readonly string[]
    visible?: () => boolean
}

type ColorField = {
    type: 'color'
    label: string
    get: () => string
    set: (v: string) => void
    visible?: () => boolean
}

type Vec3Field = {
    type: 'vec3'
    label: string
    get: () => Vec3
    set: (v: Vec3) => void
    min?: number
    max?: number
    step?: number
    visible?: () => boolean
}

type AxisMaskField = {
    type: 'axisMask'
    label: string
    get: () => AxisMask
    set: (v: AxisMask) => void
    visible?: () => boolean
}

type StringArrayField = {
    type: 'stringArray'
    label: string
    get: () => string[]
    set: (v: string[]) => void
    visible?: () => boolean
}

type PaletteColorsField = {
    type: 'paletteColors'
    label: string
    getVariant: (name: PaletteVariantName) => PaletteVariant
    setVariant: (name: PaletteVariantName, v: PaletteVariant) => void
    visible?: () => boolean
}

type ButtonField = {
    type: 'button'
    label: string
    action: () => void
    visible?: () => boolean
}

export type FieldDescriptor =
    | BooleanField
    | NumberField
    | TextField
    | SelectField
    | ColorField
    | Vec3Field
    | AxisMaskField
    | StringArrayField
    | PaletteColorsField
    | ButtonField

export type SectionDescriptor = {
    key: string
    label: string
    fields: FieldDescriptor[]
}

// helper: mutate + bump
function nb(fn: () => void) {
    return (v: number) => { fn(); bump() }
}

// ═══════════════════════════════════════════════════════════════════
// Schema definition – order matches GameSettings keys
// ═══════════════════════════════════════════════════════════════════

export const settingsSections: SectionDescriptor[] = [
    // ── Render ──
    {
        key: 'render',
        label: 'Render',
        fields: [
            {
                type: 'select', label: 'style',
                get: () => SETTINGS.render.style,
                set: (v) => { SETTINGS.render.style = v as typeof SETTINGS.render.style; bump() },
                options: RENDER_STYLES,
            },
        ],
    },

    // ── Scoreboard ──
    {
        key: 'scoreboard',
        label: 'Scoreboard',
        fields: [
            {
                type: 'boolean', label: 'websocket.enabled',
                get: () => SETTINGS.scoreboard.websocket.enabled,
                set: (v) => { SETTINGS.scoreboard.websocket.enabled = v; bump() },
            },
            {
                type: 'text', label: 'websocket.url',
                get: () => SETTINGS.scoreboard.websocket.url,
                set: (v) => { SETTINGS.scoreboard.websocket.url = v; bump() },
                visible: () => SETTINGS.scoreboard.websocket.enabled,
            },
            {
                type: 'number', label: 'websocket.reconnectMs',
                get: () => SETTINGS.scoreboard.websocket.reconnectMs,
                set: (v) => { SETTINGS.scoreboard.websocket.reconnectMs = v; bump() },
                min: 100, max: 10000, step: 100,
                visible: () => SETTINGS.scoreboard.websocket.enabled,
            },
        ],
    },

    // ── Controls ──
    {
        key: 'controls',
        label: 'Controls',
        fields: [
            {
                type: 'select', label: 'inputSource',
                get: () => SETTINGS.controls.inputSource,
                set: (v) => { SETTINGS.controls.inputSource = v as typeof SETTINGS.controls.inputSource; bump() },
                options: CONTROL_INPUT_SOURCES,
            },
            // external sub-fields
            {
                type: 'select', label: 'external.mode',
                get: () => SETTINGS.controls.external.mode,
                set: (v) => { SETTINGS.controls.external.mode = v as typeof SETTINGS.controls.external.mode; bump() },
                options: EXTERNAL_CONTROL_MODES,
                visible: () => SETTINGS.controls.inputSource !== 'keyboard',
            },
            {
                type: 'number', label: 'external.staleTimeoutMs',
                get: () => SETTINGS.controls.external.staleTimeoutMs,
                set: (v) => { SETTINGS.controls.external.staleTimeoutMs = v; bump() },
                min: 0, max: 2000, step: 10,
                visible: () => SETTINGS.controls.inputSource !== 'keyboard',
            },
            // absolute
            {
                type: 'number', label: 'absolute.followLerp',
                get: () => SETTINGS.controls.external.absolute.followLerp,
                set: (v) => { SETTINGS.controls.external.absolute.followLerp = v; bump() },
                min: 0, max: 1, step: 0.01,
                visible: () => SETTINGS.controls.inputSource !== 'keyboard' && SETTINGS.controls.external.mode === 'absolute',
            },
            {
                type: 'number', label: 'absolute.maxUnits/s',
                get: () => SETTINGS.controls.external.absolute.maxUnitsPerSecond,
                set: (v) => { SETTINGS.controls.external.absolute.maxUnitsPerSecond = v; bump() },
                min: 0, max: 50, step: 0.5,
                visible: () => SETTINGS.controls.inputSource !== 'keyboard' && SETTINGS.controls.external.mode === 'absolute',
            },
            {
                type: 'number', label: 'absolute.maxTargetStep',
                get: () => SETTINGS.controls.external.absolute.maxTargetStep,
                set: (v) => { SETTINGS.controls.external.absolute.maxTargetStep = v; bump() },
                min: 0, max: 5, step: 0.05,
                visible: () => SETTINGS.controls.inputSource !== 'keyboard' && SETTINGS.controls.external.mode === 'absolute',
            },
            // websocket
            {
                type: 'boolean', label: 'websocket.enabled',
                get: () => SETTINGS.controls.external.websocket.enabled,
                set: (v) => { SETTINGS.controls.external.websocket.enabled = v; bump() },
                visible: () => SETTINGS.controls.inputSource !== 'keyboard',
            },
            {
                type: 'text', label: 'websocket.url',
                get: () => SETTINGS.controls.external.websocket.url,
                set: (v) => { SETTINGS.controls.external.websocket.url = v; bump() },
                visible: () => SETTINGS.controls.inputSource !== 'keyboard' && SETTINGS.controls.external.websocket.enabled,
            },
            {
                type: 'number', label: 'websocket.reconnectMs',
                get: () => SETTINGS.controls.external.websocket.reconnectMs,
                set: (v) => { SETTINGS.controls.external.websocket.reconnectMs = v; bump() },
                min: 100, max: 10000, step: 100,
                visible: () => SETTINGS.controls.inputSource !== 'keyboard' && SETTINGS.controls.external.websocket.enabled,
            },
        ],
    },

    // ── Debug ──
    {
        key: 'debug',
        label: 'Debug',
        fields: [
            { type: 'boolean', label: 'enabled', get: () => SETTINGS.debug.enabled, set: (v) => { SETTINGS.debug.enabled = v; bump() } },
            { type: 'boolean', label: 'showColliders', get: () => SETTINGS.debug.showColliders, set: (v) => { SETTINGS.debug.showColliders = v; bump() } },
            { type: 'boolean', label: 'showStats', get: () => SETTINGS.debug.showStats, set: (v) => { SETTINGS.debug.showStats = v; bump() } },
            { type: 'boolean', label: 'showGrid', get: () => SETTINGS.debug.showGrid, set: (v) => { SETTINGS.debug.showGrid = v; bump() } },
            { type: 'boolean', label: 'showCameraFrustum', get: () => SETTINGS.debug.showCameraFrustum, set: (v) => { SETTINGS.debug.showCameraFrustum = v; bump() } },
            { type: 'boolean', label: 'showDebugCamera', get: () => SETTINGS.debug.showDebugCamera, set: (v) => { SETTINGS.debug.showDebugCamera = v; bump() } },
            // streaming sub
            { type: 'boolean', label: 'streaming.enabled', get: () => SETTINGS.debug.streaming.enabled, set: (v) => { SETTINGS.debug.streaming.enabled = v; bump() } },
            { type: 'boolean', label: 'streaming.showRadii', get: () => SETTINGS.debug.streaming.showRadii, set: (v) => { SETTINGS.debug.streaming.showRadii = v; bump() } },
            { type: 'boolean', label: 'streaming.showChunkBounds', get: () => SETTINGS.debug.streaming.showChunkBounds, set: (v) => { SETTINGS.debug.streaming.showChunkBounds = v; bump() } },
            { type: 'boolean', label: 'streaming.showAllChunks', get: () => SETTINGS.debug.streaming.showAllChunkBounds, set: (v) => { SETTINGS.debug.streaming.showAllChunkBounds = v; bump() } },
            // benchmark sub
            { type: 'boolean', label: 'benchmark.enabled', get: () => SETTINGS.debug.benchmark.enabled, set: (v) => { SETTINGS.debug.benchmark.enabled = v; bump() } },
            { type: 'number', label: 'benchmark.gridX', get: () => SETTINGS.debug.benchmark.gridX, set: (v) => { SETTINGS.debug.benchmark.gridX = v; bump() }, min: 1, max: 100, step: 1 },
            { type: 'number', label: 'benchmark.gridZ', get: () => SETTINGS.debug.benchmark.gridZ, set: (v) => { SETTINGS.debug.benchmark.gridZ = v; bump() }, min: 1, max: 100, step: 1 },
            { type: 'number', label: 'benchmark.layers', get: () => SETTINGS.debug.benchmark.layers, set: (v) => { SETTINGS.debug.benchmark.layers = v; bump() }, min: 1, max: 20, step: 1 },
            { type: 'number', label: 'benchmark.spacing', get: () => SETTINGS.debug.benchmark.spacing, set: (v) => { SETTINGS.debug.benchmark.spacing = v; bump() }, min: 0.1, max: 10, step: 0.05 },
            { type: 'number', label: 'benchmark.heightStep', get: () => SETTINGS.debug.benchmark.heightStep, set: (v) => { SETTINGS.debug.benchmark.heightStep = v; bump() }, min: 0.01, max: 5, step: 0.01 },
            {
                type: 'vec3', label: 'benchmark.origin',
                get: () => SETTINGS.debug.benchmark.origin as Vec3,
                set: (v) => { SETTINGS.debug.benchmark.origin = v; bump() },
                min: -50, max: 50, step: 0.5,
            },
            { type: 'boolean', label: 'benchmark.usePhysics', get: () => SETTINGS.debug.benchmark.usePhysics, set: (v) => { SETTINGS.debug.benchmark.usePhysics = v; bump() } },
            { type: 'number', label: 'benchmark.fixedColliderEvery', get: () => SETTINGS.debug.benchmark.fixedColliderEvery, set: (v) => { SETTINGS.debug.benchmark.fixedColliderEvery = v; bump() }, min: 1, max: 50, step: 1 },
        ],
    },

    // ── Streaming ──
    {
        key: 'streaming',
        label: 'Streaming',
        fields: [
            { type: 'boolean', label: 'enabled', get: () => SETTINGS.streaming.enabled, set: (v) => { SETTINGS.streaming.enabled = v; bump() } },
            { type: 'number', label: 'cellSize', get: () => SETTINGS.streaming.cellSize, set: (v) => { SETTINGS.streaming.cellSize = v; bump() }, min: 1, max: 64, step: 1 },
            { type: 'number', label: 'updateIntervalMs', get: () => SETTINGS.streaming.updateIntervalMs, set: (v) => { SETTINGS.streaming.updateIntervalMs = v; bump() }, min: 16, max: 1000, step: 1 },
            { type: 'number', label: 'preloadRadius', get: () => SETTINGS.streaming.preloadRadius, set: (v) => { SETTINGS.streaming.preloadRadius = v; bump() }, min: 0, max: 100, step: 0.1 },
            { type: 'number', label: 'renderLoadRadius', get: () => SETTINGS.streaming.renderLoadRadius, set: (v) => { SETTINGS.streaming.renderLoadRadius = v; bump() }, min: 0, max: 100, step: 0.1 },
            { type: 'number', label: 'renderUnloadRadius', get: () => SETTINGS.streaming.renderUnloadRadius, set: (v) => { SETTINGS.streaming.renderUnloadRadius = v; bump() }, min: 0, max: 100, step: 0.1 },
            { type: 'number', label: 'physicsLoadRadius', get: () => SETTINGS.streaming.physicsLoadRadius, set: (v) => { SETTINGS.streaming.physicsLoadRadius = v; bump() }, min: 0, max: 100, step: 0.1 },
            { type: 'number', label: 'physicsUnloadRadius', get: () => SETTINGS.streaming.physicsUnloadRadius, set: (v) => { SETTINGS.streaming.physicsUnloadRadius = v; bump() }, min: 0, max: 100, step: 0.1 },
            {
                type: 'select', label: 'center.source',
                get: () => SETTINGS.streaming.center.source,
                set: (v) => { SETTINGS.streaming.center.source = v as typeof SETTINGS.streaming.center.source; bump() },
                options: STREAMING_CENTER_SOURCES,
            },
            { type: 'text', label: 'center.targetId', get: () => SETTINGS.streaming.center.targetId, set: (v) => { SETTINGS.streaming.center.targetId = v; bump() } },
        ],
    },

    // ── Colors ──
    {
        key: 'colors',
        label: 'Colors',
        fields: [
            { type: 'color', label: 'shadow', get: () => SETTINGS.colors.shadow, set: (v) => { SETTINGS.colors.shadow = v; bump() } },
            { type: 'color', label: 'outline', get: () => SETTINGS.colors.outline, set: (v) => { SETTINGS.colors.outline = v; bump() } },
        ],
    },

    // ── Palette ──
    {
        key: 'palette',
        label: 'Palette',
        fields: [
            {
                type: 'select', label: 'active',
                get: () => SETTINGS.palette.active,
                set: (v) => { SETTINGS.palette.active = v as typeof SETTINGS.palette.active; bump() },
                options: PALETTE_VARIANT_NAMES,
            },
            { type: 'boolean', label: 'autoMid.enabled', get: () => SETTINGS.palette.autoMid.enabled, set: (v) => { SETTINGS.palette.autoMid.enabled = v; bump() } },
            { type: 'number', label: 'autoMid.lightnessDelta', get: () => SETTINGS.palette.autoMid.lightnessDelta, set: (v) => { SETTINGS.palette.autoMid.lightnessDelta = v; bump() }, min: -0.5, max: 0.5, step: 0.005 },
            { type: 'number', label: 'autoMid.chromaDelta', get: () => SETTINGS.palette.autoMid.chromaDelta, set: (v) => { SETTINGS.palette.autoMid.chromaDelta = v; bump() }, min: -0.1, max: 0.1, step: 0.001 },
            { type: 'number', label: 'autoMid.hueShift', get: () => SETTINGS.palette.autoMid.hueShift, set: (v) => { SETTINGS.palette.autoMid.hueShift = v; bump() }, min: -180, max: 180, step: 1 },
            {
                type: 'paletteColors', label: 'variants',
                getVariant: (name) => SETTINGS.palette.variants[name],
                setVariant: (name, v) => { SETTINGS.palette.variants[name] = v; bump() },
            },
        ],
    },

    // ── Lines ──
    {
        key: 'lines',
        label: 'Lines',
        fields: [
            { type: 'boolean', label: 'enabled', get: () => SETTINGS.lines.enabled, set: (v) => { SETTINGS.lines.enabled = v; bump() } },
            { type: 'number', label: 'thickness', get: () => SETTINGS.lines.thickness, set: (v) => { SETTINGS.lines.thickness = v; bump() }, min: 0, max: 10, step: 0.1 },
            { type: 'number', label: 'creaseAngle', get: () => SETTINGS.lines.creaseAngle, set: (v) => { SETTINGS.lines.creaseAngle = v; bump() }, min: 0, max: 180, step: 1 },
            { type: 'number', label: 'threshold', get: () => SETTINGS.lines.threshold, set: (v) => { SETTINGS.lines.threshold = v; bump() }, min: 0, max: 0.1, step: 0.0005 },
            { type: 'number', label: 'composerMultisampling', get: () => SETTINGS.lines.composerMultisampling, set: (v) => { SETTINGS.lines.composerMultisampling = v; bump() }, min: 0, max: 8, step: 1 },
            { type: 'boolean', label: 'smaaEnabled', get: () => SETTINGS.lines.smaaEnabled, set: (v) => { SETTINGS.lines.smaaEnabled = v; bump() } },
            {
                type: 'select', label: 'smaaPreset',
                get: () => SETTINGS.lines.smaaPreset,
                set: (v) => { SETTINGS.lines.smaaPreset = v as typeof SETTINGS.lines.smaaPreset; bump() },
                options: SMAA_PRESET_NAMES,
            },
        ],
    },

    // ── Pixelation ──
    {
        key: 'pixelation',
        label: 'Pixelation',
        fields: [
            { type: 'boolean', label: 'enabled', get: () => SETTINGS.pixelation.enabled, set: (v) => { SETTINGS.pixelation.enabled = v; bump() } },
            { type: 'number', label: 'granularity', get: () => SETTINGS.pixelation.granularity, set: (v) => { SETTINGS.pixelation.granularity = v; bump() }, min: 1, max: 32, step: 1 },
        ],
    },

    // ── RetroPixelPass ──
    {
        key: 'retroPixelPass',
        label: 'RetroPixelPass',
        fields: [
            { type: 'number', label: 'pixelSize', get: () => SETTINGS.retroPixelPass.pixelSize, set: (v) => { SETTINGS.retroPixelPass.pixelSize = v; bump() }, min: 1, max: 32, step: 1 },
            { type: 'number', label: 'normalEdgeStrength', get: () => SETTINGS.retroPixelPass.normalEdgeStrength, set: (v) => { SETTINGS.retroPixelPass.normalEdgeStrength = v; bump() }, min: 0, max: 2, step: 0.01 },
            { type: 'number', label: 'depthEdgeStrength', get: () => SETTINGS.retroPixelPass.depthEdgeStrength, set: (v) => { SETTINGS.retroPixelPass.depthEdgeStrength = v; bump() }, min: 0, max: 2, step: 0.01 },
            { type: 'number', label: 'depthEdgeThresholdMin', get: () => SETTINGS.retroPixelPass.depthEdgeThresholdMin, set: (v) => { SETTINGS.retroPixelPass.depthEdgeThresholdMin = v; bump() }, min: 0, max: 0.01, step: 0.00005 },
            { type: 'number', label: 'depthEdgeThresholdMax', get: () => SETTINGS.retroPixelPass.depthEdgeThresholdMax, set: (v) => { SETTINGS.retroPixelPass.depthEdgeThresholdMax = v; bump() }, min: 0, max: 0.05, step: 0.0001 },
        ],
    },

    // ── Camera ──
    {
        key: 'camera',
        label: 'Camera',
        fields: [
            {
                type: 'select', label: 'mode',
                get: () => SETTINGS.camera.mode,
                set: (v) => { SETTINGS.camera.mode = v as typeof SETTINGS.camera.mode; bump() },
                options: CAMERA_MODES,
            },
            // base
            { type: 'number', label: 'base.zoom', get: () => SETTINGS.camera.base.zoom, set: (v) => { SETTINGS.camera.base.zoom = v; bump() }, min: 10, max: 2000, step: 1 },
            { type: 'number', label: 'base.near', get: () => SETTINGS.camera.base.near, set: (v) => { SETTINGS.camera.base.near = v; bump() }, min: 0.01, max: 10, step: 0.01 },
            { type: 'number', label: 'base.far', get: () => SETTINGS.camera.base.far, set: (v) => { SETTINGS.camera.base.far = v; bump() }, min: 100, max: 10000, step: 10 },
            // static
            {
                type: 'vec3', label: 'static.position',
                get: () => SETTINGS.camera.static.position as Vec3,
                set: (v) => { SETTINGS.camera.static.position = v; bump() },
                min: -50, max: 50, step: 0.1,
                visible: () => SETTINGS.camera.mode === 'static',
            },
            {
                type: 'vec3', label: 'static.lookAt',
                get: () => SETTINGS.camera.static.lookAt as Vec3,
                set: (v) => { SETTINGS.camera.static.lookAt = v; bump() },
                min: -50, max: 50, step: 0.1,
                visible: () => SETTINGS.camera.mode === 'static',
            },
            // follow
            {
                type: 'text', label: 'follow.targetId',
                get: () => SETTINGS.camera.follow.targetId,
                set: (v) => { SETTINGS.camera.follow.targetId = v; bump() },
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'vec3', label: 'follow.offset',
                get: () => SETTINGS.camera.follow.offset as Vec3,
                set: (v) => { SETTINGS.camera.follow.offset = v; bump() },
                min: -50, max: 50, step: 0.1,
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'vec3', label: 'follow.lookAtOffset',
                get: () => SETTINGS.camera.follow.lookAtOffset as Vec3,
                set: (v) => { SETTINGS.camera.follow.lookAtOffset = v; bump() },
                min: -50, max: 50, step: 0.1,
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'number', label: 'follow.followLerp',
                get: () => SETTINGS.camera.follow.followLerp,
                set: (v) => { SETTINGS.camera.follow.followLerp = v; bump() },
                min: 0.001, max: 1, step: 0.001,
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'number', label: 'follow.lookAtLerp',
                get: () => SETTINGS.camera.follow.lookAtLerp,
                set: (v) => { SETTINGS.camera.follow.lookAtLerp = v; bump() },
                min: 0.001, max: 1, step: 0.001,
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'select', label: 'follow.zClampMode',
                get: () => SETTINGS.camera.follow.zClampMode,
                set: (v) => { SETTINGS.camera.follow.zClampMode = v as typeof SETTINGS.camera.follow.zClampMode; bump() },
                options: CAMERA_FOLLOW_Z_CLAMP_MODES,
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'boolean', label: 'follow.lockRotation',
                get: () => SETTINGS.camera.follow.lockRotation,
                set: (v) => { SETTINGS.camera.follow.lockRotation = v; bump() },
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'axisMask', label: 'follow.followAxes',
                get: () => SETTINGS.camera.follow.followAxes,
                set: (v) => { SETTINGS.camera.follow.followAxes = v; bump() },
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'axisMask', label: 'follow.lookAtAxes',
                get: () => SETTINGS.camera.follow.lookAtAxes,
                set: (v) => { SETTINGS.camera.follow.lookAtAxes = v; bump() },
                visible: () => SETTINGS.camera.mode === 'follow',
            },
            {
                type: 'boolean', label: 'follow.moveLightWithTarget',
                get: () => SETTINGS.camera.follow.moveLightWithTarget,
                set: (v) => { SETTINGS.camera.follow.moveLightWithTarget = v; bump() },
                visible: () => SETTINGS.camera.mode === 'follow',
            },
        ],
    },

    // ── Light ──
    {
        key: 'light',
        label: 'Light',
        fields: [
            {
                type: 'vec3', label: 'position',
                get: () => SETTINGS.light.position as Vec3,
                set: (v) => { SETTINGS.light.position = v; markShadowLightDirDirty(); bump() },
                min: -20, max: 20, step: 0.1,
            },
            { type: 'number', label: 'intensity', get: () => SETTINGS.light.intensity, set: (v) => { SETTINGS.light.intensity = v; bump() }, min: 0, max: 10, step: 0.1 },
            { type: 'number', label: 'shadowMapSize', get: () => SETTINGS.light.shadowMapSize, set: (v) => { SETTINGS.light.shadowMapSize = v; bump() }, min: 256, max: 8192, step: 256 },
            { type: 'number', label: 'shadowBias', get: () => SETTINGS.light.shadowBias, set: (v) => { SETTINGS.light.shadowBias = v; bump() }, min: -0.01, max: 0.01, step: 0.0001 },
            { type: 'number', label: 'shadowNormalBias', get: () => SETTINGS.light.shadowNormalBias, set: (v) => { SETTINGS.light.shadowNormalBias = v; bump() }, min: -0.1, max: 0.1, step: 0.001 },
            { type: 'number', label: 'shadowArea', get: () => SETTINGS.light.shadowArea, set: (v) => { SETTINGS.light.shadowArea = v; bump() }, min: 1, max: 50, step: 0.5 },
        ],
    },

    // ── Material ──
    {
        key: 'material',
        label: 'Material',
        fields: [
            {
                type: 'vec3', label: 'shadingDirection',
                get: () => SETTINGS.material.shadingDirection as Vec3,
                set: (v) => { SETTINGS.material.shadingDirection = v; markShadingDirDirty(); bump() },
                min: -20, max: 20, step: 0.1,
            },
            { type: 'boolean', label: 'shadowFollowsLight', get: () => SETTINGS.material.shadowFollowsLight, set: (v) => { SETTINGS.material.shadowFollowsLight = v; bump() } },
            { type: 'number', label: 'highlightStep', get: () => SETTINGS.material.highlightStep, set: (v) => { SETTINGS.material.highlightStep = v; bump() }, min: 0, max: 1, step: 0.01 },
            { type: 'number', label: 'midtoneStep', get: () => SETTINGS.material.midtoneStep, set: (v) => { SETTINGS.material.midtoneStep = v; bump() }, min: 0, max: 1, step: 0.01 },
            { type: 'number', label: 'castMidtoneStep', get: () => SETTINGS.material.castMidtoneStep, set: (v) => { SETTINGS.material.castMidtoneStep = v; bump() }, min: 0, max: 1, step: 0.01 },
            { type: 'number', label: 'castShadowStep', get: () => SETTINGS.material.castShadowStep, set: (v) => { SETTINGS.material.castShadowStep = v; bump() }, min: 0, max: 1, step: 0.01 },
        ],
    },

    // ── Player ──
    {
        key: 'player',
        label: 'Player',
        fields: [
            { type: 'number', label: 'impulseStrength', get: () => SETTINGS.player.impulseStrength, set: (v) => { SETTINGS.player.impulseStrength = v; bump() }, min: 0, max: 0.5, step: 0.001 },
            { type: 'number', label: 'jumpStrength', get: () => SETTINGS.player.jumpStrength, set: (v) => { SETTINGS.player.jumpStrength = v; bump() }, min: 0, max: 1, step: 0.001 },
            { type: 'number', label: 'linearDamping', get: () => SETTINGS.player.linearDamping, set: (v) => { SETTINGS.player.linearDamping = v; bump() }, min: 0, max: 20, step: 0.1 },
            { type: 'number', label: 'angularDamping', get: () => SETTINGS.player.angularDamping, set: (v) => { SETTINGS.player.angularDamping = v; bump() }, min: 0, max: 20, step: 0.1 },
            { type: 'number', label: 'mass', get: () => SETTINGS.player.mass, set: (v) => { SETTINGS.player.mass = v; bump() }, min: 0.01, max: 10, step: 0.01 },
            { type: 'number', label: 'friction', get: () => SETTINGS.player.friction, set: (v) => { SETTINGS.player.friction = v; bump() }, min: 0, max: 10, step: 0.1 },
        ],
    },

    // ── Gameplay ──
    {
        key: 'gameplay',
        label: 'Gameplay',
        fields: [
            // contagion
            { type: 'boolean', label: 'contagion.enabled', get: () => SETTINGS.gameplay.contagion.enabled, set: (v) => { SETTINGS.gameplay.contagion.enabled = v; bump() } },
            { type: 'number', label: 'contagion.scorePerInfection', get: () => SETTINGS.gameplay.contagion.scorePerInfection, set: (v) => { SETTINGS.gameplay.contagion.scorePerInfection = v; bump() }, min: 0, max: 1000, step: 10 },
            // score
            { type: 'boolean', label: 'score.lockOnGameOver', get: () => SETTINGS.gameplay.score.lockOnGameOver, set: (v) => { SETTINGS.gameplay.score.lockOnGameOver = v; bump() } },
            { type: 'boolean', label: 'score.resetOnRunEnd', get: () => SETTINGS.gameplay.score.resetOnRunEnd, set: (v) => { SETTINGS.gameplay.score.resetOnRunEnd = v; bump() } },
            { type: 'boolean', label: 'score.resetOnGameOver', get: () => SETTINGS.gameplay.score.resetOnGameOver, set: (v) => { SETTINGS.gameplay.score.resetOnGameOver = v; bump() } },
            // lives
            { type: 'number', label: 'lives.initial', get: () => SETTINGS.gameplay.lives.initial, set: (v) => { SETTINGS.gameplay.lives.initial = v; bump() }, min: 1, max: 10, step: 1 },
            { type: 'number', label: 'lives.lossPerMiss', get: () => SETTINGS.gameplay.lives.lossPerMiss, set: (v) => { SETTINGS.gameplay.lives.lossPerMiss = v; bump() }, min: 0, max: 5, step: 1 },
            { type: 'boolean', label: 'lives.autoReset', get: () => SETTINGS.gameplay.lives.autoReset, set: (v) => { SETTINGS.gameplay.lives.autoReset = v; bump() } },
            // balloons
            { type: 'number', label: 'balloons.scorePerPop', get: () => SETTINGS.gameplay.balloons.scorePerPop, set: (v) => { SETTINGS.gameplay.balloons.scorePerPop = v; bump() }, min: 0, max: 1000, step: 10 },
            { type: 'number', label: 'balloons.sensors.lifeMargin', get: () => SETTINGS.gameplay.balloons.sensors.lifeMargin, set: (v) => { SETTINGS.gameplay.balloons.sensors.lifeMargin = v; bump() }, min: -2, max: 5, step: 0.05 },
            { type: 'number', label: 'balloons.sensors.cleanupMargin', get: () => SETTINGS.gameplay.balloons.sensors.cleanupMargin, set: (v) => { SETTINGS.gameplay.balloons.sensors.cleanupMargin = v; bump() }, min: -2, max: 5, step: 0.05 },
            { type: 'number', label: 'balloons.popRelease.linearSpeedMin', get: () => SETTINGS.gameplay.balloons.popRelease.linearSpeedMin, set: (v) => { SETTINGS.gameplay.balloons.popRelease.linearSpeedMin = v; bump() }, min: 0, max: 20, step: 0.01 },
            { type: 'number', label: 'balloons.popRelease.linearSpeedMax', get: () => SETTINGS.gameplay.balloons.popRelease.linearSpeedMax, set: (v) => { SETTINGS.gameplay.balloons.popRelease.linearSpeedMax = v; bump() }, min: 0, max: 40, step: 0.01 },
            { type: 'number', label: 'balloons.popRelease.linearSpeedVelocityRangeMaxPx', get: () => SETTINGS.gameplay.balloons.popRelease.linearSpeedVelocityRangeMaxPx, set: (v) => { SETTINGS.gameplay.balloons.popRelease.linearSpeedVelocityRangeMaxPx = v; bump() }, min: 0, max: 10000, step: 10 },
            {
                type: 'select', label: 'balloons.popRelease.curve',
                get: () => SETTINGS.gameplay.balloons.popRelease.curve,
                set: (v) => { SETTINGS.gameplay.balloons.popRelease.curve = v as typeof SETTINGS.gameplay.balloons.popRelease.curve; bump() },
                options: POP_RELEASE_CURVE_OPTIONS,
            },
            { type: 'boolean', label: 'balloons.combo.enabled', get: () => SETTINGS.gameplay.balloons.combo.enabled, set: (v) => { SETTINGS.gameplay.balloons.combo.enabled = v; bump() } },
            { type: 'number', label: 'balloons.combo.strikeWindowMs', get: () => SETTINGS.gameplay.balloons.combo.strikeWindowMs, set: (v) => { SETTINGS.gameplay.balloons.combo.strikeWindowMs = v; bump() }, min: 0, max: 1000, step: 5 },
            { type: 'number', label: 'balloons.combo.chainWindowMs', get: () => SETTINGS.gameplay.balloons.combo.chainWindowMs, set: (v) => { SETTINGS.gameplay.balloons.combo.chainWindowMs = v; bump() }, min: 0, max: 5000, step: 10 },
            { type: 'number', label: 'balloons.combo.chainBonusCap', get: () => SETTINGS.gameplay.balloons.combo.chainBonusCap, set: (v) => { SETTINGS.gameplay.balloons.combo.chainBonusCap = v; bump() }, min: 0, max: 10, step: 1 },
        ],
    },

    // ── Level ──
    {
        key: 'level',
        label: 'Level',
        fields: [
            { type: 'text', label: 'defaultFile', get: () => SETTINGS.level.defaultFile, set: (v) => { SETTINGS.level.defaultFile = v; bump() } },
            { type: 'number', label: 'gridClonerSpawnChunkSize', get: () => SETTINGS.level.gridClonerSpawnChunkSize, set: (v) => { SETTINGS.level.gridClonerSpawnChunkSize = v; bump() }, min: 0, max: 256, step: 1 },
            // tiling
            { type: 'boolean', label: 'tiling.enabled', get: () => SETTINGS.level.tiling.enabled, set: (v) => { SETTINGS.level.tiling.enabled = v; bump() } },
            {
                type: 'stringArray', label: 'tiling.files',
                get: () => SETTINGS.level.tiling.files,
                set: (v) => { SETTINGS.level.tiling.files = v; bump() },
                visible: () => SETTINGS.level.tiling.enabled,
            },
            {
                type: 'number', label: 'tiling.lookAheadDistance',
                get: () => SETTINGS.level.tiling.lookAheadDistance,
                set: (v) => { SETTINGS.level.tiling.lookAheadDistance = v; bump() },
                min: 0, max: 100, step: 0.5,
                visible: () => SETTINGS.level.tiling.enabled,
            },
            {
                type: 'number', label: 'tiling.cullBehindDistance',
                get: () => SETTINGS.level.tiling.cullBehindDistance,
                set: (v) => { SETTINGS.level.tiling.cullBehindDistance = v; bump() },
                min: 0, max: 50, step: 0.5,
                visible: () => SETTINGS.level.tiling.enabled,
            },
            // liveSync
            { type: 'boolean', label: 'liveSync.enabled', get: () => SETTINGS.level.liveSync.enabled, set: (v) => { SETTINGS.level.liveSync.enabled = v; bump() } },
            {
                type: 'text', label: 'liveSync.url',
                get: () => SETTINGS.level.liveSync.url,
                set: (v) => { SETTINGS.level.liveSync.url = v; bump() },
                visible: () => SETTINGS.level.liveSync.enabled,
            },
            {
                type: 'number', label: 'liveSync.reconnectMs',
                get: () => SETTINGS.level.liveSync.reconnectMs,
                set: (v) => { SETTINGS.level.liveSync.reconnectMs = v; bump() },
                min: 100, max: 10000, step: 100,
                visible: () => SETTINGS.level.liveSync.enabled,
            },
            {
                type: 'button', label: 'Reload level',
                action: () => {
                    // Import dynamically to avoid circular dependency
                    import('@/levelStore').then(({ useLevelStore }) => {
                        useLevelStore.getState().reloadCurrentLevel()
                    })
                },
            },
        ],
    },

    // ── Spawner ──
    {
        key: 'spawner',
        label: 'Spawner',
        fields: [
            { type: 'boolean', label: 'enabled', get: () => SETTINGS.spawner.enabled, set: (v) => { SETTINGS.spawner.enabled = v; bump() } },
            { type: 'number', label: 'spawnIntervalMs', get: () => SETTINGS.spawner.spawnIntervalMs, set: (v) => { SETTINGS.spawner.spawnIntervalMs = v; bump() }, min: 100, max: 10000, step: 50 },
            { type: 'number', label: 'speed', get: () => SETTINGS.spawner.speed, set: (v) => { SETTINGS.spawner.speed = v; bump() }, min: 0, max: 5, step: 0.01 },
            { type: 'number', label: 'speedVariance', get: () => SETTINGS.spawner.speedVariance, set: (v) => { SETTINGS.spawner.speedVariance = v; bump() }, min: 0, max: 2, step: 0.01 },
            { type: 'number', label: 'radius', get: () => SETTINGS.spawner.radius, set: (v) => { SETTINGS.spawner.radius = v; bump() }, min: 0, max: 10, step: 0.1 },
            { type: 'number', label: 'maxItems', get: () => SETTINGS.spawner.maxItems, set: (v) => { SETTINGS.spawner.maxItems = v; bump() }, min: 1, max: 200, step: 1 },
            {
                type: 'number', label: 'spawnAcceleration',
                get: () => SETTINGS.spawner.spawnAcceleration,
                set: (v) => { SETTINGS.spawner.spawnAcceleration = v; bump() },
                min: -0.05, max: 0.05, step: 0.0001,
            },
            {
                type: 'select', label: 'spawnAccelerationCurve',
                get: () => SETTINGS.spawner.spawnAccelerationCurve,
                set: (v) => { SETTINGS.spawner.spawnAccelerationCurve = v as typeof SETTINGS.spawner.spawnAccelerationCurve; bump() },
                options: ACCELERATION_CURVE_NAMES,
            },
            {
                type: 'number', label: 'maxItemsAcceleration',
                get: () => SETTINGS.spawner.maxItemsAcceleration,
                set: (v) => { SETTINGS.spawner.maxItemsAcceleration = v; bump() },
                min: -0.05, max: 0.05, step: 0.0001,
            },
            {
                type: 'select', label: 'maxItemsAccelCurve',
                get: () => SETTINGS.spawner.maxItemsAccelerationCurve,
                set: (v) => { SETTINGS.spawner.maxItemsAccelerationCurve = v as typeof SETTINGS.spawner.maxItemsAccelerationCurve; bump() },
                options: ACCELERATION_CURVE_NAMES,
            },
            { type: 'number', label: 'maxItemsCap', get: () => SETTINGS.spawner.maxItemsCap, set: (v) => { SETTINGS.spawner.maxItemsCap = v; bump() }, min: 1, max: 1000, step: 1 },
            { type: 'number', label: 'spawnXRange', get: () => SETTINGS.spawner.spawnXRange, set: (v) => { SETTINGS.spawner.spawnXRange = v; bump() }, min: 0, max: 10, step: 0.1 },
            { type: 'number', label: 'cullOffset', get: () => SETTINGS.spawner.cullOffset, set: (v) => { SETTINGS.spawner.cullOffset = v; bump() }, min: 0, max: 10, step: 0.1 },
        ],
    },

    // ── Motion Acceleration ──
    {
        key: 'motionAcceleration',
        label: 'Motion Acceleration',
        fields: [
            {
                type: 'number', label: 'camera.timeScaleAccel',
                get: () => SETTINGS.motionAcceleration.cameraTracker.timeScaleAcceleration,
                set: (v) => { SETTINGS.motionAcceleration.cameraTracker.timeScaleAcceleration = v; bump() },
                min: -0.05, max: 0.05, step: 0.0001,
            },
            {
                type: 'select', label: 'camera.accelCurve',
                get: () => SETTINGS.motionAcceleration.cameraTracker.timeScaleAccelerationCurve,
                set: (v) => { SETTINGS.motionAcceleration.cameraTracker.timeScaleAccelerationCurve = v as typeof SETTINGS.motionAcceleration.cameraTracker.timeScaleAccelerationCurve; bump() },
                options: ACCELERATION_CURVE_NAMES,
            },
            {
                type: 'number', label: 'balloons.timeScaleAccel',
                get: () => SETTINGS.motionAcceleration.balloons.timeScaleAcceleration,
                set: (v) => { SETTINGS.motionAcceleration.balloons.timeScaleAcceleration = v; bump() },
                min: -0.05, max: 0.05, step: 0.0001,
            },
            {
                type: 'select', label: 'balloons.accelCurve',
                get: () => SETTINGS.motionAcceleration.balloons.timeScaleAccelerationCurve,
                set: (v) => { SETTINGS.motionAcceleration.balloons.timeScaleAccelerationCurve = v as typeof SETTINGS.motionAcceleration.balloons.timeScaleAccelerationCurve; bump() },
                options: ACCELERATION_CURVE_NAMES,
            },
        ],
    },

    // ── Cursor ──
    {
        key: 'cursor',
        label: 'Cursor',
        fields: [
            { type: 'number', label: 'minPopVelocity', get: () => SETTINGS.cursor.minPopVelocity, set: (v) => { SETTINGS.cursor.minPopVelocity = v; bump() }, min: 0, max: 2000, step: 10 },
            { type: 'number', label: 'trail.maxAge', get: () => SETTINGS.cursor.trail.maxAge, set: (v) => { SETTINGS.cursor.trail.maxAge = v; bump() }, min: 0, max: 2, step: 0.01 },
            { type: 'color', label: 'trail.color', get: () => SETTINGS.cursor.trail.color, set: (v) => { SETTINGS.cursor.trail.color = v; bump() } },
            { type: 'number', label: 'trail.lineWidth', get: () => SETTINGS.cursor.trail.lineWidth, set: (v) => { SETTINGS.cursor.trail.lineWidth = v; bump() }, min: 0, max: 20, step: 0.5 },
            { type: 'number', label: 'trail.smoothing', get: () => SETTINGS.cursor.trail.smoothing, set: (v) => { SETTINGS.cursor.trail.smoothing = v; bump() }, min: 0, max: 1, step: 0.01 },
        ],
    },

    // ── Sounds ──
    {
        key: 'sounds',
        label: 'Sounds',
        fields: [
            { type: 'boolean', label: 'enabled', get: () => SETTINGS.sounds.enabled, set: (v) => { SETTINGS.sounds.enabled = v; bump() } },
            // pop
            {
                type: 'stringArray', label: 'pop.files',
                get: () => SETTINGS.sounds.pop.files,
                set: (v) => { SETTINGS.sounds.pop.files = v; bump() },
            },
            { type: 'number', label: 'pop.volume', get: () => SETTINGS.sounds.pop.volume, set: (v) => { SETTINGS.sounds.pop.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // felt
            {
                type: 'stringArray', label: 'felt.files',
                get: () => SETTINGS.sounds.felt.files,
                set: (v) => { SETTINGS.sounds.felt.files = v; bump() },
            },
            { type: 'number', label: 'felt.volume', get: () => SETTINGS.sounds.felt.volume, set: (v) => { SETTINGS.sounds.felt.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // steel
            {
                type: 'stringArray', label: 'steel.files',
                get: () => SETTINGS.sounds.steel.files,
                set: (v) => { SETTINGS.sounds.steel.files = v; bump() },
            },
            { type: 'number', label: 'steel.volume', get: () => SETTINGS.sounds.steel.volume, set: (v) => { SETTINGS.sounds.steel.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // error
            {
                type: 'stringArray', label: 'error.files',
                get: () => SETTINGS.sounds.error.files,
                set: (v) => { SETTINGS.sounds.error.files = v; bump() },
            },
            { type: 'number', label: 'error.volume', get: () => SETTINGS.sounds.error.volume, set: (v) => { SETTINGS.sounds.error.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // bee
            {
                type: 'stringArray', label: 'bee.files',
                get: () => SETTINGS.sounds.bee.files,
                set: (v) => { SETTINGS.sounds.bee.files = v; bump() },
            },
            { type: 'number', label: 'bee.volume', get: () => SETTINGS.sounds.bee.volume, set: (v) => { SETTINGS.sounds.bee.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // combo tier2
            {
                type: 'stringArray', label: 'combo.tier2.files',
                get: () => SETTINGS.sounds.combo.tier2.files,
                set: (v) => { SETTINGS.sounds.combo.tier2.files = v; bump() },
            },
            { type: 'number', label: 'combo.tier2.volume', get: () => SETTINGS.sounds.combo.tier2.volume, set: (v) => { SETTINGS.sounds.combo.tier2.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // combo tier3
            {
                type: 'stringArray', label: 'combo.tier3.files',
                get: () => SETTINGS.sounds.combo.tier3.files,
                set: (v) => { SETTINGS.sounds.combo.tier3.files = v; bump() },
            },
            { type: 'number', label: 'combo.tier3.volume', get: () => SETTINGS.sounds.combo.tier3.volume, set: (v) => { SETTINGS.sounds.combo.tier3.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // combo tier4+
            {
                type: 'stringArray', label: 'combo.tier4Plus.files',
                get: () => SETTINGS.sounds.combo.tier4Plus.files,
                set: (v) => { SETTINGS.sounds.combo.tier4Plus.files = v; bump() },
            },
            { type: 'number', label: 'combo.tier4Plus.volume', get: () => SETTINGS.sounds.combo.tier4Plus.volume, set: (v) => { SETTINGS.sounds.combo.tier4Plus.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            // swoosh
            {
                type: 'stringArray', label: 'swoosh.files',
                get: () => SETTINGS.sounds.swoosh.files,
                set: (v) => { SETTINGS.sounds.swoosh.files = v; bump() },
            },
            { type: 'number', label: 'swoosh.volume', get: () => SETTINGS.sounds.swoosh.volume, set: (v) => { SETTINGS.sounds.swoosh.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            { type: 'number', label: 'swoosh.minVelocity', get: () => SETTINGS.sounds.swoosh.minVelocity, set: (v) => { SETTINGS.sounds.swoosh.minVelocity = v; bump() }, min: 0, max: 5000, step: 10 },
            { type: 'number', label: 'swoosh.maxVelocity', get: () => SETTINGS.sounds.swoosh.maxVelocity, set: (v) => { SETTINGS.sounds.swoosh.maxVelocity = v; bump() }, min: 0, max: 10000, step: 50 },
            { type: 'number', label: 'swoosh.cooldownMs', get: () => SETTINGS.sounds.swoosh.cooldownMs, set: (v) => { SETTINGS.sounds.swoosh.cooldownMs = v; bump() }, min: 0, max: 2000, step: 10 },
        ],
    },
]
