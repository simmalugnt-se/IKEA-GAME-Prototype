import { SETTINGS } from '@/settings/GameSettings'

export type CursorSweepSegment = {
  seq: number
  timeMs: number
  x0: number
  y0: number
  x1: number
  y1: number
  velocityPx: number
  velocityScreenXPx: number
  velocityScreenYPx: number
  pointerSlot: 0 | 1
}

export type ExternalCursorPointerSample = {
  id: string
  xPx: number
  yPx: number
}

export type CursorPointerRenderState = {
  slot: 0 | 1
  active: boolean
  x: number
  y: number
  velocityPx: number
}

type PointerSlotState = {
  id: string
  active: boolean
  x: number
  y: number
  velocityPx: number
  velocityScreenXPx: number
  velocityScreenYPx: number
  lastMoveTime: number
  lastPacketMs: number
}

const POINTER_SLOT_COUNT = 2
const MOUSE_POINTER_ID = '__mouse__'
const EXTERNAL_TIME_OFFSET_BLEND = 0.2
const EXTERNAL_MAX_EXTRAPOLATION_MS = 30
const EXTERNAL_MIN_SAMPLE_STEP_MS = 0.25
const SEGMENT_EPSILON = 1e-6

const SWEEP_BUFFER_SIZE = 128
const sweepBuffer: CursorSweepSegment[] = Array.from(
  { length: SWEEP_BUFFER_SIZE },
  () => ({
    seq: 0,
    timeMs: 0,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    velocityPx: 0,
    velocityScreenXPx: 0,
    velocityScreenYPx: 0,
    pointerSlot: 0,
  }),
)

const pointerSlots: PointerSlotState[] = Array.from(
  { length: POINTER_SLOT_COUNT },
  () => ({
    id: '',
    active: false,
    x: 0,
    y: 0,
    velocityPx: 0,
    velocityScreenXPx: 0,
    velocityScreenYPx: 0,
    lastMoveTime: 0,
    lastPacketMs: 0,
  }),
)

let latestSweepSeq = 0
let externalOffsetMs = 0
let externalOffsetReady = false
let maxExternalPointersOverride: number | null = null

// Light smoothing keeps release direction stable without adding noticeable latency.
const SCREEN_VELOCITY_BLEND = 0.35
const SCREEN_VELOCITY_MAX_ABS = 12000

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function clampPointerSlot(slot: number): 0 | 1 {
  return slot <= 0 ? 0 : 1
}

function resolveMaxExternalPointers(): number {
  const raw = maxExternalPointersOverride ?? SETTINGS.cursor.external.maxPointers
  if (!Number.isFinite(raw)) return 2
  return clamp(Math.trunc(raw), 1, POINTER_SLOT_COUNT)
}

export function setMaxExternalPointersOverride(maxPointers: number | null): void {
  maxExternalPointersOverride = maxPointers
  const resolvedMaxPointers = resolveMaxExternalPointers()
  for (let i = resolvedMaxPointers; i < POINTER_SLOT_COUNT; i += 1) {
    const slot = pointerSlots[i]
    if (slot) resetSlot(slot)
  }
}

function resolveExternalStaleTimeoutMs(): number {
  const timeout = SETTINGS.cursor.external.staleTimeoutMs
  if (!Number.isFinite(timeout)) return 120
  return Math.max(1, timeout)
}

function resetSlot(slot: PointerSlotState): void {
  slot.id = ''
  slot.active = false
  slot.x = 0
  slot.y = 0
  slot.velocityPx = 0
  slot.velocityScreenXPx = 0
  slot.velocityScreenYPx = 0
  slot.lastMoveTime = 0
  slot.lastPacketMs = 0
}

function resetAllSlots(): void {
  for (let i = 0; i < POINTER_SLOT_COUNT; i += 1) {
    const slot = pointerSlots[i]
    if (slot) resetSlot(slot)
  }
}

function markSweepSegment(
  slotIndex: 0 | 1,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  timeMs: number,
  velocityPx: number,
  velocityScreenXPx: number,
  velocityScreenYPx: number,
): void {
  latestSweepSeq += 1
  const segment = sweepBuffer[latestSweepSeq % SWEEP_BUFFER_SIZE]
  if (!segment) return

  segment.seq = latestSweepSeq
  segment.timeMs = timeMs
  segment.x0 = x0
  segment.y0 = y0
  segment.x1 = x1
  segment.y1 = y1
  segment.velocityPx = velocityPx
  segment.velocityScreenXPx = velocityScreenXPx
  segment.velocityScreenYPx = velocityScreenYPx
  segment.pointerSlot = slotIndex
}

function updateStaleExternalPointers(nowMs: number): void {
  const staleTimeoutMs = resolveExternalStaleTimeoutMs()
  for (let i = 0; i < POINTER_SLOT_COUNT; i += 1) {
    const slot = pointerSlots[i]
    if (!slot || !slot.active) continue
    if (slot.id === MOUSE_POINTER_ID) continue
    if (nowMs - slot.lastPacketMs <= staleTimeoutMs) continue
    resetSlot(slot)
  }
}

