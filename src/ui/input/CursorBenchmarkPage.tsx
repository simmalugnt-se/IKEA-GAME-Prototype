import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { SETTINGS } from '@/settings/GameSettings'

type ConnectionState = 'connecting' | 'open' | 'closed'
type SourceKey = 'brio' | 'iphone'
type BenchmarkMode = 'hold' | 'follow'
type CalibrationPointId = 'center' | 'left' | 'right' | 'top' | 'bottom'

type Percentiles = {
  p50: number
  p95: number
  p99: number
}

type PointerFrame = {
  id: string
  xNorm: number
  yNorm: number
  phase: string
}

type TrailPoint = {
  xNorm: number
  yNorm: number
}

type RuntimeTrailPoint = {
  xPx: number
  yPx: number
  timeMs: number
}

type TrailSnapshot = {
  id: string
  points: TrailPoint[]
}

type SourceSnapshot = {
  connectionState: ConnectionState
  recvFps: number
  seqGapCount: number
  recvCount: number
  lastFrameAgoMs: number
  transportAge: Percentiles
  intervalJitterMs: number
  pointers: PointerFrame[]
  trails: TrailSnapshot[]
}

type SampleWindow = {
  values: Float64Array
  writeIndex: number
  count: number
}

type TimelineWindow = {
  values: Float64Array
  writeIndex: number
  count: number
}

type RenderSlotState = {
  id: string
  active: boolean
  xPx: number
  yPx: number
  velocityXPx: number
  velocityYPx: number
  lastMoveTime: number
  lastPacketMs: number
  followerActive: boolean
  followerXPx: number
  followerYPx: number
  trail: RuntimeTrailPoint[]
}

type SourceRuntime = {
  connectionState: ConnectionState
  recvCount: number
  seqGapCount: number
  lastSeq: number | null
  lastReceivePerfMs: number
  externalOffsetMs: number
  externalOffsetReady: boolean
  pointers: PointerFrame[]
  slots: RenderSlotState[]
  transportAgeWindow: SampleWindow
  intervalWindow: SampleWindow
  receiveTimeline: TimelineWindow
}

type CalibrationCapture = {
  xNorm: number
  yNorm: number
}

type CalibrationState = {
  captures: Partial<Record<CalibrationPointId, CalibrationCapture>>
  currentIndex: number
}

type CalibrationTransform = {
  scaleX: number
  offsetX: number
  scaleY: number
  offsetY: number
}

type BenchmarkSourceMetrics = {
  coveragePct: number
  avgErrorPx: number
  p95ErrorPx: number
  avgStepPx: number
  p95StepPx: number
  activeSamples: number
  totalSamples: number
}

type BenchmarkMetricsSnapshot = Record<SourceKey, BenchmarkSourceMetrics>

type BenchmarkSourceRuntime = {
  totalSamples: number
  activeSamples: number
  errorWindow: SampleWindow
  stepWindow: SampleWindow
  errorSum: number
  stepSum: number
  prevXNorm: number
  prevYNorm: number
  prevActive: boolean
}

const SAMPLE_WINDOW_SIZE = 256
const METRIC_WINDOW_SIZE = 2048
const TRAIL_POINT_LIMIT = 48
const RECONNECT_DELAY_MS = 500
const SVG_SIZE = 1000
const POINTER_SLOT_COUNT = 2
const EXTERNAL_TIME_OFFSET_BLEND = 0.2
const EXTERNAL_MAX_EXTRAPOLATION_MS = 30
const EXTERNAL_MIN_SAMPLE_STEP_MS = 0.25
const SCREEN_VELOCITY_BLEND = 0.35
const SCREEN_VELOCITY_MAX_ABS = 12000
const TRAIL_FOLLOW_MIN_ALPHA = 0.08
const TRAIL_FOLLOW_REFERENCE_FPS = 60
const CALIBRATION_STORAGE_KEY = 'cursor-benchmark-calibration-v1'
const FOLLOW_DURATION_MS = 12000
const HOLD_DURATION_MS = 8000

const CALIBRATION_POINTS: Array<{
  id: CalibrationPointId
  label: string
  description: string
  xNorm: number
  yNorm: number
}> = [
  { id: 'center', label: 'Center', description: 'Stall handen i neutralt mittläge.', xNorm: 0.5, yNorm: 0.5 },
  { id: 'left', label: 'Left', description: 'Flytta till vänstra ytterläget du vill kunna nå.', xNorm: 0.22, yNorm: 0.5 },
  { id: 'right', label: 'Right', description: 'Flytta till högra ytterläget.', xNorm: 0.78, yNorm: 0.5 },
  { id: 'top', label: 'Top', description: 'Flytta till övre ytterläget.', xNorm: 0.5, yNorm: 0.22 },
  { id: 'bottom', label: 'Bottom', description: 'Flytta till nedre ytterläget.', xNorm: 0.5, yNorm: 0.78 },
]

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function makeSampleWindow(size = SAMPLE_WINDOW_SIZE): SampleWindow {
  return {
    values: new Float64Array(size),
    writeIndex: 0,
    count: 0,
  }
}

function makeTimelineWindow(): TimelineWindow {
  return {
    values: new Float64Array(SAMPLE_WINDOW_SIZE),
    writeIndex: 0,
    count: 0,
  }
}

function makeRenderSlotState(): RenderSlotState {
  return {
    id: '',
    active: false,
    xPx: 0,
    yPx: 0,
    velocityXPx: 0,
    velocityYPx: 0,
    lastMoveTime: 0,
    lastPacketMs: 0,
    followerActive: false,
    followerXPx: 0,
    followerYPx: 0,
    trail: [],
  }
}

function pushWindowSample(window: SampleWindow | TimelineWindow, value: number): void {
  if (!Number.isFinite(value)) return
  window.values[window.writeIndex] = value
  window.writeIndex = (window.writeIndex + 1) % window.values.length
  if (window.count < window.values.length) {
    window.count += 1
  }
}

