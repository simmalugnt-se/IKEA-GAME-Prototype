import { useEffect, useRef } from 'react'
import { tryPlaySwooshFromVelocity } from '@/audio/GameAudioRouter'
import { SETTINGS } from '@/settings/GameSettings'
import { submitMouseCursorSample } from '@/input/CursorInputRouter'
import {
  decayCursorVelocity,
  getCursorVelocityPx,
  readCursorPointerRenderState,
  type CursorPointerRenderState,
} from '@/input/cursorVelocity'

const MAX_TRAIL_POINTS = 96
const TRAIL_SLOT_COUNT = 2
const MIN_POINT_DISTANCE_PX = 0.25
const MIN_POINT_TIME_MS = 8
const EXTERNAL_TRAIL_BREAK_JUMP_RATIO = 0.18
const EXTERNAL_TRAIL_BREAK_MIN_PX = 220

export function CursorTrailCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const historyX = [
      new Float32Array(MAX_TRAIL_POINTS),
      new Float32Array(MAX_TRAIL_POINTS),
    ]
    const historyY = [
      new Float32Array(MAX_TRAIL_POINTS),
      new Float32Array(MAX_TRAIL_POINTS),
    ]
    const historyTime = [
      new Float64Array(MAX_TRAIL_POINTS),
      new Float64Array(MAX_TRAIL_POINTS),
    ]
    const historyWriteIndex = new Int32Array(TRAIL_SLOT_COUNT)
    const historyCount = new Int32Array(TRAIL_SLOT_COUNT)

    let rafId = 0
    let lastFrameTime = performance.now()
    let previousInputSource = SETTINGS.cursor.inputSource

    const pointerRenderState0: CursorPointerRenderState = {
      slot: 0,
      active: false,
      x: 0,
      y: 0,
      velocityPx: 0,
    }
    const pointerRenderState1: CursorPointerRenderState = {
      slot: 1,
      active: false,
      x: 0,
      y: 0,
      velocityPx: 0,
    }

    const clearHistorySlot = (slot: 0 | 1) => {
      historyWriteIndex[slot] = 0
      historyCount[slot] = 0
    }

    const clearAllHistory = () => {
      clearHistorySlot(0)
      clearHistorySlot(1)
    }

    const resolveExternalTrailBreakDistancePx = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const viewportMin = Math.min(
        Number.isFinite(width) && width > 0 ? width : EXTERNAL_TRAIL_BREAK_MIN_PX,
        Number.isFinite(height) && height > 0 ? height : EXTERNAL_TRAIL_BREAK_MIN_PX,
      )
      return Math.max(
        EXTERNAL_TRAIL_BREAK_MIN_PX,
        viewportMin * EXTERNAL_TRAIL_BREAK_JUMP_RATIO,
      )
    }

    const pushHistoryPoint = (slot: 0 | 1, x: number, y: number, timeMs: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(timeMs)) return

      const count = historyCount[slot]
      const writeIndex = historyWriteIndex[slot]
      if (count > 0) {
        const previousIndex = (writeIndex - 1 + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS
        const dx = x - historyX[slot][previousIndex]
        const dy = y - historyY[slot][previousIndex]
        const dt = timeMs - historyTime[slot][previousIndex]
        if ((dx * dx + dy * dy) <= (MIN_POINT_DISTANCE_PX * MIN_POINT_DISTANCE_PX) && dt < MIN_POINT_TIME_MS) {
          return
        }
      }

      historyX[slot][writeIndex] = x
      historyY[slot][writeIndex] = y
      historyTime[slot][writeIndex] = timeMs

      historyWriteIndex[slot] = (writeIndex + 1) % MAX_TRAIL_POINTS
      if (count < MAX_TRAIL_POINTS) {
        historyCount[slot] = count + 1
      }
    }

    const pushExternalHistoryPoint = (slot: 0 | 1, x: number, y: number, timeMs: number) => {
      const count = historyCount[slot]
      if (count > 0) {
        const writeIndex = historyWriteIndex[slot]
        const previousIndex = (writeIndex - 1 + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS
        const dx = x - historyX[slot][previousIndex]
        const dy = y - historyY[slot][previousIndex]
        const dist = Math.hypot(dx, dy)
        if (dist > resolveExternalTrailBreakDistancePx()) {
          clearHistorySlot(slot)
        }
      }

      pushHistoryPoint(slot, x, y, timeMs)
    }

    const pruneHistorySlot = (slot: 0 | 1, nowMs: number, maxAgeMs: number) => {
      let count = historyCount[slot]
      while (count > 1) {
        const oldestIndex = (historyWriteIndex[slot] - count + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS
        if (nowMs - historyTime[slot][oldestIndex] <= maxAgeMs) break
        count -= 1
      }
      historyCount[slot] = count
    }

    const drawHistorySlot = (slot: 0 | 1, smoothing: number, color: string, lineWidth: number) => {
      const count = historyCount[slot]
      if (count < 2) return

      const oldestIndex = (historyWriteIndex[slot] - count + MAX_TRAIL_POINTS) % MAX_TRAIL_POINTS
      let index = oldestIndex
      let previousX = historyX[slot][index]
      let previousY = historyY[slot][index]

      ctx.beginPath()
      ctx.moveTo(previousX, previousY)

      for (let i = 1; i < count; i += 1) {
        index = (oldestIndex + i) % MAX_TRAIL_POINTS
        const currentX = historyX[slot][index]
        const currentY = historyY[slot][index]
        const midX = (previousX + currentX) * 0.5
        const midY = (previousY + currentY) * 0.5
        const cpX = midX + (previousX - midX) * smoothing
        const cpY = midY + (previousY - midY) * smoothing
        ctx.quadraticCurveTo(cpX, cpY, midX, midY)
        previousX = currentX
        previousY = currentY
      }

      ctx.lineTo(previousX, previousY)
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = 0.9
      ctx.stroke()
    }

    const syncSize = () => {
      const dpr = window.devicePixelRatio ?? 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    syncSize()

    const resizeObserver = new ResizeObserver(syncSize)
    resizeObserver.observe(canvas)

    const normalizeEventTime = (timeStamp: number): number => {
      if (!Number.isFinite(timeStamp) || timeStamp <= 0 || timeStamp > 1e9) {
        return performance.now()
      }
      return timeStamp
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (SETTINGS.cursor.inputSource !== 'mouse') return

      const samples = typeof e.getCoalescedEvents === 'function'
        ? e.getCoalescedEvents()
        : []

      if (samples.length > 0) {
        for (let i = 0; i < samples.length; i += 1) {
          const sample = samples[i]
          const eventTime = normalizeEventTime(sample.timeStamp)
          submitMouseCursorSample(sample.clientX, sample.clientY, eventTime)
          pushHistoryPoint(0, sample.clientX, sample.clientY, eventTime)
        }
        return
      }

      const eventTime = normalizeEventTime(e.timeStamp)
      submitMouseCursorSample(e.clientX, e.clientY, eventTime)
      pushHistoryPoint(0, e.clientX, e.clientY, eventTime)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.style.cursor = 'none'

    const frame = () => {
      rafId = requestAnimationFrame(frame)

      const now = performance.now()
      const delta = (now - lastFrameTime) / 1000
      lastFrameTime = now

      decayCursorVelocity(delta)

      const velocity = getCursorVelocityPx()
      tryPlaySwooshFromVelocity(velocity, now)

      const inputSource = SETTINGS.cursor.inputSource
      if (inputSource !== previousInputSource) {
        clearAllHistory()
        previousInputSource = inputSource
      }

      if (inputSource === 'external') {
        if (readCursorPointerRenderState(0, now, pointerRenderState0)) {
          pushExternalHistoryPoint(0, pointerRenderState0.x, pointerRenderState0.y, now)
        } else {
          clearHistorySlot(0)
        }
        if (readCursorPointerRenderState(1, now, pointerRenderState1)) {
          pushExternalHistoryPoint(1, pointerRenderState1.x, pointerRenderState1.y, now)
        } else {
          clearHistorySlot(1)
        }
      }

      const maxAgeMs = SETTINGS.cursor.trail.maxAge * 1000
      pruneHistorySlot(0, now, maxAgeMs)
      pruneHistorySlot(1, now, maxAgeMs)

      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      const smoothing = SETTINGS.cursor.trail.smoothing ?? 0.5
      const lineWidth = SETTINGS.cursor.trail.lineWidth ?? 4
      const color = SETTINGS.cursor.trail.color

      drawHistorySlot(0, smoothing, color, lineWidth)
      if (inputSource === 'external') {
        drawHistorySlot(1, smoothing, color, lineWidth)
      }
    }

    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
      resizeObserver.disconnect()
      document.documentElement.style.cursor = ''
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}
