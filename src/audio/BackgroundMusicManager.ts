import { AUDIO_SETTINGS } from '@/audio/AudioSettings'
import type {
  AudioMusicEventTimelineEntry,
  AudioMusicRunTimelineEntry,
} from '@/audio/AudioSettings.types'
import { getMusicBusNode, getOrCreateAudioContext } from '@/audio/SoundManager'

type LoadedMusicLoop = {
  id: string
  file: string
  buffer: AudioBuffer
  durationSec: number
  markersSec: number[]
  volume: number
}

type PendingLoopRequest = {
  loopId: string
  sequenceVolume: number
  sequenceVersion: number
}

type ScheduledSwitch = {
  boundaryCtxSec: number
  source: AudioBufferSourceNode
  gain: GainNode
  commitTimer: ReturnType<typeof setTimeout> | null
  request: PendingLoopRequest
}

type NormalizedRunStep = {
  atSec: number
  loopId: string
}

type NormalizedEventStep = {
  atLoop: number
  loopId: string
}

type SequenceMode = 'none' | 'idle' | 'run' | 'event'

const LOOP_EPSILON_SEC = 0.0005
const SWITCH_COMMIT_PADDING_MS = 12

const loadedMusicLoops = new Map<string, LoadedMusicLoop>()

let preloaded = false
let activeLoopId: string | null = null
let activeSource: AudioBufferSourceNode | null = null
let activeGain: GainNode | null = null
let activeStartCtxSec = 0
let activeSequenceVolume = 1

let pendingLoopLww: PendingLoopRequest | null = null
let scheduledSwitch: ScheduledSwitch | null = null

let activeSequenceMode: SequenceMode = 'none'
let activeSequenceVersion = 0
let activeIdleEpoch = Number.NEGATIVE_INFINITY
let activeRunEpoch = Number.NEGATIVE_INFINITY
let idleTimeline: NormalizedRunStep[] = []
let idleNextIndex = 0
let runTimeline: NormalizedRunStep[] = []
let runNextIndex = 0

let eventTimeline: NormalizedEventStep[] = []
let eventNextIndex = 0
let eventCompletedLoops = 0
let eventLoopTimer: ReturnType<typeof setTimeout> | null = null

function normalizeNonNegative(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, value)
}

function normalizeMarkers(markers: number[] | undefined, durationSec: number): number[] {
  if (!Array.isArray(markers) || markers.length === 0) return []

  const normalized: number[] = []
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i]
    if (!Number.isFinite(marker)) continue
    if (!(marker > 0)) continue
    if (!(marker < durationSec)) continue
    normalized.push(marker)
  }

  normalized.sort((a, b) => a - b)
  const deduped: number[] = []
  for (let i = 0; i < normalized.length; i += 1) {
    const marker = normalized[i]
    if (i > 0 && Math.abs(marker - normalized[i - 1]) < LOOP_EPSILON_SEC) continue
    deduped.push(marker)
  }
  return deduped
}

function normalizeRunTimeline(entries: AudioMusicRunTimelineEntry[]): NormalizedRunStep[] {
  const normalized = entries
    .filter((entry) => (
      Number.isFinite(entry.atSec)
      && entry.atSec >= 0
      && typeof entry.loopId === 'string'
      && entry.loopId.length > 0
    ))
    .map((entry) => ({ atSec: entry.atSec, loopId: entry.loopId }))
  normalized.sort((a, b) => a.atSec - b.atSec)
  return normalized
}

function normalizeEventTimeline(entries: AudioMusicEventTimelineEntry[]): NormalizedEventStep[] {
  const normalized = entries
    .filter((entry) => (
      Number.isFinite(entry.atLoop)
      && entry.atLoop >= 0
      && typeof entry.loopId === 'string'
      && entry.loopId.length > 0
    ))
    .map((entry) => ({ atLoop: Math.trunc(entry.atLoop), loopId: entry.loopId }))
  normalized.sort((a, b) => a.atLoop - b.atLoop)
  return normalized
}