function snapshotWindowValues(window: SampleWindow | TimelineWindow, scratch: Float64Array): Float64Array {
  const count = window.count
  if (count <= 0) return scratch.subarray(0, 0)

  const capacity = window.values.length
  const start = (window.writeIndex - count + capacity) % capacity
  for (let i = 0; i < count; i += 1) {
    scratch[i] = window.values[(start + i) % capacity] ?? 0
  }
  return scratch.subarray(0, count)
}

function snapshotPercentiles(window: SampleWindow, scratch: Float64Array): Percentiles {
  const values = snapshotWindowValues(window, scratch)
  const count = values.length
  if (count <= 0) {
    return { p50: 0, p95: 0, p99: 0 }
  }

  values.sort()

  const index50 = Math.min(count - 1, Math.floor((count - 1) * 0.5))
  const index95 = Math.min(count - 1, Math.floor((count - 1) * 0.95))
  const index99 = Math.min(count - 1, Math.floor((count - 1) * 0.99))

  return {
    p50: values[index50] ?? 0,
    p95: values[index95] ?? 0,
    p99: values[index99] ?? 0,
  }
}

function computeJitter(window: SampleWindow, scratch: Float64Array): number {
  const values = snapshotWindowValues(window, scratch)
  const count = values.length
  if (count < 2) return 0

  let deltaTotal = 0
  let previous = values[0] ?? 0
  for (let i = 1; i < count; i += 1) {
    const current = values[i] ?? previous
    deltaTotal += Math.abs(current - previous)
    previous = current
  }
  return deltaTotal / Math.max(1, count - 1)
}

function computeFps(window: TimelineWindow, scratch: Float64Array): number {
  const values = snapshotWindowValues(window, scratch)
  const count = values.length
  if (count < 2) return 0

  const first = values[0] ?? 0
  const last = values[count - 1] ?? first
  const durationSec = (last - first) / 1000
  if (durationSec <= 0) return 0

  return (count - 1) / durationSec
}

function formatMs(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} ms` : '--'
}

function formatFps(value: number): string {
  return Number.isFinite(value) && value > 0 ? value.toFixed(1) : '--'
}

function formatPx(value: number): string {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} px` : '--'
}

function makeInitialSnapshot(): SourceSnapshot {
  return {
    connectionState: 'connecting',
    recvFps: 0,
    seqGapCount: 0,
    recvCount: 0,
    lastFrameAgoMs: 0,
    transportAge: { p50: 0, p95: 0, p99: 0 },
    intervalJitterMs: 0,
    pointers: [],
    trails: [],
  }
}

function makeSourceRuntime(): SourceRuntime {
  return {
    connectionState: 'connecting',
    recvCount: 0,
    seqGapCount: 0,
    lastSeq: null,
    lastReceivePerfMs: 0,
    externalOffsetMs: 0,
    externalOffsetReady: false,
    pointers: [],
    slots: Array.from({ length: POINTER_SLOT_COUNT }, () => makeRenderSlotState()),
    transportAgeWindow: makeSampleWindow(),
    intervalWindow: makeSampleWindow(),
    receiveTimeline: makeTimelineWindow(),
  }
}

function snapshotRuntime(
  runtime: SourceRuntime,
  scratchA: Float64Array,
  scratchB: Float64Array,
  nowPerfMs: number,
): SourceSnapshot {
  return {
    connectionState: runtime.connectionState,
    recvFps: computeFps(runtime.receiveTimeline, scratchA),
    seqGapCount: runtime.seqGapCount,
    recvCount: runtime.recvCount,
    lastFrameAgoMs: runtime.lastReceivePerfMs > 0 ? nowPerfMs - runtime.lastReceivePerfMs : 0,
    transportAge: snapshotPercentiles(runtime.transportAgeWindow, scratchA),
    intervalJitterMs: computeJitter(runtime.intervalWindow, scratchB),
    pointers: runtime.pointers,
    trails: runtime.slots
      .filter((slot) => slot.trail.length > 0)
      .map((slot, index) => ({
        id: `${slot.id || 'slot'}-${index + 1}`,
        points: slot.trail.map((point) => ({
          xNorm: clamp01(point.xPx / SVG_SIZE),
          yNorm: clamp01(point.yPx / SVG_SIZE),
        })),
      })),
  }
}

function resolveTrailFollowAlpha(deltaSec: number, smoothingStrength: number): number {
  const strength = clamp01(smoothingStrength)
  if (strength <= 0) return 1

  const referenceAlpha = 1 - strength * (1 - TRAIL_FOLLOW_MIN_ALPHA)
  const referenceFrames = Math.max(1, deltaSec * TRAIL_FOLLOW_REFERENCE_FPS)
  return 1 - ((1 - referenceAlpha) ** referenceFrames)
}

function resetRenderSlot(slot: RenderSlotState): void {
  slot.id = ''
  slot.active = false
  slot.xPx = 0
  slot.yPx = 0
  slot.velocityXPx = 0
  slot.velocityYPx = 0
  slot.lastMoveTime = 0
  slot.lastPacketMs = 0
  slot.followerActive = false
  slot.followerXPx = 0
  slot.followerYPx = 0
  slot.trail.length = 0
}

function updateStaleRenderSlots(runtime: SourceRuntime, nowMs: number): void {
  const staleTimeoutMs = Math.max(1, SETTINGS.cursor.external.staleTimeoutMs)
  for (const slot of runtime.slots) {
    if (!slot.active) continue
    if (nowMs - slot.lastPacketMs <= staleTimeoutMs) continue
    slot.active = false
    slot.velocityXPx = 0
    slot.velocityYPx = 0
  }
}

