import { SETTINGS, markShadingDirDirty, markShadowLightDirDirty } from '@/settings/GameSettings'
import { AUDIO_SETTINGS } from '@/audio/AudioSettings'
import type { AudioBankId } from '@/audio/AudioSettings.types'
import { reloadAudioBank, syncAudioMixerGainsFromSettings } from '@/audio/SoundManager'
import { sendScoreboardSettingsSync } from '@/scoreboard/scoreboardSender'
import {
    RENDER_STYLES,
    CURSOR_INPUT_SOURCES,
    CAMERA_MODES,
    CAMERA_FOLLOW_Z_CLAMP_MODES,
    HIGH_SCORE_DATABASE_FALLBACK_MODES,
    HIGH_SCORE_ENTRY_MODES,
    HIGH_SCORE_STORAGE_MODES,
    RUN_MODES,
    SMAA_PRESET_NAMES,
    PALETTE_VARIANT_NAMES,
    SPAWN_EVENT_SELECTION_MODES,
} from '@/settings/GameSettings.types'
import type { Vec3, AxisMask, PaletteVariant, PaletteVariantName } from '@/settings/GameSettings.types'
import { ACCELERATION_CURVE_NAMES } from '@/utils/accelerationCurve'
import { EASING_NAMES } from '@/utils/easing'
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

function setAudioBankFiles(bankId: AudioBankId, files: string[]) {
    AUDIO_SETTINGS.banks[bankId].files = files
    void reloadAudioBank(bankId)
    bump()
}

function setAudioBankVolume(bankId: AudioBankId, volume: number) {
    AUDIO_SETTINGS.banks[bankId].volume = volume
    bump()
}