function pushSampleToSlot(
  slotIndex: 0 | 1,
  x: number,
  y: number,
  timeMs: number,
  packetTimeMs: number,
): void {
  const slot = pointerSlots[slotIndex]
  if (!slot) return

  const dt = timeMs - slot.lastMoveTime
  if (slot.lastMoveTime > 0 && dt > 0 && dt < 100) {
    const dx = x - slot.x
    const dy = y - slot.y
    const dist = Math.hypot(dx, dy)
    slot.velocityPx = (dist / dt) * 1000

    const rawVelocityScreenXPx = (dx / dt) * 1000
    const rawVelocityScreenYPx = (dy / dt) * 1000
    const clampedVelocityScreenXPx = clamp(
      rawVelocityScreenXPx,
      -SCREEN_VELOCITY_MAX_ABS,
      SCREEN_VELOCITY_MAX_ABS,
    )
    const clampedVelocityScreenYPx = clamp(
      rawVelocityScreenYPx,
      -SCREEN_VELOCITY_MAX_ABS,
      SCREEN_VELOCITY_MAX_ABS,
    )

    slot.velocityScreenXPx += (
      clampedVelocityScreenXPx - slot.velocityScreenXPx
    ) * SCREEN_VELOCITY_BLEND
    slot.velocityScreenYPx += (
      clampedVelocityScreenYPx - slot.velocityScreenYPx
    ) * SCREEN_VELOCITY_BLEND

    markSweepSegment(
      slotIndex,
      slot.x,
      slot.y,
      x,
      y,
      timeMs,
      slot.velocityPx,
      slot.velocityScreenXPx,
      slot.velocityScreenYPx,
    )
  }

  slot.active = true
  slot.x = x
  slot.y = y
  slot.lastMoveTime = timeMs
  slot.lastPacketMs = packetTimeMs
}

function assignExternalPointerSlot(pointerId: string, maxPointers: number): 0 | 1 {
  for (let i = 0; i < maxPointers; i += 1) {
    const slot = pointerSlots[i]
    if (slot?.id === pointerId) {
      return clampPointerSlot(i)
    }
  }

  for (let i = 0; i < maxPointers; i += 1) {
    const slot = pointerSlots[i]
    if (!slot || slot.active) continue
    resetSlot(slot)
    slot.id = pointerId
    return clampPointerSlot(i)
  }

  let oldestIndex = 0
  let oldestPacketMs = Number.POSITIVE_INFINITY
  for (let i = 0; i < maxPointers; i += 1) {
    const slot = pointerSlots[i]
    if (!slot) continue
    if (slot.lastPacketMs < oldestPacketMs) {
      oldestPacketMs = slot.lastPacketMs
      oldestIndex = i
    }
  }

  const replacementSlot = pointerSlots[oldestIndex]
  if (replacementSlot) {
    resetSlot(replacementSlot)
    replacementSlot.id = pointerId
  }
  return clampPointerSlot(oldestIndex)
}

export function beginExternalCursorSession(): void {
  resetAllSlots()
  externalOffsetMs = 0
  externalOffsetReady = false
}

export function endExternalCursorSession(): void {
  resetAllSlots()
  externalOffsetMs = 0
  externalOffsetReady = false
}

export function submitCursorSample(
  x: number,
  y: number,
  timeMs?: number,
): void {
  const now = typeof timeMs === 'number' && Number.isFinite(timeMs)
    ? timeMs
    : performance.now()
  const mouseSlot = pointerSlots[0]
  if (!mouseSlot) return

  if (mouseSlot.id !== MOUSE_POINTER_ID) {
    resetSlot(mouseSlot)
    mouseSlot.id = MOUSE_POINTER_ID
  }

  pushSampleToSlot(0, x, y, now, now)
}

export function submitExternalCursorFrame(
  sourceTimeMs: number,
  pointers: ReadonlyArray<ExternalCursorPointerSample>,
  pointerCount?: number,
): void {
  if (!Number.isFinite(sourceTimeMs)) return

  const now = performance.now()
  updateStaleExternalPointers(now)

  const rawOffsetMs = now - sourceTimeMs
  if (!externalOffsetReady || !Number.isFinite(externalOffsetMs)) {
    externalOffsetMs = rawOffsetMs
    externalOffsetReady = true
  } else {
    externalOffsetMs += (rawOffsetMs - externalOffsetMs) * EXTERNAL_TIME_OFFSET_BLEND
  }

  const maxPointers = resolveMaxExternalPointers()
  const maxCount = clamp(
    typeof pointerCount === 'number' && Number.isFinite(pointerCount)
      ? Math.trunc(pointerCount)
      : pointers.length,
    0,
    Math.min(maxPointers, pointers.length),
  )

  for (let i = 0; i < maxCount; i += 1) {
    const pointer = pointers[i]
    if (!pointer) continue
    const id = pointer.id
    if (typeof id !== 'string' || id.length === 0) continue
    if (!Number.isFinite(pointer.xPx) || !Number.isFinite(pointer.yPx)) continue

    const slotIndex = assignExternalPointerSlot(id, maxPointers)
    const slot = pointerSlots[slotIndex]
    if (!slot) continue

    let sampleTimeMs = sourceTimeMs + externalOffsetMs
    if (!Number.isFinite(sampleTimeMs)) sampleTimeMs = now

    if (slot.lastMoveTime > 0) {
      const minNext = slot.lastMoveTime + EXTERNAL_MIN_SAMPLE_STEP_MS
      if (sampleTimeMs < minNext) sampleTimeMs = minNext
    }

    let predictMs = now - sampleTimeMs
    if (!Number.isFinite(predictMs)) predictMs = 0
    predictMs = clamp(predictMs, 0, EXTERNAL_MAX_EXTRAPOLATION_MS)

    const predictScale = predictMs / 1000
    const predictedX = pointer.xPx + slot.velocityScreenXPx * predictScale
    const predictedY = pointer.yPx + slot.velocityScreenYPx * predictScale
    const predictedTimeMs = sampleTimeMs + predictMs

    pushSampleToSlot(slotIndex, predictedX, predictedY, predictedTimeMs, now)
  }
}