function assignRenderSlot(runtime: SourceRuntime, pointerId: string): 0 | 1 {
  for (let i = 0; i < runtime.slots.length; i += 1) {
    const slot = runtime.slots[i]
    if (slot?.id === pointerId) return i <= 0 ? 0 : 1
  }

  for (let i = 0; i < runtime.slots.length; i += 1) {
    const slot = runtime.slots[i]
    if (!slot || slot.active) continue
    resetRenderSlot(slot)
    slot.id = pointerId
    return i <= 0 ? 0 : 1
  }

  let oldestIndex = 0
  let oldestPacketMs = Number.POSITIVE_INFINITY
  for (let i = 0; i < runtime.slots.length; i += 1) {
    const slot = runtime.slots[i]
    if (!slot) continue
    if (slot.lastPacketMs < oldestPacketMs) {
      oldestPacketMs = slot.lastPacketMs
      oldestIndex = i
    }
  }

  const replacementSlot = runtime.slots[oldestIndex]
  if (replacementSlot) {
    resetRenderSlot(replacementSlot)
    replacementSlot.id = pointerId
  }
  return oldestIndex <= 0 ? 0 : 1
}

function pushRenderSample(
  runtime: SourceRuntime,
  slotIndex: 0 | 1,
  xPx: number,
  yPx: number,
  timeMs: number,
  packetTimeMs: number,
): void {
  const slot = runtime.slots[slotIndex]
  if (!slot) return

  const dt = timeMs - slot.lastMoveTime
  if (slot.lastMoveTime > 0 && dt > 0 && dt < 100) {
    const dx = xPx - slot.xPx
    const dy = yPx - slot.yPx

    const rawVelocityXPx = (dx / dt) * 1000
    const rawVelocityYPx = (dy / dt) * 1000
    const clampedVelocityXPx = clamp(rawVelocityXPx, -SCREEN_VELOCITY_MAX_ABS, SCREEN_VELOCITY_MAX_ABS)
    const clampedVelocityYPx = clamp(rawVelocityYPx, -SCREEN_VELOCITY_MAX_ABS, SCREEN_VELOCITY_MAX_ABS)

    slot.velocityXPx += (clampedVelocityXPx - slot.velocityXPx) * SCREEN_VELOCITY_BLEND
    slot.velocityYPx += (clampedVelocityYPx - slot.velocityYPx) * SCREEN_VELOCITY_BLEND
  }

  slot.active = true
  slot.xPx = xPx
  slot.yPx = yPx
  slot.lastMoveTime = timeMs
  slot.lastPacketMs = packetTimeMs
}

function pushSmoothedTrailPoint(
  slot: RenderSlotState,
  xPx: number,
  yPx: number,
  timeMs: number,
  deltaSec: number,
): void {
  if (slot.followerActive) {
    const alpha = resolveTrailFollowAlpha(deltaSec, SETTINGS.cursor.trail.followSmoothing ?? 0)
    slot.followerXPx += (xPx - slot.followerXPx) * alpha
    slot.followerYPx += (yPx - slot.followerYPx) * alpha
  } else {
    slot.followerActive = true
    slot.followerXPx = xPx
    slot.followerYPx = yPx
  }

  slot.trail.push({ xPx: slot.followerXPx, yPx: slot.followerYPx, timeMs })
  if (slot.trail.length > TRAIL_POINT_LIMIT) {
    slot.trail.splice(0, slot.trail.length - TRAIL_POINT_LIMIT)
  }
}

function updateRenderedOutput(runtime: SourceRuntime, nowMs: number, deltaSec: number): void {
  updateStaleRenderSlots(runtime, nowMs)

  const pointers: PointerFrame[] = []
  const maxAgeMs = Math.max(1, (SETTINGS.cursor.trail.maxAge ?? 0.25) * 1000)

  for (let i = 0; i < runtime.slots.length; i += 1) {
    const slot = runtime.slots[i]
    if (!slot) continue

    while (slot.trail.length > 1 && nowMs - (slot.trail[0]?.timeMs ?? nowMs) > maxAgeMs) {
      slot.trail.shift()
    }

    if (!slot.active) continue

    let predictMs = nowMs - slot.lastMoveTime
    if (!Number.isFinite(predictMs)) predictMs = 0
    predictMs = clamp(predictMs, 0, EXTERNAL_MAX_EXTRAPOLATION_MS)

    const predictScale = predictMs / 1000
    const renderXPx = slot.xPx + slot.velocityXPx * predictScale
    const renderYPx = slot.yPx + slot.velocityYPx * predictScale

    pushSmoothedTrailPoint(slot, renderXPx, renderYPx, nowMs, deltaSec)

    pointers.push({
      id: slot.id || `pointer-${i + 1}`,
      xNorm: clamp01(renderXPx / SVG_SIZE),
      yNorm: clamp01(renderYPx / SVG_SIZE),
      phase: 'tracked',
    })
  }

  runtime.pointers = pointers
}