function resolvePositiveModulo(value: number, mod: number): number {
  if (!(mod > 0)) return 0
  const result = value % mod
  return result < 0 ? result + mod : result
}

function resolveLoopGain(loop: LoadedMusicLoop, sequenceVolume: number): number {
  return loop.volume * sequenceVolume
}

function getLoadedLoop(loopId: string): LoadedMusicLoop | null {
  const loaded = loadedMusicLoops.get(loopId)
  if (loaded) return loaded
  console.error(`[BackgroundMusicManager] Unknown or unloaded loop: ${loopId}`)
  return null
}

function createLoopPlayback(
  loop: LoadedMusicLoop,
  startCtxSec: number,
  sequenceVolume: number,
): { source: AudioBufferSourceNode; gain: GainNode } {
  const audioCtx = getOrCreateAudioContext()
  const source = audioCtx.createBufferSource()
  source.buffer = loop.buffer
  source.loop = true

  const gain = audioCtx.createGain()
  gain.gain.value = resolveLoopGain(loop, sequenceVolume)

  source.connect(gain)
  gain.connect(getMusicBusNode())

  source.onended = () => {
    source.disconnect()
    gain.disconnect()
  }
  source.start(startCtxSec)
  return { source, gain }
}

function clearEventLoopTimer(): void {
  if (!eventLoopTimer) return
  clearTimeout(eventLoopTimer)
  eventLoopTimer = null
}

function clearScheduledSwitch(): void {
  if (!scheduledSwitch) return
  if (scheduledSwitch.commitTimer !== null) {
    clearTimeout(scheduledSwitch.commitTimer)
  }
  try {
    scheduledSwitch.source.stop()
  } catch {
    // no-op
  }
  scheduledSwitch.source.disconnect()
  scheduledSwitch.gain.disconnect()
  scheduledSwitch = null
}

function stopActivePlayback(): void {
  if (activeSource) {
    try {
      activeSource.stop()
    } catch {
      // no-op
    }
    activeSource.disconnect()
  }
  if (activeGain) {
    activeGain.disconnect()
  }
  activeSource = null
  activeGain = null
  activeLoopId = null
  activeStartCtxSec = 0
}

function resolveNextSwitchBoundaryCtxSec(nowCtxSec: number, activeLoop: LoadedMusicLoop): number {
  const duration = activeLoop.durationSec
  if (!(duration > LOOP_EPSILON_SEC)) return nowCtxSec + 0.1

  const cyclePos = resolvePositiveModulo(nowCtxSec - activeStartCtxSec, duration)
  const markers = activeLoop.markersSec
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i]
    if (marker > cyclePos + LOOP_EPSILON_SEC) {
      return nowCtxSec + (marker - cyclePos)
    }
  }

  let remaining = duration - cyclePos
  if (!(remaining > LOOP_EPSILON_SEC)) {
    remaining = duration
  }
  return nowCtxSec + remaining
}

function resolveNextLoopCompletionCtxSec(nowCtxSec: number, activeLoop: LoadedMusicLoop): number {
  const duration = activeLoop.durationSec
  if (!(duration > LOOP_EPSILON_SEC)) return nowCtxSec + 0.1

  const cyclePos = resolvePositiveModulo(nowCtxSec - activeStartCtxSec, duration)
  let remaining = duration - cyclePos
  if (!(remaining > LOOP_EPSILON_SEC)) {
    remaining = duration
  }
  return nowCtxSec + remaining
}

function scheduleEventLoopCompletionTimer(): void {
  clearEventLoopTimer()
  if (activeSequenceMode !== 'event') return
  if (!activeLoopId || !activeSource) return

  const activeLoop = getLoadedLoop(activeLoopId)
  if (!activeLoop) return

  const audioCtx = getOrCreateAudioContext()
  const nowCtxSec = audioCtx.currentTime
  const boundaryCtxSec = resolveNextLoopCompletionCtxSec(nowCtxSec, activeLoop)
  const delayMs = Math.max(0, (boundaryCtxSec - nowCtxSec) * 1000 + SWITCH_COMMIT_PADDING_MS)
  const sequenceVersion = activeSequenceVersion

  eventLoopTimer = setTimeout(() => {
    if (sequenceVersion !== activeSequenceVersion) return
    if (activeSequenceMode !== 'event') return

    eventCompletedLoops += 1
    flushEventTimelineForCurrentLoopCount()
    scheduleEventLoopCompletionTimer()
  }, delayMs)
}

