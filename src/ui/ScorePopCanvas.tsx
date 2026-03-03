import { useEffect, useRef } from 'react'
import { subscribeToScorePops } from '@/input/scorePopEmitter'
import { applyEasing, clamp01 } from '@/utils/easing'

const POP_DURATION_MS = 750
const FLOAT_DISTANCE = 56
const FONT_SIZE = 20
const SCORE_TEXT_Y_OFFSET = 8
const BURST_FPS = 30
const BURST_FRAME_MS = 1000 / BURST_FPS
const BURST_SPOKE_COUNT = 8
const BURST_LINE_WIDTH = 2
const BURST_LONG_INNER_RADIUS = 3
const BURST_LONG_OUTER_RADIUS = 40
const BURST_SHORT_INNER_RADIUS = 22
const BURST_SHORT_OUTER_RADIUS = 36
const BURST_START_END_FRAME = 5
const BURST_END_END_FRAME = 8
const BURST_LAST_FRAME = 10
const BURST_DURATION_MS = BURST_LAST_FRAME * BURST_FRAME_MS

const mix = (a: number, b: number, t: number): number => a + (b - a) * t

type ScorePop = {
  text: string
  x: number
  y: number
  burst: boolean
  createdAt: number
}

export function ScorePopCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pops: ScorePop[] = []
    let rafId = 0

    const syncSize = () => {
      const dpr = window.devicePixelRatio ?? 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    syncSize()

    const resizeObserver = new ResizeObserver(syncSize)
    resizeObserver.observe(canvas)

    const unsubscribe = subscribeToScorePops(({ text, x, y, burst }) => {
      pops.push({ text, x, y, burst: burst !== false, createdAt: performance.now() })
    })

    const frame = () => {
      rafId = requestAnimationFrame(frame)

      const now = performance.now()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      for (let i = pops.length - 1; i >= 0; i--) {
        const pop = pops[i]
        const elapsed = now - pop.createdAt
        if (elapsed >= POP_DURATION_MS) {
          pops.splice(i, 1)
          continue
        }

        const t = elapsed / POP_DURATION_MS
        const alpha = 1 - t
        const floatY = pop.y + SCORE_TEXT_Y_OFFSET - FLOAT_DISTANCE * t

        if (pop.burst && elapsed <= BURST_DURATION_MS) {
          const burstFrame = elapsed / BURST_FRAME_MS
          const trimStart = applyEasing(burstFrame / BURST_START_END_FRAME, 'easeOutQuart')
          const trimEnd = applyEasing(burstFrame / BURST_END_END_FRAME, 'easeOutCubic')
          const burstFade =
            burstFrame <= BURST_END_END_FRAME
              ? 1
              : 1 - clamp01((burstFrame - BURST_END_END_FRAME) / (BURST_LAST_FRAME - BURST_END_END_FRAME))

          if (burstFade > 0) {
            ctx.save()
            ctx.globalAlpha = burstFade
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = BURST_LINE_WIDTH
            ctx.lineCap = 'round'

            for (let spoke = 0; spoke < BURST_SPOKE_COUNT; spoke++) {
              const angle = (Math.PI * 2 * spoke) / BURST_SPOKE_COUNT - Math.PI / 2
              const cos = Math.cos(angle)
              const sin = Math.sin(angle)
              const isLongSpoke = spoke % 2 === 0
              const innerRadius = isLongSpoke ? BURST_LONG_INNER_RADIUS : BURST_SHORT_INNER_RADIUS
              const outerRadius = isLongSpoke ? BURST_LONG_OUTER_RADIUS : BURST_SHORT_OUTER_RADIUS
              const strokeStartRadius = mix(innerRadius, outerRadius, trimStart)
              const strokeEndRadius = mix(innerRadius, outerRadius, trimEnd)
              const startRadius = Math.min(strokeStartRadius, strokeEndRadius)
              const endRadius = Math.max(strokeStartRadius, strokeEndRadius)
              const startX = pop.x + cos * startRadius
              const startY = pop.y + sin * startRadius
              const endX = pop.x + cos * endRadius
              const endY = pop.y + sin * endRadius

              ctx.beginPath()
              ctx.moveTo(startX, startY)
              ctx.lineTo(endX, endY)
              ctx.stroke()
            }

            ctx.restore()
          }
        }

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.font = `${FONT_SIZE}px "Instrument Sans", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        ctx.fillStyle = '#fff'
        ctx.fillText(pop.text, pop.x, floatY)
        ctx.restore()
      }
    }



    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      unsubscribe()
      resizeObserver.disconnect()
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