function useBenchmarkSource(url: string): SourceSnapshot {
  const runtimeRef = useRef<SourceRuntime>(makeSourceRuntime())
  const scratchARef = useRef(new Float64Array(SAMPLE_WINDOW_SIZE))
  const scratchBRef = useRef(new Float64Array(SAMPLE_WINDOW_SIZE))
  const [snapshot, setSnapshot] = useState<SourceSnapshot>(makeInitialSnapshot)

  useEffect(() => {
    const runtime = makeSourceRuntime()
    runtimeRef.current = runtime
    setSnapshot(makeInitialSnapshot())

    let disposed = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let rafId = 0
    let lastRenderPerfMs = performance.now()

    const publishSnapshot = () => {
      setSnapshot(
        snapshotRuntime(
          runtimeRef.current,
          scratchARef.current,
          scratchBRef.current,
          performance.now(),
        ),
      )
    }

    const tick = (nowPerfMs: number) => {
      const deltaSec = Math.max(0, (nowPerfMs - lastRenderPerfMs) / 1000)
      lastRenderPerfMs = nowPerfMs
      updateRenderedOutput(runtimeRef.current, nowPerfMs, deltaSec)
      publishSnapshot()
      rafId = window.requestAnimationFrame(tick)
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, RECONNECT_DELAY_MS)
    }

    const connect = () => {
      if (disposed) return

      runtime.connectionState = 'connecting'
      publishSnapshot()

      try {
        ws = new WebSocket(url)
      } catch {
        runtime.connectionState = 'closed'
        publishSnapshot()
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        runtime.connectionState = 'open'
        publishSnapshot()
      }

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return

        let parsed: unknown
        try {
          parsed = JSON.parse(event.data)
        } catch {
          return
        }

        const packet = asRecord(parsed)
        if (!packet || packet.type !== 'cursor_frame') return

        const nowPerfMs = performance.now()
        const nowEpochMs = Date.now()
        if (runtime.lastReceivePerfMs > 0) {
          pushWindowSample(runtime.intervalWindow, nowPerfMs - runtime.lastReceivePerfMs)
        }
        runtime.lastReceivePerfMs = nowPerfMs
        pushWindowSample(runtime.receiveTimeline, nowPerfMs)
        runtime.recvCount += 1

        const seq = asFiniteNumber(packet.seq)
        if (seq !== null) {
          if (runtime.lastSeq !== null && seq > runtime.lastSeq + 1) {
            runtime.seqGapCount += seq - runtime.lastSeq - 1
          }
          runtime.lastSeq = seq
        }

        const sentEpochMs = asFiniteNumber(packet.sentEpochMs)
        if (sentEpochMs !== null) {
          pushWindowSample(runtime.transportAgeWindow, nowEpochMs - sentEpochMs)
        }

        const sourceTimeMs = asFiniteNumber(packet.sourceTimeMs) ?? nowPerfMs
        const rawPointers = Array.isArray(packet.pointers) ? packet.pointers : []
        if (rawPointers.length <= 0) {
          for (const slot of runtime.slots) {
            slot.active = false
            slot.velocityXPx = 0
            slot.velocityYPx = 0
          }
          return
        }

        const rawOffsetMs = nowPerfMs - sourceTimeMs
        if (!runtime.externalOffsetReady || !Number.isFinite(runtime.externalOffsetMs)) {
          runtime.externalOffsetMs = rawOffsetMs
          runtime.externalOffsetReady = true
        } else {
          runtime.externalOffsetMs += (rawOffsetMs - runtime.externalOffsetMs) * EXTERNAL_TIME_OFFSET_BLEND
        }

        for (const rawPointer of rawPointers) {
          const pointer = asRecord(rawPointer)
          if (!pointer) continue
          const id = asString(pointer.id)
          const xNorm = asFiniteNumber(pointer.xNorm)
          const yNorm = asFiniteNumber(pointer.yNorm)
          if (!id || xNorm === null || yNorm === null) continue

          const slotIndex = assignRenderSlot(runtime, id)
          const slot = runtime.slots[slotIndex]
          if (!slot) continue

          let sampleTimeMs = sourceTimeMs + runtime.externalOffsetMs
          if (!Number.isFinite(sampleTimeMs)) sampleTimeMs = nowPerfMs

          if (slot.lastMoveTime > 0) {
            const minNext = slot.lastMoveTime + EXTERNAL_MIN_SAMPLE_STEP_MS
            if (sampleTimeMs < minNext) sampleTimeMs = minNext
          }

          let predictMs = nowPerfMs - sampleTimeMs
          if (!Number.isFinite(predictMs)) predictMs = 0
          predictMs = clamp(predictMs, 0, EXTERNAL_MAX_EXTRAPOLATION_MS)

          const predictScale = predictMs / 1000
          const xPx = clamp01(xNorm) * SVG_SIZE
          const yPx = clamp01(yNorm) * SVG_SIZE
          const predictedXPx = xPx + slot.velocityXPx * predictScale
          const predictedYPx = yPx + slot.velocityYPx * predictScale
          const predictedTimeMs = sampleTimeMs + predictMs

          pushRenderSample(runtime, slotIndex, predictedXPx, predictedYPx, predictedTimeMs, nowPerfMs)
        }
      }

      ws.onerror = () => {
        ws?.close()
      }

      ws.onclose = () => {
        ws = null
        runtime.connectionState = 'closed'
        publishSnapshot()
        scheduleReconnect()
      }
    }

    connect()
    rafId = window.requestAnimationFrame(tick)

    return () => {
      disposed = true
      window.cancelAnimationFrame(rafId)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [url])

  return snapshot
}

function buildPath(points: TrailPoint[]): string {
  if (points.length <= 0) return ''
  if (points.length === 1) {
    const point = points[0]
    return `M ${(point?.xNorm ?? 0) * SVG_SIZE} ${(point?.yNorm ?? 0) * SVG_SIZE}`
  }

  const smoothing = clamp01(SETTINGS.cursor.trail.smoothing ?? 0.25)
  const commands: string[] = []
  const first = points[0]
  if (!first) return ''

  let previousX = first.xNorm * SVG_SIZE
  let previousY = first.yNorm * SVG_SIZE
  commands.push(`M ${previousX.toFixed(1)} ${previousY.toFixed(1)}`)

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]
    if (!point) continue
    const currentX = point.xNorm * SVG_SIZE
    const currentY = point.yNorm * SVG_SIZE
    const midX = (previousX + currentX) * 0.5
    const midY = (previousY + currentY) * 0.5
    const cpX = midX + (previousX - midX) * smoothing
    const cpY = midY + (previousY - midY) * smoothing
    commands.push(`Q ${cpX.toFixed(1)} ${cpY.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`)
    previousX = currentX
    previousY = currentY
  }

  commands.push(`L ${previousX.toFixed(1)} ${previousY.toFixed(1)}`)
  return commands.join(' ')
}

function parseInitialUrl(search: URLSearchParams, key: string, fallback: string): string {
  const value = search.get(key)
  return value && value.length > 0 ? value : fallback
}

