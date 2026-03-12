import { useEffect, useRef } from 'react'
import { subscribeToScorePops, type ScorePopStyleKey } from '@/input/scorePopEmitter'
import { POPDOT_SHADOW_COLOR, resolvePopdotShadowOffsets } from '@/ui/hudTypography'
import { applyEasing, clamp01, type EasingName } from '@/utils/easing'
import './ScorePopCanvas.css'

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
const POP_MULTI_LINE_HEIGHT_EM = 0.8
const POP_SPRITE_PADDING_PX = 4
const POP_LETTER_SPACING_EM = 0.08

const mix = (a: number, b: number, t: number): number => a + (b - a) * t

type ScorePop = {
  text: string
  x: number
  y: number
  burst: boolean
  style: ScorePopStyleKey
  createdAt: number
  spriteCanvas: HTMLCanvasElement | null
  anchorX: number
  anchorY: number
  logicalWidth: number
  logicalHeight: number
}

const POP_DEFAULT_STYLE: ScorePopStyleKey = 'style3'
const POP_FONT_FAMILY_BY_STYLE: Record<ScorePopStyleKey, string> = {
  style1: '"popdot-canvas-style1", "popdot", "Instrument Sans", sans-serif',
  style2: '"popdot-canvas-style2", "popdot", "Instrument Sans", sans-serif',
  style3: '"popdot-canvas-style3", "popdot", "Instrument Sans", sans-serif',
  style4: '"popdot-canvas-style4", "popdot", "Instrument Sans", sans-serif',
  style5: '"popdot-canvas-style5", "popdot", "Instrument Sans", sans-serif',
}
const POP_SHADOW_OFFSETS_BY_STYLE: Record<ScorePopStyleKey, number[]> = {
  style1: resolvePopdotShadowOffsets(8),
  style2: resolvePopdotShadowOffsets(4),
  style3: resolvePopdotShadowOffsets(2),
  style4: resolvePopdotShadowOffsets(4),
  style5: resolvePopdotShadowOffsets(4),
}
const SPRITE_POOL_MAX = 64

type PopLineLayout = {
  text: string
  font: string
  yOffset: number
  ascent: number
  descent: number
  width: number
  xOffset: number
  letterSpacingPx: number
  useManualLetterSpacing: boolean
}

type PopTextLayout = {
  lines: PopLineLayout[]
  logicalWidth: number
  logicalHeight: number
  contentLeftX: number
  anchorX: number
  anchorY: number
}

type PopSprite = {
  canvas: HTMLCanvasElement
  anchorX: number
  anchorY: number
  logicalWidth: number
  logicalHeight: number
}

type ComboWeightKeyframe = {
  startMs: number
  endMs: number
  from: number
  to: number
  easing: EasingName
}

const COMBO_WEIGHT_TIMELINE: ComboWeightKeyframe[] = [
  { startMs: 0, endMs: 250, from: 25, to: 375, easing: 'easeInOutCubic' },
  { startMs: 250, endMs: 500, from: 375, to: 50, easing: 'easeInOutCubic' },
  { startMs: 500, endMs: 750, from: 50, to: 375, easing: 'easeInOutCubic' },
  { startMs: 750, endMs: 1000, from: 375, to: 50, easing: 'easeInOutCubic' },
  { startMs: 1000, endMs: 1250, from: 50, to: 375, easing: 'easeInOutCubic' },
  { startMs: 1250, endMs: 1500, from: 375, to: 25, easing: 'easeInOutCubic' },
]
const COMBO_TIMELINE_END_MS =
  COMBO_WEIGHT_TIMELINE.length > 0
    ? (COMBO_WEIGHT_TIMELINE[COMBO_WEIGHT_TIMELINE.length - 1]?.endMs ?? 0)
    : 0
const COMBO_TIMELINE_START_WEIGHT = COMBO_WEIGHT_TIMELINE[0]?.from ?? 100
const COMBO_TIMELINE_END_WEIGHT =
  COMBO_WEIGHT_TIMELINE.length > 0
    ? (COMBO_WEIGHT_TIMELINE[COMBO_WEIGHT_TIMELINE.length - 1]?.to ?? COMBO_TIMELINE_START_WEIGHT)
    : COMBO_TIMELINE_START_WEIGHT