function commitScheduledSwitch(): void {
  const scheduled = scheduledSwitch
  if (!scheduled) return
  if (scheduled.commitTimer !== null) {
    clearTimeout(scheduled.commitTimer)
  }

  scheduledSwitch = null
  activeLoopId = scheduled.request.loopId
  activeSource = scheduled.source
  activeGain = scheduled.gain
  activeStartCtxSec = scheduled.boundaryCtxSec
  activeSequenceVolume = scheduled.request.sequenceVolume

  if (activeSequenceMode === 'event') {
    scheduleEventLoopCompletionTimer()
  }
}

function scheduleSwitch(request: PendingLoopRequest): void {
  if (!activeLoopId || !activeSource || !activeGain) return
  if (request.sequenceVersion !== activeSequenceVersion) return

  const targetLoop = getLoadedLoop(request.loopId)
  if (!targetLoop) return

  const audioCtx = getOrCreateAudioContext()
  const nowCtxSec = audioCtx.currentTime

  if (scheduledSwitch && nowCtxSec < scheduledSwitch.boundaryCtxSec - LOOP_EPSILON_SEC) {
    const replacement = createLoopPlayback(
      targetLoop,
      scheduledSwitch.boundaryCtxSec,
      request.sequenceVolume,
    )
    if (scheduledSwitch.commitTimer !== null) {
      clearTimeout(scheduledSwitch.commitTimer)
    }
    try {
      scheduledSwitch.source.stop()
    } catch {
      // no-op
    }
    scheduledSwitch.source.disconnect()
    scheduledSwitch.gain.disconnect()
    scheduledSwitch.source = replacement.source
    scheduledSwitch.gain = replacement.gain
    scheduledSwitch.request = request
    const delayMs = Math.max(0, (scheduledSwitch.boundaryCtxSec - nowCtxSec) * 1000 + SWITCH_COMMIT_PADDING_MS)
    scheduledSwitch.commitTimer = setTimeout(() => {
      if (request.sequenceVersion !== activeSequenceVersion) return
      commitScheduledSwitch()
    }, delayMs)
    return
  }

  clearScheduledSwitch()

  const currentLoop = getLoadedLoop(activeLoopId)
  if (!currentLoop) return
  const boundaryCtxSec = resolveNextSwitchBoundaryCtxSec(nowCtxSec, currentLoop)
  const nextPlayback = createLoopPlayback(targetLoop, boundaryCtxSec, request.sequenceVolume)

  activeSource.stop(boundaryCtxSec)

  const delayMs = Math.max(0, (boundaryCtxSec - nowCtxSec) * 1000 + SWITCH_COMMIT_PADDING_MS)
  const commitTimer = setTimeout(() => {
    if (request.sequenceVersion !== activeSequenceVersion) return
    commitScheduledSwitch()
  }, delayMs)

  scheduledSwitch = {
    boundaryCtxSec,
    source: nextPlayback.source,
    gain: nextPlayback.gain,
    commitTimer,
    request,
  }
}

function queueLoopRequest(loopId: string, sequenceVolume: number, sequenceVersion: number): void {
  pendingLoopLww = {
    loopId,
    sequenceVolume,
    sequenceVersion,
  }
  flushPendingLoopRequest()
}