export function submitEmptyExternalCursorFrame(sourceTimeMs: number): void {
  if (!Number.isFinite(sourceTimeMs)) return

  const now = performance.now()
  updateStaleExternalPointers(now)

  const rawOffsetMs = now - sourceTimeMs
  if (!externalOffsetReady || !Number.isFinite(externalOffsetMs)) {
    externalOffsetMs = rawOffsetMs
    externalOffsetReady = true
  } else {
    externalOffsetMs += (rawOffsetMs - externalOffsetMs) * EXTERNAL_TIME_OFFSET_BLEND
  }

  for (let i = 0; i < POINTER_SLOT_COUNT; i += 1) {
    const slot = pointerSlots[i]
    if (!slot) continue
    if (slot.id === MOUSE_POINTER_ID) continue
    resetSlot(slot)
  }
}

export function getCursorScreenPos(): { x: number; y: number } {
  const slot0 = pointerSlots[0]
  if (slot0?.active) {
    return { x: slot0.x, y: slot0.y }
  }
  const slot1 = pointerSlots[1]
  if (slot1?.active) {
    return { x: slot1.x, y: slot1.y }
  }
  return { x: 0, y: 0 }
}

export function getCursorVelocityPx(): number {
  const now = performance.now()
  updateStaleExternalPointers(now)

  let maxVelocity = 0
  for (let i = 0; i < POINTER_SLOT_COUNT; i += 1) {
    const slot = pointerSlots[i]
    if (!slot?.active) continue
    if (slot.velocityPx > maxVelocity) {
      maxVelocity = slot.velocityPx
    }
  }
  return maxVelocity
}

export function getLatestCursorSweepSeq(): number {
  return latestSweepSeq
}

export function readCursorSweepSegment(seq: number, out: CursorSweepSegment): boolean {
  if (seq <= 0 || seq > latestSweepSeq) return false

  const segment = sweepBuffer[seq % SWEEP_BUFFER_SIZE]
  if (!segment || segment.seq !== seq) return false

  out.seq = segment.seq
  out.timeMs = segment.timeMs
  out.x0 = segment.x0
  out.y0 = segment.y0
  out.x1 = segment.x1
  out.y1 = segment.y1
  out.velocityPx = segment.velocityPx
  out.velocityScreenXPx = segment.velocityScreenXPx
  out.velocityScreenYPx = segment.velocityScreenYPx
  out.pointerSlot = segment.pointerSlot
  return true
}

export function readCursorPointerRenderState(
  slotIndex: 0 | 1,
  nowMs: number,
  out: CursorPointerRenderState,
): boolean {
  updateStaleExternalPointers(nowMs)

  const slot = pointerSlots[slotIndex]
  if (!slot || !slot.active) return false

  let x = slot.x
  let y = slot.y
  let predictMs = nowMs - slot.lastMoveTime
  if (!Number.isFinite(predictMs)) predictMs = 0
  predictMs = clamp(predictMs, 0, EXTERNAL_MAX_EXTRAPOLATION_MS)

  if (predictMs > SEGMENT_EPSILON) {
    const predictScale = predictMs / 1000
    x += slot.velocityScreenXPx * predictScale
    y += slot.velocityScreenYPx * predictScale
  }

  out.slot = slotIndex
  out.active = true
  out.x = x
  out.y = y
  out.velocityPx = slot.velocityPx
  return true
}

export function decayCursorVelocity(delta: number): void {
  const decay = Math.exp(-8 * delta)
  const now = performance.now()
  updateStaleExternalPointers(now)

  for (let i = 0; i < POINTER_SLOT_COUNT; i += 1) {
    const slot = pointerSlots[i]
    if (!slot) continue

    slot.velocityPx *= decay
    slot.velocityScreenXPx *= decay
    slot.velocityScreenYPx *= decay

    if (Math.abs(slot.velocityPx) < 0.01) slot.velocityPx = 0
    if (Math.abs(slot.velocityScreenXPx) < 0.01) slot.velocityScreenXPx = 0
    if (Math.abs(slot.velocityScreenYPx) < 0.01) slot.velocityScreenYPx = 0
  }
}