const COMBO_WEIGHT_MIN = COMBO_WEIGHT_TIMELINE.reduce(
  (minWeight, segment) => Math.min(minWeight, segment.from, segment.to),
  Number.POSITIVE_INFINITY,
)
const COMBO_WEIGHT_MAX = COMBO_WEIGHT_TIMELINE.reduce(
  (maxWeight, segment) => Math.max(maxWeight, segment.from, segment.to),
  Number.NEGATIVE_INFINITY,
)
const COMBO_WEIGHT_CLAMP_MIN = Number.isFinite(COMBO_WEIGHT_MIN) ? COMBO_WEIGHT_MIN : COMBO_TIMELINE_START_WEIGHT
const COMBO_WEIGHT_CLAMP_MAX = Number.isFinite(COMBO_WEIGHT_MAX) ? COMBO_WEIGHT_MAX : COMBO_TIMELINE_START_WEIGHT

function resolveCanvasFont(style: ScorePopStyleKey, sizePx: number): string {
  const family = POP_FONT_FAMILY_BY_STYLE[style] ?? POP_FONT_FAMILY_BY_STYLE[POP_DEFAULT_STYLE]
  if (style === 'style5') {
    return `375 ${sizePx}px ${family}`
  }
  return `${sizePx}px ${family}`
}

function resolveComboCanvasFont(sizePx: number, weight: number): string {
  const family = POP_FONT_FAMILY_BY_STYLE.style5
  const clampedWeight = Math.max(COMBO_WEIGHT_CLAMP_MIN, Math.min(COMBO_WEIGHT_CLAMP_MAX, weight))
  return `${Math.round(clampedWeight)} ${sizePx}px ${family}`
}

function resolveRootRemPx(): number {
  if (typeof window === 'undefined') return 16
  const raw = window.getComputedStyle(document.documentElement).fontSize
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return 16
  return parsed
}

function resolveStyleLineSizePx(style: ScorePopStyleKey, lineIndex: number, rootRemPx: number): number {
  if (style !== 'style5') return FONT_SIZE
  return (lineIndex === 0 ? 1.75 : 2) * rootRemPx
}

function resolveLineLetterSpacingPx(lineSizePx: number): number {
  return lineSizePx * POP_LETTER_SPACING_EM
}

function resolveNativeLetterSpacingCss(): string {
  return `${POP_LETTER_SPACING_EM}em`
}

function resolvePopDurationMs(style: ScorePopStyleKey): number {
  return style === 'style5' ? Math.max(1, COMBO_TIMELINE_END_MS) : POP_DURATION_MS
}

function resolveComboWeight(elapsedMs: number): number {
  if (COMBO_WEIGHT_TIMELINE.length === 0) return COMBO_TIMELINE_START_WEIGHT
  if (elapsedMs <= 0) return COMBO_TIMELINE_START_WEIGHT
  if (elapsedMs >= COMBO_TIMELINE_END_MS) return COMBO_TIMELINE_END_WEIGHT
  for (let segmentIndex = 0; segmentIndex < COMBO_WEIGHT_TIMELINE.length; segmentIndex += 1) {
    const segment = COMBO_WEIGHT_TIMELINE[segmentIndex]
    if (!segment) continue
    if (elapsedMs > segment.endMs) continue
    const duration = Math.max(1, segment.endMs - segment.startMs)
    const localT = (elapsedMs - segment.startMs) / duration
    const easedT = applyEasing(localT, segment.easing)
    return mix(segment.from, segment.to, easedT)
  }
  return COMBO_TIMELINE_END_WEIGHT
}

