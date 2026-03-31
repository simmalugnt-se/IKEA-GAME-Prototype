import { FormEvent, useEffect, useRef, useState } from 'react'
import { SETTINGS } from '@/settings/GameSettings'

type ConnectionState = 'connecting' | 'open' | 'closed'

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

const SAMPLE_WINDOW_SIZE = 256
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

function makeSampleWindow(): SampleWindow {
  return {
    values: new Float64Array(SAMPLE_WINDOW_SIZE),
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

function snapshotRuntime(runtime: SourceRuntime, scratchA: Float64Array, scratchB: Float64Array, nowPerfMs: number): SourceSnapshot {
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

  const nextPoint: RuntimeTrailPoint = {
    xPx: slot.followerXPx,
    yPx: slot.followerYPx,
    timeMs,
  }
  slot.trail.push(nextPoint)
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

function useCursorCompareSource(url: string): SourceSnapshot {
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

          pushRenderSample(
            runtime,
            slotIndex,
            predictedXPx,
            predictedYPx,
            predictedTimeMs,
            nowPerfMs,
          )
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

function SourceCard({
  title,
  color,
  snapshot,
}: {
  title: string
  color: string
  snapshot: SourceSnapshot
}) {
  return (
    <section
      style={{
        border: `1px solid ${color}`,
        borderRadius: 14,
        padding: 16,
        background: 'rgba(11, 17, 25, 0.82)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <strong style={{ fontSize: 18 }}>{title}</strong>
        <span
          style={{
            color,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: 12,
          }}
        >
          {snapshot.connectionState}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
        <div>Recv FPS: {formatFps(snapshot.recvFps)}</div>
        <div>Frames: {snapshot.recvCount}</div>
        <div>Seq gaps: {snapshot.seqGapCount}</div>
        <div>Pointer count: {snapshot.pointers.length}</div>
        <div>Transport p50: {formatMs(snapshot.transportAge.p50)}</div>
        <div>Transport p95: {formatMs(snapshot.transportAge.p95)}</div>
        <div>Inter-arrival jitter: {formatMs(snapshot.intervalJitterMs)}</div>
        <div>Last frame age: {formatMs(snapshot.lastFrameAgoMs)}</div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, opacity: 0.82 }}>
        {snapshot.pointers.length > 0
          ? snapshot.pointers.map((pointer) => `${pointer.id}: ${pointer.xNorm.toFixed(3)}, ${pointer.yNorm.toFixed(3)}`).join(' | ')
          : 'No pointers in latest frame'}
      </div>
    </section>
  )
}

export function CursorComparePage() {
  const search = new URLSearchParams(window.location.search)
  const [draftBrioUrl, setDraftBrioUrl] = useState(() => parseInitialUrl(search, 'brioUrl', 'ws://127.0.0.1:9001/cursor'))
  const [draftIphoneUrl, setDraftIphoneUrl] = useState(() => parseInitialUrl(search, 'iphoneUrl', 'ws://127.0.0.1:9002/cursor'))
  const [brioUrl, setBrioUrl] = useState(draftBrioUrl)
  const [iphoneUrl, setIphoneUrl] = useState(draftIphoneUrl)

  const brio = useCursorCompareSource(brioUrl)
  const iphone = useCursorCompareSource(iphoneUrl)

  const handleApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBrioUrl(draftBrioUrl.trim())
    setIphoneUrl(draftIphoneUrl.trim())
  }

  const renderSource = (snapshot: SourceSnapshot, color: string, label: string) => (
    <>
      {snapshot.trails.map((trail) => (
        <path
          key={`${label}-${trail.id}`}
          d={buildPath(trail.points)}
          fill="none"
          stroke={color}
          strokeWidth={trail.id.endsWith('-2') ? 10 : 14}
          strokeOpacity={trail.id.endsWith('-2') ? 0.4 : 0.72}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {snapshot.pointers.map((pointer, index) => {
        const x = pointer.xNorm * SVG_SIZE
        const y = pointer.yNorm * SVG_SIZE
        const radius = index === 0 ? 20 : 14
        return (
          <g key={`${label}-${pointer.id}`}>
            <circle
              cx={x}
              cy={y}
              r={radius}
              fill={color}
              fillOpacity={index === 0 ? 0.95 : 0.55}
              stroke="#06131d"
              strokeWidth={4}
            />
            <text
              x={x + 24}
              y={y - 20}
              fill={color}
              fontSize="28"
              fontWeight="700"
            >
              {pointer.id}
            </text>
          </g>
        )
      })}
    </>
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(47, 122, 178, 0.24), transparent 30%), linear-gradient(180deg, #0a1118 0%, #05080c 100%)',
        color: '#f3f7fb',
        padding: 24,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 1500, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ display: 'grid', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1 }}>Cursor Compare</h1>
          <div style={{ opacity: 0.82, maxWidth: 860 }}>
            Overlay both live cursor streams in the same normalized playfield so we can compare update rate,
            stability, and visible trail quality without changing the actual game view. The overlay now uses
            the same style of prediction and trail-follow behavior as the in-game cursor.
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

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)', gap: 18 }}>
          <section
            style={{
              borderRadius: 20,
              padding: 16,
              background: 'rgba(11, 17, 25, 0.82)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700 }}>Normalized pointer overlay</div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
                <span style={{ color: '#4db6ff' }}>Blue: Brio USB</span>
                <span style={{ color: '#ff9f43' }}>Orange: iPhone RTSP</span>
                <span style={{ opacity: 0.75 }}>Render: game-style</span>
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
                  'linear-gradient(180deg, rgba(23,33,47,0.96) 0%, rgba(8,13,19,0.98) 100%)',
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
              {renderSource(brio, '#4db6ff', 'brio')}
              {renderSource(iphone, '#ff9f43', 'iphone')}
            </svg>
          </section>

          <div style={{ display: 'grid', gap: 14 }}>
            <SourceCard title="Brio USB" color="#4db6ff" snapshot={brio} />
            <SourceCard title="iPhone RTSP" color="#ff9f43" snapshot={iphone} />
          </div>
        </div>
      </div>
    </div>
  )
}
