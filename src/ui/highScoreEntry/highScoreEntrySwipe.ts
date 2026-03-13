const GEOMETRY_EPSILON = 1e-6

export type ScreenRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type RectEdge = 'left' | 'right' | 'top' | 'bottom'

export type RectPassThroughMetrics = {
  entryEdge: RectEdge | null
  exitEdge: RectEdge | null
  insideDistancePx: number
  startsInside: boolean
  endsInside: boolean
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

function pointInRect(x: number, y: number, rect: ScreenRect): boolean {
  return (
    x >= rect.left - GEOMETRY_EPSILON
    && x <= rect.right + GEOMETRY_EPSILON
    && y >= rect.top - GEOMETRY_EPSILON
    && y <= rect.bottom + GEOMETRY_EPSILON
  )
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function resolveRectEdgeAtPoint(
  x: number,
  y: number,
  dx: number,
  dy: number,
  rect: ScreenRect,
): RectEdge | null {
  const onLeft = Math.abs(x - rect.left) <= GEOMETRY_EPSILON
  const onRight = Math.abs(x - rect.right) <= GEOMETRY_EPSILON
  const onTop = Math.abs(y - rect.top) <= GEOMETRY_EPSILON
  const onBottom = Math.abs(y - rect.bottom) <= GEOMETRY_EPSILON

  if (onLeft && !onTop && !onBottom) return 'left'
  if (onRight && !onTop && !onBottom) return 'right'
  if (onTop && !onLeft && !onRight) return 'top'
  if (onBottom && !onLeft && !onRight) return 'bottom'

  if (!onLeft && !onRight && !onTop && !onBottom) {
    return null
  }

  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  if (absDx >= absDy) {
    if (onLeft) return 'left'
    if (onRight) return 'right'
  }
  if (onTop) return 'top'
  if (onBottom) return 'bottom'
  if (onLeft) return 'left'
  if (onRight) return 'right'
  return null
}

function clipSegmentToRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: ScreenRect,
): { tEnter: number, tExit: number } | null {
  const dx = x1 - x0
  const dy = y1 - y0
  let tEnter = 0
  let tExit = 1

  const tests: Array<{ p: number, q: number }> = [
    { p: -dx, q: x0 - rect.left },
    { p: dx, q: rect.right - x0 },
    { p: -dy, q: y0 - rect.top },
    { p: dy, q: rect.bottom - y0 },
  ]

  for (let i = 0; i < tests.length; i += 1) {
    const { p, q } = tests[i]
    if (Math.abs(p) <= GEOMETRY_EPSILON) {
      if (q < 0) return null
      continue
    }

    const t = q / p
    if (p < 0) {
      if (t > tExit) return null
      if (t > tEnter) tEnter = t
      continue
    }
    if (t < tEnter) return null
    if (t < tExit) tExit = t
  }

  if (tExit < tEnter) return null
  return { tEnter: clamp01(tEnter), tExit: clamp01(tExit) }
}

export function toScreenRect(rect: DOMRectReadOnly | DOMRect): ScreenRect {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

export function resolveRectPassThroughMetrics(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rect: ScreenRect,
): RectPassThroughMetrics | null {
  if (!isFiniteNumber(x0) || !isFiniteNumber(y0) || !isFiniteNumber(x1) || !isFiniteNumber(y1)) return null

  const clip = clipSegmentToRect(x0, y0, x1, y1, rect)
  if (!clip) return null

  const dx = x1 - x0
  const dy = y1 - y0
  const totalDistancePx = Math.hypot(dx, dy)
  const startsInside = pointInRect(x0, y0, rect)
  const endsInside = pointInRect(x1, y1, rect)
  const entryT = clip.tEnter
  const exitT = clip.tExit
  const entryX = x0 + dx * entryT
  const entryY = y0 + dy * entryT
  const exitX = x0 + dx * exitT
  const exitY = y0 + dy * exitT
  const insideDistancePx = totalDistancePx * Math.max(0, exitT - entryT)

  return {
    entryEdge: startsInside ? null : resolveRectEdgeAtPoint(entryX, entryY, dx, dy, rect),
    exitEdge: endsInside ? null : resolveRectEdgeAtPoint(exitX, exitY, dx, dy, rect),
    insideDistancePx,
    startsInside,
    endsInside,
  }
}

export function isEdgeTransitionPass(entryEdge: RectEdge | null, exitEdge: RectEdge | null): boolean {
  return entryEdge !== null && exitEdge !== null && entryEdge !== exitEdge
}