function resolvePopTextLayout(
  measureCtx: CanvasRenderingContext2D,
  text: string,
  style: ScorePopStyleKey,
  rootRemPx: number,
  comboWeight: number | null,
  nativeLetterSpacingSupported: boolean,
): PopTextLayout {
  const rawLines = text.split('\n')
  const lines: PopLineLayout[] = []
  const lineCount = rawLines.length
  let maxLineSize = 0
  let maxLineWidth = 0

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const lineText = rawLines[lineIndex] ?? ''
    const lineSizePx = resolveStyleLineSizePx(style, lineIndex, rootRemPx)
    const lineFont =
      style === 'style5' && comboWeight !== null
        ? resolveComboCanvasFont(lineSizePx, comboWeight)
        : resolveCanvasFont(style, lineSizePx)
    measureCtx.font = lineFont
    const lineLetterSpacingPx = resolveLineLetterSpacingPx(lineSizePx)
    if (nativeLetterSpacingSupported) {
      ; (measureCtx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = resolveNativeLetterSpacingCss()
    }
    const metrics = measureCtx.measureText(lineText)
    const glyphCount = Array.from(lineText).length
    const manualSpacingWidth = nativeLetterSpacingSupported
      ? 0
      : Math.max(0, glyphCount - 1) * lineLetterSpacingPx
    const width = Math.max(1, metrics.width + manualSpacingWidth)
    const ascent = Math.max(1, metrics.actualBoundingBoxAscent ?? lineSizePx * 0.8)
    const descent = Math.max(1, metrics.actualBoundingBoxDescent ?? lineSizePx * 0.2)
    maxLineSize = Math.max(maxLineSize, lineSizePx)
    maxLineWidth = Math.max(maxLineWidth, width)
    lines.push({
      text: lineText,
      font: lineFont,
      yOffset: 0,
      ascent,
      descent,
      width,
      xOffset: 0,
      letterSpacingPx: lineLetterSpacingPx,
      useManualLetterSpacing: !nativeLetterSpacingSupported,
    })
  }

  const lineAdvancePx =
    lineCount > 1
      ? Math.max(1, maxLineSize * POP_MULTI_LINE_HEIGHT_EM)
      : 0
  const centeredLineIndex = (lineCount - 1) * 0.5

  let textTop = Number.POSITIVE_INFINITY
  let textBottom = Number.NEGATIVE_INFINITY

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const line = lines[lineIndex]
    if (!line) continue
    const yOffset = (lineIndex - centeredLineIndex) * lineAdvancePx
    line.yOffset = yOffset
    line.xOffset = (maxLineWidth - line.width) * 0.5
    if (yOffset - line.ascent < textTop) textTop = yOffset - line.ascent
    if (yOffset + line.descent > textBottom) textBottom = yOffset + line.descent
  }

  if (!Number.isFinite(maxLineWidth) || maxLineWidth <= 0) maxLineWidth = 1
  if (!Number.isFinite(textTop) || !Number.isFinite(textBottom) || textBottom <= textTop) {
    textTop = -FONT_SIZE * 0.5
    textBottom = FONT_SIZE * 0.5
  }

  const shadowOffsets = POP_SHADOW_OFFSETS_BY_STYLE[style] ?? POP_SHADOW_OFFSETS_BY_STYLE[POP_DEFAULT_STYLE]
  const maxShadowOffset = shadowOffsets.length > 0 ? shadowOffsets[shadowOffsets.length - 1] : 0
  const padding = maxShadowOffset + POP_SPRITE_PADDING_PX
  const logicalWidth = Math.max(1, Math.ceil(maxLineWidth + padding * 2))
  const logicalHeight = Math.max(1, Math.ceil(textBottom - textTop + padding * 2))
  const contentLeftX = padding
  const anchorX = contentLeftX + maxLineWidth * 0.5
  const anchorY = padding - textTop

  return {
    lines,
    logicalWidth,
    logicalHeight,
    contentLeftX,
    anchorX,
    anchorY,
  }
}

