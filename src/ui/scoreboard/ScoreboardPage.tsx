import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ScoreboardSourceSettings,
} from '@/scoreboard/scoreBoardSettings.types'
import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import { SCOREBOARD_SETTINGS } from '@/scoreboard/scoreBoardSettings'
import {
  subscribeScoreboardEvents,
  type ScoreboardReceiverStatus,
} from '@/scoreboard/scoreboardReceiver'
import { useSettingsVersion } from '@/settings/settingsStore'
import { ScoreboardDmdRenderer } from '@/ui/scoreboard/ScoreboardDmdRenderer'
import {
  ScoreboardRiveDriver,
  type ScoreboardRiveStatus,
} from '@/ui/scoreboard/ScoreboardRiveDriver'
import { ScoreboardSettingsPanel } from '@/ui/scoreboard/ScoreboardSettingsPanel'
import {
  isSameResolvedScoreboardSource,
  resolveScoreboardSourceSize,
  type ResolvedScoreboardSource,
} from '@/ui/scoreboard/scoreboardSourceResolution'

type ScoreboardUiState = {
  wsState: ScoreboardReceiverStatus['wsState']
  wsEnabled: boolean
  wsUrl: string
  riveState: ScoreboardRiveStatus['state']
  artboardName: string
  animationName: string
  stateMachineName: string
  lastEventType: ScoreboardEvent['type'] | 'none'
  sourceLuma: number
  sourceAlpha: number
  fps: number
  error: string | null
}

const INITIAL_UI_STATE: ScoreboardUiState = {
  wsState: 'disabled',
  wsEnabled: false,
  wsUrl: '',
  riveState: 'idle',
  artboardName: '-',
  animationName: '-',
  stateMachineName: '-',
  lastEventType: 'none',
  sourceLuma: 0,
  sourceAlpha: 0,
  fps: 0,
  error: null,
}

function getStatusColor(wsState: ScoreboardReceiverStatus['wsState']): string {
  if (wsState === 'open') return '#4ade80'
  if (wsState === 'connecting') return '#f59e0b'
  if (wsState === 'closed') return '#f97316'
  if (wsState === 'error') return '#ef4444'
  return '#94a3b8'
}

function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return {
      width: SCOREBOARD_SETTINGS.dmd.source.fixedWidth,
      height: SCOREBOARD_SETTINGS.dmd.source.fixedHeight,
    }
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function resolveCurrentSource(): ResolvedScoreboardSource {
  const viewport = getViewportSize()
  return resolveScoreboardSourceSize(viewport.width, viewport.height, SCOREBOARD_SETTINGS.dmd.source)
}

