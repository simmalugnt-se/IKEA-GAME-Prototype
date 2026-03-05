import { useEffect, useRef, useState } from 'react'
import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
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

export function ScoreboardPage() {
  const settingsVersion = useSettingsVersion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [uiState, setUiState] = useState<ScoreboardUiState>(INITIAL_UI_STATE)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId = 0
    let disposed = false
    let frameCounter = 0
    let fpsWindowStart = performance.now()
    let lastSourceSampleMs = 0

    let riveDriver: ScoreboardRiveDriver | null = null
    let dmdRenderer: ScoreboardDmdRenderer | null = null
    let unsubscribeReceiver: (() => void) | null = null

    const setError = (message: string) => {
      setUiState((prev) => ({ ...prev, error: message }))
    }

    try {
      dmdRenderer = new ScoreboardDmdRenderer(canvas)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DMD renderer failed'
      setError(message)
      return () => {
        // no-op cleanup branch for failed init
      }
    }

    riveDriver = new ScoreboardRiveDriver((status) => {
      setUiState((prev) => ({
        ...prev,
        riveState: status.state,
        artboardName: status.artboardName ?? '-',
        animationName: status.animationName ?? '-',
        stateMachineName: status.stateMachineName ?? '-',
        error: status.error ?? prev.error,
      }))
    })

    unsubscribeReceiver = subscribeScoreboardEvents(
      (event) => {
        setUiState((prev) => ({
          ...prev,
          lastEventType: event.type,
        }))
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

      const sourceCanvas = riveDriver?.getCanvas()
      if (sourceCanvas && dmdRenderer) {
        dmdRenderer.render(sourceCanvas)
        frameCounter += 1

        if (now - lastSourceSampleMs >= 500) {
          lastSourceSampleMs = now
          const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true })
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
        setUiState((prev) => (prev.fps === fps ? prev : { ...prev, fps }))
      }
    }

    rafId = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      unsubscribeReceiver?.()
      riveDriver?.dispose()
      dmdRenderer?.dispose()
    }
  }, [settingsVersion])

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />

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
          <span style={styles.muted}>fps: {uiState.fps}</span>
        </div>
        <div style={styles.statusLine}>
          <span style={styles.label}>source</span>
          <span style={styles.value}>luma {uiState.sourceLuma}</span>
          <span style={styles.muted}>alpha {uiState.sourceAlpha}</span>
        </div>
      </div>

      {uiState.error && (
        <div style={styles.errorOverlay}>
          <div style={styles.errorTitle}>Scoreboard Renderer Error</div>
          <div style={styles.errorText}>{uiState.error}</div>
        </div>
      )}
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