function drawLineWithSpacing(
  ctx: CanvasRenderingContext2D,
  line: PopLineLayout,
  drawX: number,
  drawY: number,
): void {
  ctx.font = line.font
  if (!line.useManualLetterSpacing) {
    ; (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = resolveNativeLetterSpacingCss()
    ctx.fillText(line.text, drawX, drawY)
    return
  }
  const graphemes = Array.from(line.text)
  let cursorX = drawX
  for (let i = 0; i < graphemes.length; i += 1) {
    const grapheme = graphemes[i] ?? ''
    ctx.fillText(grapheme, cursorX, drawY)
    const advanceWidth = ctx.measureText(grapheme).width
    if (i < graphemes.length - 1) {
      cursorX += advanceWidth + line.letterSpacingPx
    } else {
      cursorX += advanceWidth
    }
  }
}

function drawPopTextLayers(ctx: CanvasRenderingContext2D, layout: PopTextLayout, style: ScorePopStyleKey): void {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = POPDOT_SHADOW_COLOR
  const popShadowOffsets = POP_SHADOW_OFFSETS_BY_STYLE[style] ?? POP_SHADOW_OFFSETS_BY_STYLE[POP_DEFAULT_STYLE]
  for (let shadowStepIndex = 0; shadowStepIndex < popShadowOffsets.length; shadowStepIndex += 1) {
    const shadowOffset = popShadowOffsets[shadowStepIndex]
    for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex += 1) {
      const line = layout.lines[lineIndex]
      if (!line || line.text.length === 0) continue
      drawLineWithSpacing(
        ctx,
        line,
        layout.contentLeftX + line.xOffset + shadowOffset,
        layout.anchorY + line.yOffset + shadowOffset,
      )
    }
  }

  ctx.fillStyle = '#fff'
  for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex += 1) {
    const line = layout.lines[lineIndex]
    if (!line || line.text.length === 0) continue
    drawLineWithSpacing(ctx, line, layout.contentLeftX + line.xOffset, layout.anchorY + line.yOffset)
  }
}