function loadCalibrationState(): Record<SourceKey, CalibrationState> {
  const fallback: Record<SourceKey, CalibrationState> = {
    brio: { captures: {}, currentIndex: 0 },
    iphone: { captures: {}, currentIndex: 0 },
  }

  try {
    const raw = window.localStorage.getItem(CALIBRATION_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    const record = asRecord(parsed)
    if (!record) return fallback

    const next = { ...fallback }
    for (const key of ['brio', 'iphone'] as SourceKey[]) {
      const item = asRecord(record[key])
      if (!item) continue
      const capturesRecord = asRecord(item.captures)
      const captures: Partial<Record<CalibrationPointId, CalibrationCapture>> = {}
      if (capturesRecord) {
        for (const point of CALIBRATION_POINTS) {
          const capture = asRecord(capturesRecord[point.id])
          const xNorm = asFiniteNumber(capture?.xNorm)
          const yNorm = asFiniteNumber(capture?.yNorm)
          if (xNorm === null || yNorm === null) continue
          captures[point.id] = { xNorm, yNorm }
        }
      }
      const currentIndex = asFiniteNumber(item.currentIndex)
      next[key] = {
        captures,
        currentIndex: currentIndex === null ? 0 : clamp(Math.trunc(currentIndex), 0, CALIBRATION_POINTS.length),
      }
    }
    return next
  } catch {
    return fallback
  }
}

function saveCalibrationState(state: Record<SourceKey, CalibrationState>): void {
  try {
    window.localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best effort only.
  }
}

function resolveCalibrationTransform(calibration: CalibrationState): CalibrationTransform | null {
  const center = calibration.captures.center
  const left = calibration.captures.left
  const right = calibration.captures.right
  const top = calibration.captures.top
  const bottom = calibration.captures.bottom
  if (!center || !left || !right || !top || !bottom) return null

  const leftTarget = CALIBRATION_POINTS.find((point) => point.id === 'left')
  const rightTarget = CALIBRATION_POINTS.find((point) => point.id === 'right')
  const topTarget = CALIBRATION_POINTS.find((point) => point.id === 'top')
  const bottomTarget = CALIBRATION_POINTS.find((point) => point.id === 'bottom')
  const centerTarget = CALIBRATION_POINTS.find((point) => point.id === 'center')
  if (!leftTarget || !rightTarget || !topTarget || !bottomTarget || !centerTarget) return null

  const spanX = right.xNorm - left.xNorm
  const spanY = bottom.yNorm - top.yNorm
  if (Math.abs(spanX) < 1e-5 || Math.abs(spanY) < 1e-5) return null

  const scaleX = (rightTarget.xNorm - leftTarget.xNorm) / spanX
  const scaleY = (bottomTarget.yNorm - topTarget.yNorm) / spanY

  return {
    scaleX,
    scaleY,
    offsetX: centerTarget.xNorm - center.xNorm * scaleX,
    offsetY: centerTarget.yNorm - center.yNorm * scaleY,
  }
}

function transformPoint(point: TrailPoint | PointerFrame, transform: CalibrationTransform | null): TrailPoint {
  if (!transform) {
    return {
      xNorm: clamp01(point.xNorm),
      yNorm: clamp01(point.yNorm),
    }
  }
  return {
    xNorm: clamp01(point.xNorm * transform.scaleX + transform.offsetX),
    yNorm: clamp01(point.yNorm * transform.scaleY + transform.offsetY),
  }
}

function transformSnapshot(snapshot: SourceSnapshot, transform: CalibrationTransform | null): SourceSnapshot {
  return {
    ...snapshot,
    pointers: snapshot.pointers.map((pointer) => ({
      ...pointer,
      ...transformPoint(pointer, transform),
    })),
    trails: snapshot.trails.map((trail) => ({
      ...trail,
      points: trail.points.map((point) => transformPoint(point, transform)),
    })),
  }
}

function makeBenchmarkSourceRuntime(): BenchmarkSourceRuntime {
  return {
    totalSamples: 0,
    activeSamples: 0,
    errorWindow: makeSampleWindow(METRIC_WINDOW_SIZE),
    stepWindow: makeSampleWindow(METRIC_WINDOW_SIZE),
    errorSum: 0,
    stepSum: 0,
    prevXNorm: 0,
    prevYNorm: 0,
    prevActive: false,
  }
}

function makeEmptyBenchmarkMetrics(): BenchmarkMetricsSnapshot {
  return {
    brio: {
      coveragePct: 0,
      avgErrorPx: 0,
      p95ErrorPx: 0,
      avgStepPx: 0,
      p95StepPx: 0,
      activeSamples: 0,
      totalSamples: 0,
    },
    iphone: {
      coveragePct: 0,
      avgErrorPx: 0,
      p95ErrorPx: 0,
      avgStepPx: 0,
      p95StepPx: 0,
      activeSamples: 0,
      totalSamples: 0,
    },
  }
}

function snapshotBenchmarkMetrics(
  runtime: BenchmarkSourceRuntime,
  scratchA: Float64Array,
  scratchB: Float64Array,
): BenchmarkSourceMetrics {
  const errorPercentiles = snapshotPercentiles(runtime.errorWindow, scratchA)
  const stepPercentiles = snapshotPercentiles(runtime.stepWindow, scratchB)
  return {
    coveragePct: runtime.totalSamples > 0 ? (runtime.activeSamples / runtime.totalSamples) * 100 : 0,
    avgErrorPx: runtime.activeSamples > 0 ? runtime.errorSum / runtime.activeSamples : 0,
    p95ErrorPx: errorPercentiles.p95,
    avgStepPx: runtime.activeSamples > 1 ? runtime.stepSum / Math.max(1, runtime.activeSamples - 1) : 0,
    p95StepPx: stepPercentiles.p95,
    activeSamples: runtime.activeSamples,
    totalSamples: runtime.totalSamples,
  }
}

function getBenchmarkDurationMs(mode: BenchmarkMode): number {
  return mode === 'hold' ? HOLD_DURATION_MS : FOLLOW_DURATION_MS
}

function resolveBenchmarkTarget(mode: BenchmarkMode, elapsedMs: number): TrailPoint {
  if (mode === 'hold') {
    return { xNorm: 0.5, yNorm: 0.5 }
  }

  const t = (elapsedMs / FOLLOW_DURATION_MS) * Math.PI * 2
  return {
    xNorm: 0.5 + Math.cos(t) * 0.24,
    yNorm: 0.5 + Math.sin(t * 2) * 0.18,
  }
}

function sampleMetricsForSource(
  runtime: BenchmarkSourceRuntime,
  pointer: PointerFrame | null,
  target: TrailPoint,
): void {
  runtime.totalSamples += 1

  if (!pointer) {
    runtime.prevActive = false
    return
  }

  runtime.activeSamples += 1
  const dxTarget = (pointer.xNorm - target.xNorm) * SVG_SIZE
  const dyTarget = (pointer.yNorm - target.yNorm) * SVG_SIZE
  const errorPx = Math.hypot(dxTarget, dyTarget)
  runtime.errorSum += errorPx
  pushWindowSample(runtime.errorWindow, errorPx)

  if (runtime.prevActive) {
    const dxStep = (pointer.xNorm - runtime.prevXNorm) * SVG_SIZE
    const dyStep = (pointer.yNorm - runtime.prevYNorm) * SVG_SIZE
    const stepPx = Math.hypot(dxStep, dyStep)
    runtime.stepSum += stepPx
    pushWindowSample(runtime.stepWindow, stepPx)
  }

  runtime.prevXNorm = pointer.xNorm
  runtime.prevYNorm = pointer.yNorm
  runtime.prevActive = true
}

function SourceStatusCard({
  title,
  color,
  snapshot,
  calibration,
  active,
  onSelect,
  onCapture,
  onReset,
}: {
  title: string
  color: string
  snapshot: SourceSnapshot
  calibration: CalibrationState
  active: boolean
  onSelect: () => void
  onCapture: () => void
  onReset: () => void
}) {
  const transform = resolveCalibrationTransform(calibration)
  const currentPoint = CALIBRATION_POINTS[calibration.currentIndex] ?? null
  const completedCount = Object.keys(calibration.captures).length

  return (
    <section
      style={{
        border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
        borderRadius: 16,
        padding: 16,
        background: 'rgba(10, 15, 23, 0.84)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ fontSize: 18 }}>{title}</strong>
        <button
          type="button"
          onClick={onSelect}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: 0,
            background: active ? color : 'rgba(255,255,255,0.1)',
            color: active ? '#111820' : '#f3f7fb',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {active ? 'Selected' : 'Select'}
        </button>
      </div>
      <div style={{ fontSize: 13, opacity: 0.82 }}>
        {transform ? 'Calibrated to shared control space.' : 'Showing raw normalized coordinates until calibration is complete.'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div>Recv FPS: {formatFps(snapshot.recvFps)}</div>
        <div>Transport p95: {formatMs(snapshot.transportAge.p95)}</div>
        <div>Seq gaps: {snapshot.seqGapCount}</div>
        <div>Last frame age: {formatMs(snapshot.lastFrameAgoMs)}</div>
      </div>
      <div style={{ fontSize: 13, opacity: 0.9 }}>
        Calibration: {completedCount}/{CALIBRATION_POINTS.length}
        {currentPoint ? `, next = ${currentPoint.label}` : ', complete'}
      </div>
      {active && currentPoint ? (
        <div style={{ fontSize: 13, color }}>
          {currentPoint.label}: {currentPoint.description}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onCapture}
          disabled={!active}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: 0,
            background: active ? color : 'rgba(255,255,255,0.08)',
            color: active ? '#0b1118' : 'rgba(255,255,255,0.45)',
            fontWeight: 700,
            cursor: active ? 'pointer' : 'default',
          }}
        >
          Capture current point
        </button>
        <button
          type="button"
          onClick={onReset}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'transparent',
            color: '#f3f7fb',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reset calibration
        </button>
      </div>
    </section>
  )
}

function BenchmarkMetricsCard({
  title,
  color,
  metrics,
}: {
  title: string
  color: string
  metrics: BenchmarkSourceMetrics
}) {
  return (
    <section
      style={{
        border: `1px solid ${color}`,
        borderRadius: 16,
        padding: 16,
        background: 'rgba(10, 15, 23, 0.84)',
        display: 'grid',
        gap: 10,
      }}
    >
      <strong style={{ fontSize: 18 }}>{title}</strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div>Coverage: {metrics.coveragePct.toFixed(1)}%</div>
        <div>Samples: {metrics.activeSamples}/{metrics.totalSamples}</div>
        <div>Avg error: {formatPx(metrics.avgErrorPx)}</div>
        <div>P95 error: {formatPx(metrics.p95ErrorPx)}</div>
        <div>Avg step: {formatPx(metrics.avgStepPx)}</div>
        <div>P95 step: {formatPx(metrics.p95StepPx)}</div>
      </div>
    </section>
  )
}

function compareModeLabel(mode: BenchmarkMode): string {
  return mode === 'hold' ? 'Hold Still' : 'Follow Target'
}

export function CursorBenchmarkPage() {
  const search = new URLSearchParams(window.location.search)
  const [draftBrioUrl, setDraftBrioUrl] = useState(() => parseInitialUrl(search, 'brioUrl', 'ws://127.0.0.1:9001/cursor'))
  const [draftIphoneUrl, setDraftIphoneUrl] = useState(() => parseInitialUrl(search, 'iphoneUrl', 'ws://127.0.0.1:9002/cursor'))
  const [brioUrl, setBrioUrl] = useState(draftBrioUrl)
  const [iphoneUrl, setIphoneUrl] = useState(draftIphoneUrl)
  const [activeCalibrationSource, setActiveCalibrationSource] = useState<SourceKey>('brio')
  const [calibrationBySource, setCalibrationBySource] = useState<Record<SourceKey, CalibrationState>>(() => loadCalibrationState())
  const [mode, setMode] = useState<BenchmarkMode>('follow')
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [target, setTarget] = useState<TrailPoint>({ xNorm: 0.5, yNorm: 0.5 })
  const [metrics, setMetrics] = useState<BenchmarkMetricsSnapshot>(makeEmptyBenchmarkMetrics)

  const brioRaw = useBenchmarkSource(brioUrl)
  const iphoneRaw = useBenchmarkSource(iphoneUrl)

  const transforms = useMemo(
    () => ({
      brio: resolveCalibrationTransform(calibrationBySource.brio),
      iphone: resolveCalibrationTransform(calibrationBySource.iphone),
    }),
    [calibrationBySource],
  )

  const brio = useMemo(() => transformSnapshot(brioRaw, transforms.brio), [brioRaw, transforms.brio])
  const iphone = useMemo(() => transformSnapshot(iphoneRaw, transforms.iphone), [iphoneRaw, transforms.iphone])

  const brioRef = useRef(brio)
  const iphoneRef = useRef(iphone)
  useEffect(() => {
    brioRef.current = brio
  }, [brio])
  useEffect(() => {
    iphoneRef.current = iphone
  }, [iphone])

  useEffect(() => {
    saveCalibrationState(calibrationBySource)
  }, [calibrationBySource])

  const handleApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBrioUrl(draftBrioUrl.trim())
    setIphoneUrl(draftIphoneUrl.trim())
  }

  const handleCapture = (source: SourceKey) => {
    const rawSnapshot = source === 'brio' ? brioRaw : iphoneRaw
    const pointer = rawSnapshot.pointers[0]
    if (!pointer) return

    setCalibrationBySource((current) => {
      const existing = current[source]
      const calibrationPoint = CALIBRATION_POINTS[existing.currentIndex]
      if (!calibrationPoint) return current

      const nextIndex = Math.min(existing.currentIndex + 1, CALIBRATION_POINTS.length)
      return {
        ...current,
        [source]: {
          captures: {
            ...existing.captures,
            [calibrationPoint.id]: {
              xNorm: pointer.xNorm,
              yNorm: pointer.yNorm,
            },
          },
          currentIndex: nextIndex,
        },
      }
    })
  }

  const handleResetCalibration = (source: SourceKey) => {
    setCalibrationBySource((current) => ({
      ...current,
      [source]: {
        captures: {},
        currentIndex: 0,
      },
    }))
  }

  const bothCalibrated = Boolean(transforms.brio && transforms.iphone)
  const activeCalibrationState = calibrationBySource[activeCalibrationSource]
  const activeCalibrationPoint = CALIBRATION_POINTS[activeCalibrationState.currentIndex] ?? null

  useEffect(() => {
    if (!running) return

    const durationMs = getBenchmarkDurationMs(mode)
    const startedAtMs = performance.now()
    const scratchErrorA = new Float64Array(METRIC_WINDOW_SIZE)
    const scratchErrorB = new Float64Array(METRIC_WINDOW_SIZE)
    const runtimes: Record<SourceKey, BenchmarkSourceRuntime> = {
      brio: makeBenchmarkSourceRuntime(),
      iphone: makeBenchmarkSourceRuntime(),
    }

    let rafId = 0

    const tick = (nowMs: number) => {
      const nextElapsedMs = nowMs - startedAtMs
      const nextTarget = resolveBenchmarkTarget(mode, nextElapsedMs)

      const brioPointer = brioRef.current.pointers[0] ?? null
      const iphonePointer = iphoneRef.current.pointers[0] ?? null

      sampleMetricsForSource(runtimes.brio, brioPointer, nextTarget)
      sampleMetricsForSource(runtimes.iphone, iphonePointer, nextTarget)

      setElapsedMs(nextElapsedMs)
      setTarget(nextTarget)
      setMetrics({
        brio: snapshotBenchmarkMetrics(runtimes.brio, scratchErrorA, scratchErrorB),
        iphone: snapshotBenchmarkMetrics(runtimes.iphone, scratchErrorA, scratchErrorB),
      })

      if (nextElapsedMs >= durationMs) {
        setRunning(false)
        return
      }

      rafId = window.requestAnimationFrame(tick)
    }

    setElapsedMs(0)
    setTarget(resolveBenchmarkTarget(mode, 0))
    setMetrics(makeEmptyBenchmarkMetrics())
    rafId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [running, mode])

  const renderSource = (snapshot: SourceSnapshot, color: string, label: string) => (
    <>
      {snapshot.trails.map((trail) => (
        <path
          key={`${label}-${trail.id}`}
          d={buildPath(trail.points)}
          fill="none"
          stroke={color}
          strokeWidth={trail.id.endsWith('-2') ? 10 : 14}
          strokeOpacity={trail.id.endsWith('-2') ? 0.28 : 0.68}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {snapshot.pointers.map((pointer, index) => {
        const x = pointer.xNorm * SVG_SIZE
        const y = pointer.yNorm * SVG_SIZE
        const radius = index === 0 ? 18 : 12
        return (
          <g key={`${label}-${pointer.id}`}>
            <circle
              cx={x}
              cy={y}
              r={radius}
              fill={color}
              fillOpacity={index === 0 ? 0.94 : 0.5}
              stroke="#06131d"
              strokeWidth={4}
            />
            <text
              x={x + 22}
              y={y - 18}
              fill={color}
              fontSize="26"
              fontWeight="700"
            >
              {pointer.id}
            </text>
          </g>
        )
      })}
    </>
  )

  const benchmarkDurationSec = getBenchmarkDurationMs(mode) / 1000

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(243, 199, 93, 0.14), transparent 30%), linear-gradient(180deg, #0b1016 0%, #06090d 100%)',
        color: '#f3f7fb',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 1540, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ display: 'grid', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.08 }}>Cursor Benchmark</h1>
          <div style={{ opacity: 0.84, maxWidth: 980 }}>
            Calibrate Brio and iPhone into the same control space first, then compare them with simple benchmark
            tasks that produce actual metrics instead of only visual feel.
          </div>
        </header>

        <form
          onSubmit={handleApply}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'end',
            padding: 16,
            borderRadius: 16,
            background: 'rgba(11, 17, 25, 0.82)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, opacity: 0.8 }}>Brio WebSocket URL</span>
            <input
              value={draftBrioUrl}
              onChange={(event) => setDraftBrioUrl(event.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                background: '#0c1520',
                color: '#f3f7fb',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, opacity: 0.8 }}>iPhone WebSocket URL</span>
            <input
              value={draftIphoneUrl}
              onChange={(event) => setDraftIphoneUrl(event.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                background: '#0c1520',
                color: '#f3f7fb',
              }}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: '11px 16px',
              borderRadius: 10,
              border: 0,
              background: '#f6c75d',
              color: '#182029',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </form>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.18fr) minmax(320px, 0.82fr)', gap: 18 }}>
          <section
            style={{
              borderRadius: 20,
              padding: 16,
              background: 'rgba(11, 17, 25, 0.82)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700 }}>Shared control space</div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
                <span style={{ color: '#4db6ff' }}>Blue: Brio USB</span>
                <span style={{ color: '#ff9f43' }}>Orange: iPhone RTSP</span>
                <span style={{ opacity: 0.75 }}>Calibration target: {activeCalibrationPoint ? activeCalibrationPoint.label : 'Complete'}</span>
              </div>
            </div>
            <svg
              viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                display: 'block',
                borderRadius: 18,
                background:
                  'linear-gradient(180deg, rgba(22,32,46,0.96) 0%, rgba(8,13,19,0.99) 100%)',
              }}
            >
              {[0.25, 0.5, 0.75].map((fraction) => (
                <g key={fraction}>
                  <line
                    x1={fraction * SVG_SIZE}
                    y1={0}
                    x2={fraction * SVG_SIZE}
                    y2={SVG_SIZE}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="2"
                  />
                  <line
                    x1={0}
                    y1={fraction * SVG_SIZE}
                    x2={SVG_SIZE}
                    y2={fraction * SVG_SIZE}
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth="2"
                  />
                </g>
              ))}
              <rect
                x="2"
                y="2"
                width={SVG_SIZE - 4}
                height={SVG_SIZE - 4}
                fill="none"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="4"
                rx="24"
              />
              {activeCalibrationPoint ? (
                <g>
                  <circle
                    cx={activeCalibrationPoint.xNorm * SVG_SIZE}
                    cy={activeCalibrationPoint.yNorm * SVG_SIZE}
                    r="26"
                    fill="rgba(246, 199, 93, 0.16)"
                    stroke="#f6c75d"
                    strokeWidth="5"
                  />
                  <circle
                    cx={activeCalibrationPoint.xNorm * SVG_SIZE}
                    cy={activeCalibrationPoint.yNorm * SVG_SIZE}
                    r="8"
                    fill="#f6c75d"
                  />
                </g>
              ) : null}
              <circle
                cx={target.xNorm * SVG_SIZE}
                cy={target.yNorm * SVG_SIZE}
                r={running ? 22 : 0}
                fill="rgba(110, 255, 193, 0.15)"
                stroke={running ? '#6effc1' : 'transparent'}
                strokeWidth="5"
              />
              {renderSource(brio, '#4db6ff', 'brio')}
              {renderSource(iphone, '#ff9f43', 'iphone')}
            </svg>
          </section>

          <div style={{ display: 'grid', gap: 14 }}>
            <SourceStatusCard
              title="Brio USB"
              color="#4db6ff"
              snapshot={brio}
              calibration={calibrationBySource.brio}
              active={activeCalibrationSource === 'brio'}
              onSelect={() => setActiveCalibrationSource('brio')}
              onCapture={() => handleCapture('brio')}
              onReset={() => handleResetCalibration('brio')}
            />
            <SourceStatusCard
              title="iPhone RTSP"
              color="#ff9f43"
              snapshot={iphone}
              calibration={calibrationBySource.iphone}
              active={activeCalibrationSource === 'iphone'}
              onSelect={() => setActiveCalibrationSource('iphone')}
              onCapture={() => handleCapture('iphone')}
              onReset={() => handleResetCalibration('iphone')}
            />
          </div>
        </div>

        <section
          style={{
            borderRadius: 20,
            padding: 16,
            background: 'rgba(11, 17, 25, 0.82)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'grid',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Benchmark controls</div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                Start only after both sources are calibrated so the comparison happens in the same control space.
              </div>
            </div>
            <div style={{ fontSize: 13, opacity: 0.82 }}>
              Mode: {compareModeLabel(mode)} | Duration: {benchmarkDurationSec.toFixed(0)}s | Elapsed: {(elapsedMs / 1000).toFixed(1)}s
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setMode('hold')}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: 0,
                background: mode === 'hold' ? '#f6c75d' : 'rgba(255,255,255,0.1)',
                color: mode === 'hold' ? '#182029' : '#f3f7fb',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Hold Still
            </button>
            <button
              type="button"
              onClick={() => setMode('follow')}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: 0,
                background: mode === 'follow' ? '#f6c75d' : 'rgba(255,255,255,0.1)',
                color: mode === 'follow' ? '#182029' : '#f3f7fb',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Follow Target
            </button>
            <button
              type="button"
              disabled={!bothCalibrated || running}
              onClick={() => setRunning(true)}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: 0,
                background: !bothCalibrated || running ? 'rgba(255,255,255,0.08)' : '#6effc1',
                color: !bothCalibrated || running ? 'rgba(255,255,255,0.45)' : '#071014',
                fontWeight: 700,
                cursor: !bothCalibrated || running ? 'default' : 'pointer',
              }}
            >
              {running ? 'Running…' : 'Start benchmark'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRunning(false)
                setElapsedMs(0)
                setTarget({ xNorm: 0.5, yNorm: 0.5 })
                setMetrics(makeEmptyBenchmarkMetrics())
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'transparent',
                color: '#f3f7fb',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reset results
            </button>
          </div>

          {!bothCalibrated ? (
            <div style={{ color: '#f6c75d', fontSize: 13 }}>
              Complete calibration for both sources before starting the benchmark.
            </div>
          ) : mode === 'hold' ? (
            <div style={{ fontSize: 13, opacity: 0.84 }}>
              Hold your hand as still as possible on the target. Lower error and lower step values usually mean steadier tracking.
            </div>
          ) : (
            <div style={{ fontSize: 13, opacity: 0.84 }}>
              Follow the moving target as closely as you can. Lower error means the tracking path stays closer to intended control.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <BenchmarkMetricsCard title="Brio USB" color="#4db6ff" metrics={metrics.brio} />
            <BenchmarkMetricsCard title="iPhone RTSP" color="#ff9f43" metrics={metrics.iphone} />
          </div>
        </section>
      </div>
    </div>
  )
}