function flushPendingLoopRequest(): void {
  if (!pendingLoopLww) return
  if (!AUDIO_SETTINGS.enabled || !AUDIO_SETTINGS.music.enabled) {
    pendingLoopLww = null
    return
  }
  if (!preloaded) return

  const request = pendingLoopLww
  pendingLoopLww = null
  if (request.sequenceVersion !== activeSequenceVersion) return

  if (!activeLoopId || !activeSource || !activeGain) {
    const loop = getLoadedLoop(request.loopId)
    if (!loop) return

    clearScheduledSwitch()
    stopActivePlayback()

    const audioCtx = getOrCreateAudioContext()
    const startCtxSec = audioCtx.currentTime + LOOP_EPSILON_SEC
    const playback = createLoopPlayback(loop, startCtxSec, request.sequenceVolume)

    activeLoopId = request.loopId
    activeSource = playback.source
    activeGain = playback.gain
    activeStartCtxSec = startCtxSec
    activeSequenceVolume = request.sequenceVolume

    if (activeSequenceMode === 'event') {
      scheduleEventLoopCompletionTimer()
    }
    return
  }

  if (activeLoopId === request.loopId) {
    activeSequenceVolume = request.sequenceVolume
    const activeLoop = getLoadedLoop(activeLoopId)
    if (activeLoop && activeGain) {
      activeGain.gain.value = resolveLoopGain(activeLoop, request.sequenceVolume)
    }
    if (activeSequenceMode === 'event') {
      scheduleEventLoopCompletionTimer()
    }
    return
  }

  scheduleSwitch(request)
}

function flushEventTimelineForCurrentLoopCount(): void {
  if (activeSequenceMode !== 'event') return
  while (eventNextIndex < eventTimeline.length) {
    const step = eventTimeline[eventNextIndex]
    if (eventCompletedLoops < step.atLoop) break
    queueLoopRequest(step.loopId, activeSequenceVolume, activeSequenceVersion)
    eventNextIndex += 1
  }
}

async function decodeLoop(loopId: string, file: string): Promise<AudioBuffer | null> {
  try {
    const audioCtx = getOrCreateAudioContext()
    const response = await fetch(file)
    const arrayBuffer = await response.arrayBuffer()
    return await audioCtx.decodeAudioData(arrayBuffer)
  } catch (error) {
    console.error(`[BackgroundMusicManager] Failed to decode loop "${loopId}" (${file})`, error)
    return null
  }
}

export async function preloadBackgroundMusic(): Promise<void> {
  if (preloaded) return
  preloaded = true
  loadedMusicLoops.clear()

  const entries = Object.entries(AUDIO_SETTINGS.music.loops)
  await Promise.all(entries.map(async ([loopId, loopSettings]) => {
    const buffer = await decodeLoop(loopId, loopSettings.file)
    if (!buffer) return
    const durationSec = buffer.duration
    if (!(durationSec > LOOP_EPSILON_SEC)) {
      console.error(`[BackgroundMusicManager] Loop "${loopId}" has invalid duration.`)
      return
    }
    loadedMusicLoops.set(loopId, {
      id: loopId,
      file: loopSettings.file,
      buffer,
      durationSec,
      markersSec: normalizeMarkers(loopSettings.switchMarkersSec, durationSec),
      volume: normalizeNonNegative(loopSettings.volume, 1),
    })
  }))

  flushPendingLoopRequest()
}

export function activateIdleSequence(epoch: number): void {
  if (!AUDIO_SETTINGS.music.enabled) return
  if (activeSequenceMode === 'idle' && epoch === activeIdleEpoch) return

  const normalizedIdleTimeline = normalizeRunTimeline(AUDIO_SETTINGS.music.idleSequence.timeline)
  if (normalizedIdleTimeline.length === 0) {
    console.error('[BackgroundMusicManager] Cannot activate idle sequence: timeline is empty.')
    return
  }

  activeIdleEpoch = epoch
  activeRunEpoch = Number.NEGATIVE_INFINITY
  activeSequenceMode = 'idle'
  activeSequenceVersion += 1
  activeSequenceVolume = normalizeNonNegative(AUDIO_SETTINGS.music.idleSequence.volume, 1)

  idleTimeline = normalizedIdleTimeline
  idleNextIndex = 0
  runTimeline = []
  runNextIndex = 0
  eventTimeline = []
  eventNextIndex = 0
  eventCompletedLoops = 0
  clearEventLoopTimer()

  updateIdleSequenceTime(0)
}