export function ScoreboardPage() {
  const globalSettingsVersion = useSettingsVersion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dmdRendererRef = useRef<ScoreboardDmdRenderer | null>(null)
  const overlayVisibleRef = useRef(SCOREBOARD_SETTINGS.debug.showOverlayByDefault === true)
  const [overlayVisible, setOverlayVisible] = useState(
    SCOREBOARD_SETTINGS.debug.showOverlayByDefault === true,
  )
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [, setScoreboardSettingsVersion] = useState(0)
  const [sourceConfigVersion, setSourceConfigVersion] = useState(0)
  const [appliedSource, setAppliedSource] = useState<ResolvedScoreboardSource>(() => resolveCurrentSource())
  const appliedSourceRef = useRef(appliedSource)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uiState, setUiState] = useState<ScoreboardUiState>(INITIAL_UI_STATE)

  useEffect(() => {
    overlayVisibleRef.current = overlayVisible
  }, [overlayVisible])

  useEffect(() => {
    appliedSourceRef.current = appliedSource
  }, [appliedSource])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (
        target
        && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable)
      ) {
        return
      }
      if (event.key === '§' || event.code === 'Backquote') {
        event.preventDefault()
        setOverlayVisible((prev) => !prev)
        return
      }
      if (event.code === 'Digit1') {
        event.preventDefault()
        setIsSettingsOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleScoreboardSettingsChanged = useCallback(() => {
    dmdRendererRef.current?.syncFromSettings()
    setScoreboardSettingsVersion((v) => v + 1)
  }, [])

  const handleApplySource = useCallback((nextSource: ScoreboardSourceSettings) => {
    SCOREBOARD_SETTINGS.dmd.source = nextSource
    const resolved = resolveCurrentSource()
    if (isSameResolvedScoreboardSource(appliedSourceRef.current, resolved)) return
    setAppliedSource(resolved)
    setSourceConfigVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (appliedSource.mode !== 'viewport_divider') return

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const resolved = resolveCurrentSource()
        if (isSameResolvedScoreboardSource(appliedSourceRef.current, resolved)) return
        setAppliedSource(resolved)
        setSourceConfigVersion((v) => v + 1)
      }, 200)
    }

    window.addEventListener('resize', onResize)
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('resize', onResize)
    }
  }, [appliedSource.mode])

  const handleSave = useCallback(async () => {
    if (!import.meta.env.DEV) return
    try {
      setSaveState('saving')
      setSaveError(null)
      const response = await fetch('/__dev/scoreboard/settings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(SCOREBOARD_SETTINGS),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(typeof data.error === 'string' ? data.error : `Save failed (${response.status})`)
      }
      window.location.reload()
    } catch (error) {
      setSaveState('error')
      setSaveError(error instanceof Error ? error.message : 'Save failed')
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let disposed = false
    let rafId = 0
    let frameCounter = 0
    let fpsWindowStart = performance.now()
    let lastSourceSampleMs = 0
    let lastDmdRenderMs = 0

    let riveDriver: ScoreboardRiveDriver | null = null
    let dmdRenderer: ScoreboardDmdRenderer | null = null
    let unsubscribeReceiver: (() => void) | null = null
    let sourceCtx: CanvasRenderingContext2D | null = null

    const setError = (message: string) => {
      setUiState((prev) => ({ ...prev, error: message }))
    }

    try {
      dmdRenderer = new ScoreboardDmdRenderer(canvas, appliedSource.width, appliedSource.height)
      dmdRendererRef.current = dmdRenderer
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DMD renderer failed'
      setError(message)
      return () => {}
    }

    riveDriver = new ScoreboardRiveDriver({
      sourceWidth: appliedSource.width,
      sourceHeight: appliedSource.height,
      riveFit: appliedSource.fit,
      onStatus: (status) => {
        setUiState((prev) => ({
          ...prev,
          riveState: status.state,
          artboardName: status.artboardName ?? '-',
          animationName: status.animationName ?? '-',
          stateMachineName: status.stateMachineName ?? '-',
          error: status.error ?? prev.error,
        }))
      },
    })

    unsubscribeReceiver = subscribeScoreboardEvents(
      (event) => {
        setUiState((prev) => ({ ...prev, lastEventType: event.type }))
      },
      (status) => {
        setUiState((prev) => ({
          ...prev,
          wsEnabled: status.wsEnabled,
          wsState: status.wsState,
          wsUrl: status.wsUrl,
        }))
      },
    )

    const frame = (now: number) => {
      if (disposed) return
      rafId = requestAnimationFrame(frame)

      const targetFps = Math.max(1, Math.floor(SCOREBOARD_SETTINGS.dmd.timing.targetFps))
      const renderIntervalMs = 1000 / targetFps
      const shouldRender = now - lastDmdRenderMs >= renderIntervalMs
      if (!shouldRender) return
      lastDmdRenderMs = now

      const sourceCanvas = riveDriver?.getCanvas()
      if (sourceCanvas && dmdRenderer) {
        dmdRenderer.render(sourceCanvas)
        frameCounter += 1

        if (overlayVisibleRef.current && now - lastSourceSampleMs >= 500) {
          lastSourceSampleMs = now
          if (!sourceCtx) sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
          if (sourceCtx) {
            const image = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
            const data = image.data
            let lumaAcc = 0
            let alphaAcc = 0
            let samples = 0

            for (let i = 0; i < data.length; i += 64) {
              const r = data[i] / 255
              const g = data[i + 1] / 255
              const b = data[i + 2] / 255
              const a = data[i + 3] / 255
              const unpremultipliedLuma = a > 0.0001
                ? ((r / a) * 0.2126 + (g / a) * 0.7152 + (b / a) * 0.0722)
                : 0
              lumaAcc += Math.max(0, Math.min(1, unpremultipliedLuma)) * a
              alphaAcc += a
              samples += 1
            }

            const avgLuma = samples > 0 ? lumaAcc / samples : 0
            const avgAlpha = samples > 0 ? alphaAcc / samples : 0
            setUiState((prev) => ({
              ...prev,
              sourceLuma: Number(avgLuma.toFixed(3)),
              sourceAlpha: Number(avgAlpha.toFixed(3)),
            }))
          }
        }
      }

      const elapsed = now - fpsWindowStart
      if (elapsed >= 1000) {
        const fps = Math.round((frameCounter * 1000) / elapsed)
        frameCounter = 0
        fpsWindowStart = now
        if (overlayVisibleRef.current) {
          setUiState((prev) => (prev.fps === fps ? prev : { ...prev, fps }))
        }
      }
    }

    rafId = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      unsubscribeReceiver?.()
      riveDriver?.dispose()
      dmdRenderer?.dispose()
      dmdRendererRef.current = null
    }
  }, [globalSettingsVersion, sourceConfigVersion, appliedSource.fit, appliedSource.height, appliedSource.width])

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />

      {overlayVisible && (
        <div style={styles.status}>
          <div style={styles.statusLine}>
            <span style={styles.label}>transport</span>
            <span style={{ ...styles.value, color: getStatusColor(uiState.wsState) }}>
              {uiState.wsEnabled ? uiState.wsState : 'bc_only'}
            </span>
            <span style={styles.muted}>{uiState.wsEnabled ? uiState.wsUrl : 'BroadcastChannel only'}</span>
          </div>
          <div style={styles.statusLine}>
            <span style={styles.label}>rive</span>
            <span style={styles.value}>{uiState.riveState}</span>
            <span style={styles.muted}>
              artboard: {uiState.artboardName} | animation: {uiState.animationName} | sm: {uiState.stateMachineName}
            </span>
          </div>
          <div style={styles.statusLine}>
            <span style={styles.label}>event</span>
            <span style={styles.value}>{uiState.lastEventType}</span>
            <span style={styles.muted}>dmd fps: {uiState.fps}</span>
          </div>
          <div style={styles.statusLine}>
            <span style={styles.label}>source</span>
            <span style={styles.value}>luma {uiState.sourceLuma}</span>
            <span style={styles.muted}>alpha {uiState.sourceAlpha}</span>
          </div>
          <div style={styles.statusLine}>
            <span style={styles.label}>source cfg</span>
            <span style={styles.value}>{appliedSource.mode}</span>
            <span style={styles.muted}>
              {appliedSource.width}x{appliedSource.height}
              {appliedSource.mode === 'viewport_divider' ? ` | div ${appliedSource.divider.toFixed(2)}` : ''}
              {' | fit '}
              {appliedSource.fit}
            </span>
          </div>
          <div style={styles.statusLine}>
            <span style={styles.label}>dmd mode</span>
            <span style={styles.value}>4-level edge-compress</span>
            <span style={styles.muted}>target fps {SCOREBOARD_SETTINGS.dmd.timing.targetFps}</span>
          </div>
          <div style={styles.statusLine}>
            <span style={styles.label}>dmd edge</span>
            <span style={styles.value}>range {SCOREBOARD_SETTINGS.dmd.edge.detectRange.toFixed(2)}</span>
            <span style={styles.muted}>strength {SCOREBOARD_SETTINGS.dmd.edge.compressStrength.toFixed(2)}</span>
          </div>
        </div>
      )}

      {uiState.error && (
        <div style={styles.errorOverlay}>
          <div style={styles.errorTitle}>Scoreboard Renderer Error</div>
          <div style={styles.errorText}>{uiState.error}</div>
        </div>
      )}

      <ScoreboardSettingsPanel
        open={isSettingsOpen}
        saveState={saveState}
        saveError={saveError}
        devSaveEnabled={import.meta.env.DEV}
        resolvedSource={appliedSource}
        onSettingsChanged={handleScoreboardSettingsChanged}
        onApplySource={handleApplySource}
        onSave={handleSave}
      />
    </div>
  )
}

const styles = {
  page: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#040b07',
    overflow: 'hidden',
    fontFamily: 'monospace',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
  },
  status: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'rgba(0, 0, 0, 0.55)',
    color: '#d1fae5',
    pointerEvents: 'none' as const,
    zIndex: 20,
  },
  statusLine: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: 10,
    fontSize: 12,
    minHeight: 16,
  },
  label: {
    color: '#86efac',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    minWidth: 78,
    opacity: 0.9,
  },
  value: {
    color: '#ecfccb',
    minWidth: 80,
    fontWeight: 700,
  },
  muted: {
    color: '#a7f3d0',
    opacity: 0.75,
  },
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: 12,
    background: 'rgba(8, 0, 0, 0.88)',
    color: '#fecaca',
    padding: 24,
    textAlign: 'center' as const,
    zIndex: 60,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#fca5a5',
    letterSpacing: '0.03em',
  },
  errorText: {
    fontSize: 14,
    color: '#fee2e2',
    maxWidth: 720,
    lineHeight: 1.45,
  },
} as const