export function ScorePopCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pops: ScorePop[] = []
    const spritePool: HTMLCanvasElement[] = []
    let rafId = 0
    let canvasDpr = 1
    const nativeLetterSpacingSupported = 'letterSpacing' in ctx

    const acquireSpriteCanvas = (): HTMLCanvasElement => {
      const pooled = spritePool.pop()
      if (pooled) return pooled
      return document.createElement('canvas')
    }

    const releaseSpriteCanvas = (spriteCanvas: HTMLCanvasElement): void => {
      if (spritePool.length >= SPRITE_POOL_MAX) return
      spriteCanvas.width = 1
      spriteCanvas.height = 1
      spritePool.push(spriteCanvas)
    }

    const createPopSprite = (
      text: string,
      style: ScorePopStyleKey,
      dpr: number,
      comboWeight: number | null,
      existingCanvas: HTMLCanvasElement | null,
    ): PopSprite | null => {
      if (text.length === 0) return null
      const rootRemPx = resolveRootRemPx()
      const layout = resolvePopTextLayout(
        ctx,
        text,
        style,
        rootRemPx,
        comboWeight,
        nativeLetterSpacingSupported,
      )
      const spriteCanvas = existingCanvas ?? acquireSpriteCanvas()
      spriteCanvas.width = Math.max(1, Math.ceil(layout.logicalWidth * dpr))
      spriteCanvas.height = Math.max(1, Math.ceil(layout.logicalHeight * dpr))
      const spriteCtx = spriteCanvas.getContext('2d')
      if (!spriteCtx) {
        releaseSpriteCanvas(spriteCanvas)
        return null
      }
      spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      spriteCtx.clearRect(0, 0, layout.logicalWidth, layout.logicalHeight)
      drawPopTextLayers(spriteCtx, layout, style)
      return {
        canvas: spriteCanvas,
        anchorX: layout.anchorX,
        anchorY: layout.anchorY,
        logicalWidth: layout.logicalWidth,
        logicalHeight: layout.logicalHeight,
      }
    }

    const assignPopSprite = (pop: ScorePop, dpr: number, comboWeight: number | null = null): void => {
      const previousCanvas = pop.spriteCanvas
      const sprite = createPopSprite(pop.text, pop.style, dpr, comboWeight, previousCanvas)
      if (previousCanvas && sprite?.canvas !== previousCanvas) {
        releaseSpriteCanvas(previousCanvas)
      }
      pop.spriteCanvas = sprite?.canvas ?? null
      pop.anchorX = sprite?.anchorX ?? 0
      pop.anchorY = sprite?.anchorY ?? 0
      pop.logicalWidth = sprite?.logicalWidth ?? 0
      pop.logicalHeight = sprite?.logicalHeight ?? 0
    }

    const rebuildActiveSprites = (): void => {
      for (let popIndex = 0; popIndex < pops.length; popIndex += 1) {
        const pop = pops[popIndex]
        if (!pop || pop.text.length === 0) continue
        const comboWeight = pop.style === 'style5' ? resolveComboWeight(performance.now() - pop.createdAt) : null
        assignPopSprite(pop, canvasDpr, comboWeight)
      }
    }

    const syncSize = () => {
      canvasDpr = window.devicePixelRatio ?? 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = w * canvasDpr
      canvas.height = h * canvasDpr
      ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0)
    }

    syncSize()

    const resizeObserver = new ResizeObserver(() => {
      const previousDpr = canvasDpr
      syncSize()
      if (canvasDpr !== previousDpr) {
        rebuildActiveSprites()
      }
    })
    resizeObserver.observe(canvas)

    const unsubscribe = subscribeToScorePops(({ text, x, y, burst, style }) => {
      const resolvedStyle = style ?? POP_DEFAULT_STYLE
      const pop: ScorePop = {
        text,
        x,
        y,
        burst: burst !== false,
        style: resolvedStyle,
        createdAt: performance.now(),
        spriteCanvas: null,
        anchorX: 0,
        anchorY: 0,
        logicalWidth: 0,
        logicalHeight: 0,
      }
      if (text.length > 0) {
        const comboWeight = resolvedStyle === 'style5' ? resolveComboWeight(0) : null
        assignPopSprite(pop, canvasDpr, comboWeight)
      }
      pops.push(pop)
    })

    const frame = () => {
      rafId = requestAnimationFrame(frame)

      const currentDpr = window.devicePixelRatio ?? 1
      if (currentDpr !== canvasDpr) {
        syncSize()
        rebuildActiveSprites()
      }

      const now = performance.now()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      for (let i = pops.length - 1; i >= 0; i--) {
        const pop = pops[i]
        const elapsed = now - pop.createdAt
        const popDurationMs = resolvePopDurationMs(pop.style)
        if (elapsed >= popDurationMs) {
          if (pop.spriteCanvas) {
            releaseSpriteCanvas(pop.spriteCanvas)
          }
          pops.splice(i, 1)
          continue
        }

        const t = elapsed / popDurationMs
        const alpha = pop.style === 'style5' ? 1 : 1 - t
        const floatY = pop.y + SCORE_TEXT_Y_OFFSET - FLOAT_DISTANCE * t

        if (pop.style === 'style5' && pop.text.length > 0) {
          assignPopSprite(pop, canvasDpr, resolveComboWeight(elapsed))
        }

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
        if (pop.spriteCanvas && pop.logicalWidth > 0 && pop.logicalHeight > 0) {
          ctx.drawImage(
            pop.spriteCanvas,
            pop.x - pop.anchorX,
            floatY - pop.anchorY,
            pop.logicalWidth,
            pop.logicalHeight,
          )
        } else if (pop.text.length > 0) {
          const comboWeight = pop.style === 'style5' ? resolveComboWeight(elapsed) : null
          const fallbackLayout = resolvePopTextLayout(
            ctx,
            pop.text,
            pop.style,
            resolveRootRemPx(),
            comboWeight,
            nativeLetterSpacingSupported,
          )
          const fallbackDrawX = pop.x - fallbackLayout.anchorX
          const fallbackDrawY = floatY - fallbackLayout.anchorY
          ctx.translate(fallbackDrawX, fallbackDrawY)
          drawPopTextLayers(ctx, fallbackLayout, pop.style)
        }
        ctx.restore()
      }
    }



    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      unsubscribe()
      resizeObserver.disconnect()
      for (let i = 0; i < pops.length; i += 1) {
        const pop = pops[i]
        if (pop.spriteCanvas) {
          releaseSpriteCanvas(pop.spriteCanvas)
        }
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="score-pop-canvas"
    />
  )
}
