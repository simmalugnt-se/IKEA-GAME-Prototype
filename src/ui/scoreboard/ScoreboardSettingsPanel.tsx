import { useEffect, useMemo, useRef, useState } from 'react'
import { SCOREBOARD_SETTINGS } from '@/scoreboard/scoreBoardSettings'
import type {
  ScoreboardCurvePoint,
  ScoreboardSourceSettings,
} from '@/scoreboard/scoreBoardSettings.types'
import {
  normalizeScoreboardSourceSettings,
  SCOREBOARD_SOURCE_DIVIDER_MAX,
  SCOREBOARD_SOURCE_DIVIDER_MIN,
  type ResolvedScoreboardSource,
} from '@/ui/scoreboard/scoreboardSourceResolution'
import './scoreboardSettingsPanel.css'

type SaveState = 'idle' | 'saving' | 'error'

type ScoreboardSettingsPanelProps = {
  open: boolean
  saveState: SaveState
  saveError: string | null
  devSaveEnabled: boolean
  resolvedSource: ResolvedScoreboardSource
  onSettingsChanged: () => void
  onApplySource: (nextSource: ScoreboardSourceSettings) => void
  onSave: () => void
}

const CURVE_CANVAS_W = 320
const CURVE_CANVAS_H = 180
const PAD = 18

function clamp01(v: number): number {
  if (v <= 0) return 0
  if (v >= 1) return 1
  return v
}

function clampRange(v: number, min: number, max: number): number {
  if (v < min) return min
  if (v > max) return max
  return v
}

function parseNum(value: string, fallback: number): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizePoints(points: ScoreboardCurvePoint[]): ScoreboardCurvePoint[] {
  const fallback = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  if (!Array.isArray(points) || points.length < 2) return fallback

  const normalized = points
    .map((p, idx) => ({
      x: clamp01(Number.isFinite(p?.x) ? p.x : idx / Math.max(1, points.length - 1)),
      y: clamp01(Number.isFinite(p?.y) ? p.y : 0),
    }))
    .sort((a, b) => a.x - b.x)

  normalized[0] = { x: 0, y: 0 }
  normalized[normalized.length - 1] = { x: 1, y: 1 }
  return normalized
}

function toCanvasPoint(p: ScoreboardCurvePoint) {
  const plotW = CURVE_CANVAS_W - PAD * 2
  const plotH = CURVE_CANVAS_H - PAD * 2
  return {
    x: PAD + p.x * plotW,
    y: CURVE_CANVAS_H - PAD - p.y * plotH,
  }
}

function toCurvePoint(canvasX: number, canvasY: number): ScoreboardCurvePoint {
  const plotW = CURVE_CANVAS_W - PAD * 2
  const plotH = CURVE_CANVAS_H - PAD * 2
  const x = clamp01((canvasX - PAD) / plotW)
  const y = clamp01((CURVE_CANVAS_H - PAD - canvasY) / plotH)
  return { x, y }
}

