let screenX = 0
let screenY = 0
let velocityPx = 0
let velocityScreenXPx = 0
let velocityScreenYPx = 0
let lastMoveTime = 0

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
}

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
  }),
)
let latestSweepSeq = 0

// Light smoothing keeps release direction stable without adding noticeable latency.
const SCREEN_VELOCITY_BLEND = 0.35
const SCREEN_VELOCITY_MAX_ABS = 12000

export function updateCursorFromMouseEvent(
  x: number,
  y: number,
  timeMs?: number,
): void {
  const now = typeof timeMs === 'number' && Number.isFinite(timeMs)
    ? timeMs
    : performance.now()
  const dt = now - lastMoveTime

  if (lastMoveTime > 0 && dt > 0 && dt < 100) {
    const dx = x - screenX
    const dy = y - screenY
    const dist = Math.sqrt(dx * dx + dy * dy)
    velocityPx = (dist / dt) * 1000

    const rawVelocityScreenXPx = (dx / dt) * 1000
    const rawVelocityScreenYPx = (dy / dt) * 1000
    const clampedVelocityScreenXPx = Math.max(
      -SCREEN_VELOCITY_MAX_ABS,
      Math.min(SCREEN_VELOCITY_MAX_ABS, rawVelocityScreenXPx),
    )
    const clampedVelocityScreenYPx = Math.max(
      -SCREEN_VELOCITY_MAX_ABS,
      Math.min(SCREEN_VELOCITY_MAX_ABS, rawVelocityScreenYPx),
    )

    velocityScreenXPx += (
      clampedVelocityScreenXPx - velocityScreenXPx
    ) * SCREEN_VELOCITY_BLEND
    velocityScreenYPx += (
      clampedVelocityScreenYPx - velocityScreenYPx
    ) * SCREEN_VELOCITY_BLEND

    latestSweepSeq += 1
    const nextSweepSegment = sweepBuffer[latestSweepSeq % SWEEP_BUFFER_SIZE]
    if (nextSweepSegment) {
      nextSweepSegment.seq = latestSweepSeq
      nextSweepSegment.timeMs = now
      nextSweepSegment.x0 = screenX
      nextSweepSegment.y0 = screenY
      nextSweepSegment.x1 = x
      nextSweepSegment.y1 = y
      nextSweepSegment.velocityPx = velocityPx
      nextSweepSegment.velocityScreenXPx = velocityScreenXPx
      nextSweepSegment.velocityScreenYPx = velocityScreenYPx
    }
  }

  screenX = x
  screenY = y
  lastMoveTime = now
}

export function getCursorScreenPos(): { x: number; y: number } {
  return { x: screenX, y: screenY }
}

export function getCursorVelocityPx(): number {
  return velocityPx
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
  return true
}

export function decayCursorVelocity(delta: number): void {
  const decay = Math.exp(-8 * delta)
  velocityPx *= decay
  velocityScreenXPx *= decay
  velocityScreenYPx *= decay
}