export function updateIdleSequenceTime(seconds: number): void {
  if (activeSequenceMode !== 'idle') return
  if (!Number.isFinite(seconds)) return
  while (idleNextIndex < idleTimeline.length) {
    const step = idleTimeline[idleNextIndex]
    if (seconds < step.atSec) break
    queueLoopRequest(step.loopId, activeSequenceVolume, activeSequenceVersion)
    idleNextIndex += 1
  }
}

export function activateRunSequence(epoch: number): void {
  if (!AUDIO_SETTINGS.music.enabled) return
  if (activeSequenceMode === 'run' && epoch === activeRunEpoch) return

  const normalizedRunTimeline = normalizeRunTimeline(AUDIO_SETTINGS.music.runSequence.timeline)
  if (normalizedRunTimeline.length === 0) {
    console.error('[BackgroundMusicManager] Cannot activate run sequence: timeline is empty.')
    return
  }

  activeRunEpoch = epoch
  activeIdleEpoch = Number.NEGATIVE_INFINITY
  activeSequenceMode = 'run'
  activeSequenceVersion += 1
  activeSequenceVolume = normalizeNonNegative(AUDIO_SETTINGS.music.runSequence.volume, 1)

  runTimeline = normalizedRunTimeline
  runNextIndex = 0
  idleTimeline = []
  idleNextIndex = 0
  eventTimeline = []
  eventNextIndex = 0
  eventCompletedLoops = 0
  clearEventLoopTimer()

  updateRunSequenceTime(0)
}

export function updateRunSequenceTime(seconds: number): void {
  if (activeSequenceMode !== 'run') return
  if (!Number.isFinite(seconds)) return
  while (runNextIndex < runTimeline.length) {
    const step = runTimeline[runNextIndex]
    if (seconds < step.atSec) break
    queueLoopRequest(step.loopId, activeSequenceVolume, activeSequenceVersion)
    runNextIndex += 1
  }
}

export function triggerEventSequence(eventId: string): void {
  if (!AUDIO_SETTINGS.music.enabled) return
  const rawSequence = AUDIO_SETTINGS.music.eventSequences[eventId]
  if (!rawSequence) {
    console.error(`[BackgroundMusicManager] Unknown event sequence: ${eventId}`)
    return
  }

  const normalizedEventTimeline = normalizeEventTimeline(rawSequence.timelineByLoop)
  if (normalizedEventTimeline.length === 0) {
    console.error(`[BackgroundMusicManager] Event sequence "${eventId}" has an empty timeline.`)
    return
  }

  activeSequenceMode = 'event'
  activeSequenceVersion += 1
  activeSequenceVolume = normalizeNonNegative(rawSequence.volume, 1)
  activeRunEpoch = Number.NEGATIVE_INFINITY
  activeIdleEpoch = Number.NEGATIVE_INFINITY

  eventTimeline = normalizedEventTimeline
  eventNextIndex = 0
  eventCompletedLoops = 0
  runTimeline = []
  runNextIndex = 0
  idleTimeline = []
  idleNextIndex = 0
  clearEventLoopTimer()

  flushEventTimelineForCurrentLoopCount()
  scheduleEventLoopCompletionTimer()
}

export function disposeBackgroundMusic(): void {
  pendingLoopLww = null
  clearScheduledSwitch()
  clearEventLoopTimer()
  stopActivePlayback()

  activeSequenceMode = 'none'
  activeSequenceVersion += 1
  activeRunEpoch = Number.NEGATIVE_INFINITY
  activeIdleEpoch = Number.NEGATIVE_INFINITY
  idleTimeline = []
  idleNextIndex = 0
  runTimeline = []
  runNextIndex = 0
  eventTimeline = []
  eventNextIndex = 0
  eventCompletedLoops = 0
}