export function ScoreboardSettingsPanel({
  open,
  saveState,
  saveError,
  devSaveEnabled,
  resolvedSource,
  onSettingsChanged,
  onApplySource,
  onSave,
}: ScoreboardSettingsPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [version, setVersion] = useState(0)
  const [sourceDraft, setSourceDraft] = useState<ScoreboardSourceSettings>(() =>
    normalizeScoreboardSourceSettings(SCOREBOARD_SETTINGS.dmd.source),
  )

  const points = useMemo(() => normalizePoints(SCOREBOARD_SETTINGS.dmd.curve.points), [version])

  useEffect(() => {
    if (!open) return
    SCOREBOARD_SETTINGS.dmd.curve.points = points
    setSourceDraft(normalizeScoreboardSourceSettings(SCOREBOARD_SETTINGS.dmd.source))
    onSettingsChanged()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, CURVE_CANVAS_W, CURVE_CANVAS_H)
    ctx.fillStyle = '#0b1118'
    ctx.fillRect(0, 0, CURVE_CANVAS_W, CURVE_CANVAS_H)

    ctx.strokeStyle = '#1f2a36'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4
      const x = PAD + (CURVE_CANVAS_W - PAD * 2) * t
      const y = PAD + (CURVE_CANVAS_H - PAD * 2) * t
      ctx.beginPath()
      ctx.moveTo(x, PAD)
      ctx.lineTo(x, CURVE_CANVAS_H - PAD)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(PAD, y)
      ctx.lineTo(CURVE_CANVAS_W - PAD, y)
      ctx.stroke()
    }

    ctx.strokeStyle = '#88f7cc'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i < points.length; i += 1) {
      const pt = toCanvasPoint(points[i])
      if (i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    }
    ctx.stroke()

    for (let i = 0; i < points.length; i += 1) {
      const pt = toCanvasPoint(points[i])
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, i === 0 || i === points.length - 1 ? 4 : 5, 0, Math.PI * 2)
      ctx.fillStyle = i === dragIndex ? '#ffffff' : '#3dd6a0'
      ctx.fill()
    }
  }, [open, points, dragIndex])

  function commitPoints(next: ScoreboardCurvePoint[]) {
    SCOREBOARD_SETTINGS.dmd.curve.points = normalizePoints(next)
    setVersion((v) => v + 1)
    onSettingsChanged()
  }

  function updatePoint(index: number, patch: Partial<ScoreboardCurvePoint>) {
    const next = points.map((p) => ({ ...p }))
    const isEndpoint = index === 0 || index === next.length - 1
    if (isEndpoint) return

    const prevX = next[index - 1].x + 0.001
    const nextX = next[index + 1].x - 0.001
    const x = patch.x === undefined ? next[index].x : Math.min(nextX, Math.max(prevX, clamp01(patch.x)))
    const y = patch.y === undefined ? next[index].y : clamp01(patch.y)
    next[index] = { x, y }
    commitPoints(next)
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    let hitIndex = -1
    let bestDist = Infinity
    for (let i = 1; i < points.length - 1; i += 1) {
      const pt = toCanvasPoint(points[i])
      const dx = pt.x - px
      const dy = pt.y - py
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        hitIndex = i
      }
    }
    if (hitIndex < 0 || bestDist > 225) return
    setDragIndex(hitIndex)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragIndex === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const cp = toCurvePoint(px, py)
    updatePoint(dragIndex, cp)
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragIndex === null) return
    setDragIndex(null)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  if (!open) return null

  const dmd = SCOREBOARD_SETTINGS.dmd

  return (
    <div className="sbsp-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sbsp-head">
        <div className="sbsp-title">Scoreboard DMD Settings</div>
        <div className="sbsp-head-actions">
          <button
            className="sbsp-apply"
            onClick={() => {
              const normalized = normalizeScoreboardSourceSettings(sourceDraft)
              setSourceDraft(normalized)
              onApplySource(normalized)
            }}
            title="Apply source settings without page refresh"
          >
            Apply Source
          </button>
          <button
            className="sbsp-save"
            disabled={!devSaveEnabled || saveState === 'saving'}
            onClick={onSave}
            title={devSaveEnabled ? 'Save to scoreBoardSettings.ts (dev only)' : 'Save is dev-only'}
          >
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="sbsp-row">
        <label>source.mode</label>
        <select
          value={sourceDraft.mode}
          onChange={(e) => {
            setSourceDraft((prev) => ({
              ...prev,
              mode: e.target.value === 'viewport_divider' ? 'viewport_divider' : 'fixed',
            }))
          }}
        >
          <option value="fixed">fixed</option>
          <option value="viewport_divider">viewport_divider</option>
        </select>
      </div>

      {sourceDraft.mode === 'fixed' ? (
        <>
          <div className="sbsp-row">
            <label>source.fixedWidth</label>
            <input
              type="number"
              min={1}
              max={8192}
              step={1}
              value={sourceDraft.fixedWidth}
              onChange={(e) => {
                setSourceDraft((prev) => ({
                  ...prev,
                  fixedWidth: Math.max(1, Math.floor(parseNum(e.target.value, prev.fixedWidth))),
                }))
              }}
            />
          </div>
          <div className="sbsp-row">
            <label>source.fixedHeight</label>
            <input
              type="number"
              min={1}
              max={8192}
              step={1}
              value={sourceDraft.fixedHeight}
              onChange={(e) => {
                setSourceDraft((prev) => ({
                  ...prev,
                  fixedHeight: Math.max(1, Math.floor(parseNum(e.target.value, prev.fixedHeight))),
                }))
              }}
            />
          </div>
        </>
      ) : (
        <div className="sbsp-row">
          <label>source.viewportDivider</label>
          <input
            type="range"
            min={SCOREBOARD_SOURCE_DIVIDER_MIN}
            max={SCOREBOARD_SOURCE_DIVIDER_MAX}
            step={0.01}
            value={sourceDraft.viewportDivider}
            onChange={(e) => {
              setSourceDraft((prev) => ({
                ...prev,
                viewportDivider: clampRange(
                  parseNum(e.target.value, prev.viewportDivider),
                  SCOREBOARD_SOURCE_DIVIDER_MIN,
                  SCOREBOARD_SOURCE_DIVIDER_MAX,
                ),
              }))
            }}
          />
          <input
            type="number"
            min={SCOREBOARD_SOURCE_DIVIDER_MIN}
            max={SCOREBOARD_SOURCE_DIVIDER_MAX}
            step={0.01}
            value={sourceDraft.viewportDivider}
            onChange={(e) => {
              setSourceDraft((prev) => ({
                ...prev,
                viewportDivider: clampRange(
                  parseNum(e.target.value, prev.viewportDivider),
                  SCOREBOARD_SOURCE_DIVIDER_MIN,
                  SCOREBOARD_SOURCE_DIVIDER_MAX,
                ),
              }))
            }}
          />
        </div>
      )}

      <div className="sbsp-row">
        <label>source.riveFit</label>
        <select
          value={sourceDraft.riveFit}
          onChange={(e) => {
            const fit = e.target.value === 'cover' || e.target.value === 'fill' ? e.target.value : 'contain'
            setSourceDraft((prev) => ({ ...prev, riveFit: fit }))
          }}
        >
          <option value="contain">contain</option>
          <option value="cover">cover</option>
          <option value="fill">fill</option>
        </select>
      </div>

      <div className="sbsp-row">
        <label>source.resolved</label>
        <span className="sbsp-readonly">
          {resolvedSource.width} x {resolvedSource.height}
          {resolvedSource.mode === 'viewport_divider' ? ` | div ${resolvedSource.divider.toFixed(2)}` : ''}
          {` | ${resolvedSource.fit}`}
        </span>
      </div>

      <div className="sbsp-row">
        <label>dotFill</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={dmd.grid.dotFill}
          onChange={(e) => {
            dmd.grid.dotFill = clamp01(parseNum(e.target.value, dmd.grid.dotFill))
            onSettingsChanged()
            setVersion((v) => v + 1)
          }}
        />
        <input
          type="number"
          min={0}
          max={1}
          step={0.001}
          value={dmd.grid.dotFill}
          onChange={(e) => {
            dmd.grid.dotFill = clamp01(parseNum(e.target.value, dmd.grid.dotFill))
            onSettingsChanged()
            setVersion((v) => v + 1)
          }}
        />
      </div>

      <div className="sbsp-row">
        <label>resolutionMultiplier</label>
        <input
          type="range"
          min={0.25}
          max={32}
          step={0.01}
          value={dmd.grid.resolutionMultiplier}
          onChange={(e) => {
            dmd.grid.resolutionMultiplier = clampRange(
              parseNum(e.target.value, dmd.grid.resolutionMultiplier),
              0.25,
              32,
            )
            onSettingsChanged()
            setVersion((v) => v + 1)
          }}
        />
        <input
          type="number"
          min={0.25}
          max={32}
          step={0.01}
          value={dmd.grid.resolutionMultiplier}
          onChange={(e) => {
            dmd.grid.resolutionMultiplier = clampRange(
              parseNum(e.target.value, dmd.grid.resolutionMultiplier),
              0.25,
              32,
            )
            onSettingsChanged()
            setVersion((v) => v + 1)
          }}
        />
      </div>

      <div className="sbsp-row">
        <label>targetFps</label>
        <input
          type="number"
          min={1}
          max={120}
          step={1}
          value={dmd.timing.targetFps}
          onChange={(e) => {
            dmd.timing.targetFps = Math.max(1, Math.floor(parseNum(e.target.value, dmd.timing.targetFps)))
            onSettingsChanged()
            setVersion((v) => v + 1)
          }}
        />
      </div>

      <div className="sbsp-row">
        <label>edge.enabled</label>
        <input
          type="checkbox"
          checked={dmd.edge.enabled}
          onChange={(e) => {
            dmd.edge.enabled = e.target.checked
            onSettingsChanged()
            setVersion((v) => v + 1)
          }}
        />
      </div>

      {[
        ['edge.detectRange', dmd.edge.detectRange, 0, 1, 0.001, (v: number) => { dmd.edge.detectRange = clamp01(v) }],
        ['edge.compressStrength', dmd.edge.compressStrength, 0, 1, 0.001, (v: number) => { dmd.edge.compressStrength = clamp01(v) }],
        ['edge.midBandMin', dmd.edge.midBandMin, 0, 1, 0.001, (v: number) => { dmd.edge.midBandMin = clamp01(v) }],
        ['edge.midBandMax', dmd.edge.midBandMax, 0, 1, 0.001, (v: number) => { dmd.edge.midBandMax = clamp01(v) }],
        ['curve.antiAliasCrush', dmd.curve.antiAliasCrush, 0, 1, 0.001, (v: number) => { dmd.curve.antiAliasCrush = clamp01(v) }],
      ].map(([label, value, min, max, step, setter]) => (
        <div className="sbsp-row" key={label as string}>
          <label>{label as string}</label>
          <input
            type="number"
            min={min as number}
            max={max as number}
            step={step as number}
            value={value as number}
            onChange={(e) => {
              ;(setter as (v: number) => void)(parseNum(e.target.value, value as number))
              onSettingsChanged()
              setVersion((v) => v + 1)
            }}
          />
        </div>
      ))}

      <div className="sbsp-curve-wrap">
        <div className="sbsp-curve-label">curve.points</div>
        <canvas
          ref={canvasRef}
          width={CURVE_CANVAS_W}
          height={CURVE_CANVAS_H}
          className="sbsp-curve-canvas"
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        />
      </div>

      <div className="sbsp-curve-list">
        {points.map((p, i) => {
          const endpoint = i === 0 || i === points.length - 1
          return (
            <div className="sbsp-curve-item" key={`${i}-${p.x.toFixed(4)}-${p.y.toFixed(4)}`}>
              <span>P{i}</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                value={p.x}
                disabled={endpoint}
                onChange={(e) => updatePoint(i, { x: parseNum(e.target.value, p.x) })}
              />
              <input
                type="number"
                min={0}
                max={1}
                step={0.001}
                value={p.y}
                disabled={endpoint}
                onChange={(e) => updatePoint(i, { y: parseNum(e.target.value, p.y) })}
              />
            </div>
          )
        })}
      </div>

      {!devSaveEnabled && <div className="sbsp-note">Save is available only in `npm run dev`.</div>}
      {saveState === 'error' && saveError && <div className="sbsp-error">{saveError}</div>}
    </div>
  )
}