function setAudioMixVolume(field: 'masterVolume' | 'sfxMasterVolume' | 'musicMasterVolume', value: number) {
    AUDIO_SETTINGS.mix[field] = value
    syncAudioMixerGainsFromSettings()
    bump()
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
            {
                type: 'boolean', label: 'ui.showEventLog',
                get: () => SETTINGS.scoreboard.ui.showEventLog,
                set: (v) => {
                    SETTINGS.scoreboard.ui.showEventLog = v
                    bump()
                    sendScoreboardSettingsSync({ force: true })
                },
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
            // run mode / time mode
            {
                type: 'select', label: 'run.mode',
                get: () => SETTINGS.gameplay.run.mode,
                set: (v) => { SETTINGS.gameplay.run.mode = v as typeof SETTINGS.gameplay.run.mode; bump() },
                options: RUN_MODES,
            },
            { type: 'number', label: 'run.timeLimitMs', get: () => SETTINGS.gameplay.run.timeLimitMs, set: (v) => { SETTINGS.gameplay.run.timeLimitMs = v; bump() }, min: 1000, max: 3600000, step: 1000 },
            { type: 'number', label: 'run.comboTimeBonusStepMs', get: () => SETTINGS.gameplay.run.comboTimeBonusStepMs, set: (v) => { SETTINGS.gameplay.run.comboTimeBonusStepMs = v; bump() }, min: 0, max: 60000, step: 100 },
            { type: 'number', label: 'run.popStreakTimeBonusEveryPops', get: () => SETTINGS.gameplay.run.popStreakTimeBonusEveryPops, set: (v) => { SETTINGS.gameplay.run.popStreakTimeBonusEveryPops = v; bump() }, min: 0, max: 200, step: 1 },
            { type: 'number', label: 'run.popStreakTimeBonusMs', get: () => SETTINGS.gameplay.run.popStreakTimeBonusMs, set: (v) => { SETTINGS.gameplay.run.popStreakTimeBonusMs = v; bump() }, min: 0, max: 60000, step: 100 },
            { type: 'number', label: 'run.timeBonusLerpMs', get: () => SETTINGS.gameplay.run.timeBonusLerpMs, set: (v) => { SETTINGS.gameplay.run.timeBonusLerpMs = v; bump() }, min: 0, max: 5000, step: 10 },
            { type: 'number', label: 'run.pulseSlowStartMs', get: () => SETTINGS.gameplay.run.pulseSlowStartMs, set: (v) => { SETTINGS.gameplay.run.pulseSlowStartMs = v; bump() }, min: 0, max: 120000, step: 100 },
            { type: 'number', label: 'run.pulseFastStartMs', get: () => SETTINGS.gameplay.run.pulseFastStartMs, set: (v) => { SETTINGS.gameplay.run.pulseFastStartMs = v; bump() }, min: 0, max: 120000, step: 100 },
            // high score storage
            {
                type: 'select', label: 'highScore.storageMode',
                get: () => SETTINGS.gameplay.highScore.storageMode,
                set: (v) => { SETTINGS.gameplay.highScore.storageMode = v as typeof SETTINGS.gameplay.highScore.storageMode; bump() },
                options: HIGH_SCORE_STORAGE_MODES,
            },
            {
                type: 'number', label: 'highScore.maxEntries',
                get: () => SETTINGS.gameplay.highScore.maxEntries,
                set: (v) => { SETTINGS.gameplay.highScore.maxEntries = v; bump() },
                min: 1, max: 5000, step: 1,
            },
            {
                type: 'text', label: 'highScore.localStorageKey',
                get: () => SETTINGS.gameplay.highScore.localStorageKey,
                set: (v) => { SETTINGS.gameplay.highScore.localStorageKey = v; bump() },
            },
            {
                type: 'text', label: 'highScore.databaseApiBaseUrl',
                get: () => SETTINGS.gameplay.highScore.databaseApiBaseUrl,
                set: (v) => { SETTINGS.gameplay.highScore.databaseApiBaseUrl = v; bump() },
                visible: () => SETTINGS.gameplay.highScore.storageMode === 'database',
            },
            {
                type: 'select', label: 'highScore.databaseFallbackMode',
                get: () => SETTINGS.gameplay.highScore.databaseFallbackMode,
                set: (v) => { SETTINGS.gameplay.highScore.databaseFallbackMode = v as typeof SETTINGS.gameplay.highScore.databaseFallbackMode; bump() },
                options: HIGH_SCORE_DATABASE_FALLBACK_MODES,
                visible: () => SETTINGS.gameplay.highScore.storageMode === 'database',
            },
            { type: 'number', label: 'flow.gameOverInputInactivityMs', get: () => SETTINGS.gameplay.flow.gameOverInputInactivityMs, set: (v) => { SETTINGS.gameplay.flow.gameOverInputInactivityMs = v; bump() }, min: 1000, max: 30000, step: 100 },
            { type: 'number', label: 'flow.gameOverInputCountdownMs', get: () => SETTINGS.gameplay.flow.gameOverInputCountdownMs, set: (v) => { SETTINGS.gameplay.flow.gameOverInputCountdownMs = v; bump() }, min: 1000, max: 30000, step: 100 },
            {
                type: 'select', label: 'flow.highScoreEntryMode',
                get: () => SETTINGS.gameplay.flow.highScoreEntryMode,
                set: (v) => { SETTINGS.gameplay.flow.highScoreEntryMode = v as typeof SETTINGS.gameplay.flow.highScoreEntryMode; bump() },
                options: HIGH_SCORE_ENTRY_MODES,
            },
            { type: 'number', label: 'flow.highScoreEntrySwipe.letterMinVelocityPx', get: () => SETTINGS.gameplay.flow.highScoreEntrySwipe.letterMinVelocityPx, set: (v) => { SETTINGS.gameplay.flow.highScoreEntrySwipe.letterMinVelocityPx = v; bump() }, min: 0, max: 3000, step: 10 },
            { type: 'number', label: 'flow.highScoreEntrySwipe.letterMinDistancePx', get: () => SETTINGS.gameplay.flow.highScoreEntrySwipe.letterMinDistancePx, set: (v) => { SETTINGS.gameplay.flow.highScoreEntrySwipe.letterMinDistancePx = v; bump() }, min: 0, max: 200, step: 1 },
            { type: 'number', label: 'flow.highScoreEntrySwipe.letterCooldownMs', get: () => SETTINGS.gameplay.flow.highScoreEntrySwipe.letterCooldownMs, set: (v) => { SETTINGS.gameplay.flow.highScoreEntrySwipe.letterCooldownMs = v; bump() }, min: 0, max: 1000, step: 5 },
            { type: 'number', label: 'flow.highScoreEntrySwipe.buttonDwellMs', get: () => SETTINGS.gameplay.flow.highScoreEntrySwipe.buttonDwellMs, set: (v) => { SETTINGS.gameplay.flow.highScoreEntrySwipe.buttonDwellMs = v; bump() }, min: 0, max: 2000, step: 10 },
            { type: 'number', label: 'flow.highScoreEntrySwipe.buttonDwellJitterGraceMs', get: () => SETTINGS.gameplay.flow.highScoreEntrySwipe.buttonDwellJitterGraceMs, set: (v) => { SETTINGS.gameplay.flow.highScoreEntrySwipe.buttonDwellJitterGraceMs = v; bump() }, min: 0, max: 500, step: 5 },
            { type: 'number', label: 'flow.gameOverTravelSpeedMultiplier', get: () => SETTINGS.gameplay.flow.gameOverTravelSpeedMultiplier, set: (v) => { SETTINGS.gameplay.flow.gameOverTravelSpeedMultiplier = v; bump() }, min: 0, max: 20, step: 0.1 },
            { type: 'number', label: 'flow.gameOverTravelSpeedEaseInMs', get: () => SETTINGS.gameplay.flow.gameOverTravelSpeedEaseInMs, set: (v) => { SETTINGS.gameplay.flow.gameOverTravelSpeedEaseInMs = v; bump() }, min: 0, max: 5000, step: 10 },
            {
                type: 'select', label: 'flow.gameOverTravelSpeedEaseInEasing',
                get: () => SETTINGS.gameplay.flow.gameOverTravelSpeedEaseInEasing,
                set: (v) => { SETTINGS.gameplay.flow.gameOverTravelSpeedEaseInEasing = v as typeof SETTINGS.gameplay.flow.gameOverTravelSpeedEaseInEasing; bump() },
                options: EASING_NAMES,
            },
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
                type: 'stringArray', label: 'tiling.runFiles',
                get: () => SETTINGS.level.tiling.runFiles,
                set: (v) => { SETTINGS.level.tiling.runFiles = v; bump() },
                visible: () => SETTINGS.level.tiling.enabled,
            },
            {
                type: 'stringArray', label: 'tiling.idleFiles',
                get: () => SETTINGS.level.tiling.idleFiles,
                set: (v) => { SETTINGS.level.tiling.idleFiles = v; bump() },
                visible: () => SETTINGS.level.tiling.enabled,
            },
            {
                type: 'stringArray', label: 'tiling.gameOverFiles',
                get: () => SETTINGS.level.tiling.gameOverFiles,
                set: (v) => { SETTINGS.level.tiling.gameOverFiles = v; bump() },
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
            { type: 'number', label: 'spawnXRangeOffset', get: () => SETTINGS.spawner.spawnXRangeOffset, set: (v) => { SETTINGS.spawner.spawnXRangeOffset = v; bump() }, min: -10, max: 10, step: 0.1 },
            { type: 'number', label: 'cullOffset', get: () => SETTINGS.spawner.cullOffset, set: (v) => { SETTINGS.spawner.cullOffset = v; bump() }, min: 0, max: 10, step: 0.1 },
            {
                type: 'select', label: 'eventSelectionMode',
                get: () => SETTINGS.spawner.eventSelectionMode,
                set: (v) => { SETTINGS.spawner.eventSelectionMode = v as typeof SETTINGS.spawner.eventSelectionMode; bump() },
                options: SPAWN_EVENT_SELECTION_MODES,
            },
            { type: 'boolean', label: 'eventQueueEnabled', get: () => SETTINGS.spawner.eventQueueEnabled, set: (v) => { SETTINGS.spawner.eventQueueEnabled = v; bump() } },
            { type: 'number', label: 'eventQueueGapMs', get: () => SETTINGS.spawner.eventQueueGapMs, set: (v) => { SETTINGS.spawner.eventQueueGapMs = v; bump() }, min: 0, max: 30000, step: 100 },
            { type: 'number', label: 'eventQueueMaxLength', get: () => SETTINGS.spawner.eventQueueMaxLength, set: (v) => { SETTINGS.spawner.eventQueueMaxLength = v; bump() }, min: 0, max: 20, step: 1 },
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
                type: 'number', label: 'camera.timeScaleAccelMaxMult',
                get: () => SETTINGS.motionAcceleration.cameraTracker.timeScaleAccelerationMaxMultiplier,
                set: (v) => { SETTINGS.motionAcceleration.cameraTracker.timeScaleAccelerationMaxMultiplier = v; bump() },
                min: 0, max: 20, step: 0.1,
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
            {
                type: 'number', label: 'balloons.timeScaleAccelMaxMult',
                get: () => SETTINGS.motionAcceleration.balloons.timeScaleAccelerationMaxMultiplier,
                set: (v) => { SETTINGS.motionAcceleration.balloons.timeScaleAccelerationMaxMultiplier = v; bump() },
                min: 0, max: 20, step: 0.1,
            },
        ],
    },

    // ── Cursor ──
    {
        key: 'cursor',
        label: 'Cursor',
        fields: [
            {
                type: 'boolean', label: 'useMouseInput',
                get: () => SETTINGS.cursor.inputSource === 'mouse',
                set: (v) => { SETTINGS.cursor.inputSource = v ? 'mouse' : 'external'; bump() },
            },
            {
                type: 'select', label: 'inputSource',
                get: () => SETTINGS.cursor.inputSource,
                set: (v) => { SETTINGS.cursor.inputSource = v as typeof SETTINGS.cursor.inputSource; bump() },
                options: CURSOR_INPUT_SOURCES,
            },
            { type: 'number', label: 'minPopVelocity', get: () => SETTINGS.cursor.minPopVelocity, set: (v) => { SETTINGS.cursor.minPopVelocity = v; bump() }, min: 0, max: 2000, step: 10 },
            { type: 'number', label: 'pointerRadiusPx', get: () => SETTINGS.cursor.pointerRadiusPx, set: (v) => { SETTINGS.cursor.pointerRadiusPx = v; bump() }, min: 0, max: 80, step: 1 },
            { type: 'number', label: 'hitRadiusPx', get: () => SETTINGS.cursor.hitRadiusPx, set: (v) => { SETTINGS.cursor.hitRadiusPx = v; bump() }, min: 0, max: 120, step: 1 },
            { type: 'boolean', label: 'external.enabled', get: () => SETTINGS.cursor.external.enabled, set: (v) => { SETTINGS.cursor.external.enabled = v; bump() } },
            {
                type: 'text', label: 'external.websocket.url',
                get: () => SETTINGS.cursor.external.websocket.url,
                set: (v) => { SETTINGS.cursor.external.websocket.url = v; bump() },
                visible: () => SETTINGS.cursor.inputSource === 'external' && SETTINGS.cursor.external.enabled,
            },
            {
                type: 'number', label: 'external.websocket.reconnectMs',
                get: () => SETTINGS.cursor.external.websocket.reconnectMs,
                set: (v) => { SETTINGS.cursor.external.websocket.reconnectMs = v; bump() },
                min: 100, max: 10000, step: 100,
                visible: () => SETTINGS.cursor.inputSource === 'external' && SETTINGS.cursor.external.enabled,
            },
            {
                type: 'number', label: 'external.staleTimeoutMs',
                get: () => SETTINGS.cursor.external.staleTimeoutMs,
                set: (v) => { SETTINGS.cursor.external.staleTimeoutMs = v; bump() },
                min: 16, max: 2000, step: 1,
                visible: () => SETTINGS.cursor.inputSource === 'external' && SETTINGS.cursor.external.enabled,
            },
            {
                type: 'number', label: 'external.maxPointers',
                get: () => SETTINGS.cursor.external.maxPointers,
                set: (v) => { SETTINGS.cursor.external.maxPointers = v; bump() },
                min: 1, max: 2, step: 1,
                visible: () => SETTINGS.cursor.inputSource === 'external' && SETTINGS.cursor.external.enabled,
            },
            {
                type: 'number', label: 'external.alphabetGridEntryMaxPointers',
                get: () => SETTINGS.cursor.external.alphabetGridEntryMaxPointers,
                set: (v) => { SETTINGS.cursor.external.alphabetGridEntryMaxPointers = v; bump() },
                min: 1, max: 2, step: 1,
                visible: () => SETTINGS.cursor.inputSource === 'external' && SETTINGS.cursor.external.enabled,
            },
            { type: 'number', label: 'trail.maxAge', get: () => SETTINGS.cursor.trail.maxAge, set: (v) => { SETTINGS.cursor.trail.maxAge = v; bump() }, min: 0, max: 2, step: 0.01 },
            { type: 'color', label: 'trail.color', get: () => SETTINGS.cursor.trail.color, set: (v) => { SETTINGS.cursor.trail.color = v; bump() } },
            { type: 'number', label: 'trail.lineWidth', get: () => SETTINGS.cursor.trail.lineWidth, set: (v) => { SETTINGS.cursor.trail.lineWidth = v; bump() }, min: 0, max: 20, step: 0.5 },
            { type: 'number', label: 'trail.followSmoothing', get: () => SETTINGS.cursor.trail.followSmoothing, set: (v) => { SETTINGS.cursor.trail.followSmoothing = v; bump() }, min: 0, max: 1, step: 0.01 },
            { type: 'number', label: 'trail.smoothing', get: () => SETTINGS.cursor.trail.smoothing, set: (v) => { SETTINGS.cursor.trail.smoothing = v; bump() }, min: 0, max: 1, step: 0.01 },
        ],
    },

    // ── Sounds ──
    {
        key: 'sounds',
        label: 'Sounds',
        fields: [
            {
                type: 'boolean',
                label: 'enabled',
                get: () => AUDIO_SETTINGS.enabled,
                set: (v) => { AUDIO_SETTINGS.enabled = v; syncAudioMixerGainsFromSettings(); bump() },
            },
            { type: 'number', label: 'mix.masterVolume', get: () => AUDIO_SETTINGS.mix.masterVolume, set: (v) => { setAudioMixVolume('masterVolume', v) }, min: 0, max: 2, step: 0.05 },
            { type: 'number', label: 'mix.sfxMasterVolume', get: () => AUDIO_SETTINGS.mix.sfxMasterVolume, set: (v) => { setAudioMixVolume('sfxMasterVolume', v) }, min: 0, max: 2, step: 0.05 },
            { type: 'number', label: 'mix.musicMasterVolume', get: () => AUDIO_SETTINGS.mix.musicMasterVolume, set: (v) => { setAudioMixVolume('musicMasterVolume', v) }, min: 0, max: 2, step: 0.05 },
            { type: 'number', label: 'music.idleSequence.volume', get: () => AUDIO_SETTINGS.music.idleSequence.volume, set: (v) => { AUDIO_SETTINGS.music.idleSequence.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            { type: 'number', label: 'music.runSequence.volume', get: () => AUDIO_SETTINGS.music.runSequence.volume, set: (v) => { AUDIO_SETTINGS.music.runSequence.volume = v; bump() }, min: 0, max: 2, step: 0.05 },
            { type: 'number', label: 'music.eventSequences.game_over.volume', get: () => AUDIO_SETTINGS.music.eventSequences.game_over?.volume ?? 1, set: (v) => { if (AUDIO_SETTINGS.music.eventSequences.game_over) { AUDIO_SETTINGS.music.eventSequences.game_over.volume = v; bump() } }, min: 0, max: 2, step: 0.05 },
            // pop
            {
                type: 'stringArray', label: 'pop.files',
                get: () => AUDIO_SETTINGS.banks.pop.files,
                set: (v) => { setAudioBankFiles('pop', v) },
            },
            { type: 'number', label: 'pop.volume', get: () => AUDIO_SETTINGS.banks.pop.volume, set: (v) => { setAudioBankVolume('pop', v) }, min: 0, max: 2, step: 0.05 },
            // felt
            {
                type: 'stringArray', label: 'felt.files',
                get: () => AUDIO_SETTINGS.banks.felt.files,
                set: (v) => { setAudioBankFiles('felt', v) },
            },
            { type: 'number', label: 'felt.volume', get: () => AUDIO_SETTINGS.banks.felt.volume, set: (v) => { setAudioBankVolume('felt', v) }, min: 0, max: 2, step: 0.05 },
            // steel
            {
                type: 'stringArray', label: 'steel.files',
                get: () => AUDIO_SETTINGS.banks.steel.files,
                set: (v) => { setAudioBankFiles('steel', v) },
            },
            { type: 'number', label: 'steel.volume', get: () => AUDIO_SETTINGS.banks.steel.volume, set: (v) => { setAudioBankVolume('steel', v) }, min: 0, max: 2, step: 0.05 },
            // error
            {
                type: 'stringArray', label: 'error.files',
                get: () => AUDIO_SETTINGS.banks.error.files,
                set: (v) => { setAudioBankFiles('error', v) },
            },
            { type: 'number', label: 'error.volume', get: () => AUDIO_SETTINGS.banks.error.volume, set: (v) => { setAudioBankVolume('error', v) }, min: 0, max: 2, step: 0.05 },
            // bee
            {
                type: 'stringArray', label: 'bee.files',
                get: () => AUDIO_SETTINGS.banks.bee.files,
                set: (v) => { setAudioBankFiles('bee', v) },
            },
            { type: 'number', label: 'bee.volume', get: () => AUDIO_SETTINGS.banks.bee.volume, set: (v) => { setAudioBankVolume('bee', v) }, min: 0, max: 2, step: 0.05 },
            // combo tier2
            {
                type: 'stringArray', label: 'combo.tier2.files',
                get: () => AUDIO_SETTINGS.banks.comboTier2.files,
                set: (v) => { setAudioBankFiles('comboTier2', v) },
            },
            { type: 'number', label: 'combo.tier2.volume', get: () => AUDIO_SETTINGS.banks.comboTier2.volume, set: (v) => { setAudioBankVolume('comboTier2', v) }, min: 0, max: 2, step: 0.05 },
            // combo tier3
            {
                type: 'stringArray', label: 'combo.tier3.files',
                get: () => AUDIO_SETTINGS.banks.comboTier3.files,
                set: (v) => { setAudioBankFiles('comboTier3', v) },
            },
            { type: 'number', label: 'combo.tier3.volume', get: () => AUDIO_SETTINGS.banks.comboTier3.volume, set: (v) => { setAudioBankVolume('comboTier3', v) }, min: 0, max: 2, step: 0.05 },
            // combo tier4+
            {
                type: 'stringArray', label: 'combo.tier4Plus.files',
                get: () => AUDIO_SETTINGS.banks.comboTier4Plus.files,
                set: (v) => { setAudioBankFiles('comboTier4Plus', v) },
            },
            { type: 'number', label: 'combo.tier4Plus.volume', get: () => AUDIO_SETTINGS.banks.comboTier4Plus.volume, set: (v) => { setAudioBankVolume('comboTier4Plus', v) }, min: 0, max: 2, step: 0.05 },
            // swoosh
            {
                type: 'stringArray', label: 'swoosh.files',
                get: () => AUDIO_SETTINGS.banks.swoosh.files,
                set: (v) => { setAudioBankFiles('swoosh', v) },
            },
            { type: 'number', label: 'swoosh.volume', get: () => AUDIO_SETTINGS.banks.swoosh.volume, set: (v) => { setAudioBankVolume('swoosh', v) }, min: 0, max: 2, step: 0.05 },
            { type: 'number', label: 'swoosh.minVelocity', get: () => AUDIO_SETTINGS.rules.swoosh.minVelocity, set: (v) => { AUDIO_SETTINGS.rules.swoosh.minVelocity = v; bump() }, min: 0, max: 5000, step: 10 },
            { type: 'number', label: 'swoosh.maxVelocity', get: () => AUDIO_SETTINGS.rules.swoosh.maxVelocity, set: (v) => { AUDIO_SETTINGS.rules.swoosh.maxVelocity = v; bump() }, min: 0, max: 10000, step: 50 },
            { type: 'number', label: 'swoosh.cooldownMs', get: () => AUDIO_SETTINGS.rules.swoosh.cooldownMs, set: (v) => { AUDIO_SETTINGS.rules.swoosh.cooldownMs = v; bump() }, min: 0, max: 2000, step: 10 },
        ],
    },
]
