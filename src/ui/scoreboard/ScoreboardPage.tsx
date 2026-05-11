import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ScoreboardSourceSettings,
} from '@/scoreboard/scoreBoardSettings.types'
import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import { isInstallationStopShortcut, requestInstallationStop } from '@/installationStop'
import {
  useScoreboardInstallationWatchdog,
  useWebglContextLossReload,
} from '@/installationWatchdog'
import {
  createHighScoresUpdatedEvent,
  createLiveRankUpdatedEvent,
} from '@/scoreboard/highScoreScoreboardEvents'
import {
  subscribeHighScoreSubmissionSnapshot,
} from '@/scoreboard/highScoreSubmissionRuntime'
import { SCOREBOARD_SETTINGS } from '@/scoreboard/scoreBoardSettings'
import {
  subscribeScoreboardEvents,
  type ScoreboardReceiverStatus,
} from '@/scoreboard/scoreboardReceiver'
import { useSettingsVersion } from '@/settings/settingsStore'
import { ScoreboardDmdRenderer } from '@/ui/scoreboard/ScoreboardDmdRenderer'
import {
  createScoreboardEventOrchestrator,
} from '@/ui/scoreboard/scoreboardEventOrchestrator'
import {
  ScoreboardRiveDriver,
  type ScoreboardRiveStatus,
} from '@/ui/scoreboard/ScoreboardRiveDriver'
import {
  applyScoreboardEventToRive,
  type ScoreboardRiveEventApplication,
} from '@/ui/scoreboard/scoreboardRiveEventMapper'
import { ScoreboardRiveDebugPanel } from '@/ui/scoreboard/ScoreboardRiveDebugPanel'
import {
  initScoreboardAudio,
  playScoreboardSoundCue,
} from '@/ui/scoreboard/scoreboardSoundRouter'
import { ScoreboardSettingsPanel } from '@/ui/scoreboard/ScoreboardSettingsPanel'
import {
  isSameResolvedScoreboardSource,
  resolveScoreboardSource,
  type ResolvedScoreboardSource,
} from '@/ui/scoreboard/scoreboardSourceResolution'

type ScoreboardUiState = {
  riveState: ScoreboardRiveStatus['state']
  artboardName: string
  animationName: string
  stateMachineName: string
  riveBindingWarnings: readonly string[]
  sourceLuma: number
  sourceAlpha: number
  fps: number
  receiverStatus: ScoreboardReceiverStatus | null
  error: string | null
}

type RiveDebugLogEntry = {
  id: number
  time: string
  eventName: string
  trigger: string
  label: string
  details: string
}

const INITIAL_UI_STATE: ScoreboardUiState = {
  riveState: 'idle',
  artboardName: '-',
  animationName: '-',
  stateMachineName: '-',
  riveBindingWarnings: [],
  sourceLuma: 0,
  sourceAlpha: 0,
  fps: 0,
  receiverStatus: null,
  error: null,
}

const RIVE_DEBUG_LOG_MAX_ENTRIES = 8

function resolveCurrentSource(): ResolvedScoreboardSource {
  return resolveScoreboardSource(SCOREBOARD_SETTINGS.dmd.source)
}

function getCanvasLayout(): { size: number; offsetX: number; offsetY: number } {
  const margins = SCOREBOARD_SETTINGS.display.safeAreaPx
  const fallback = SCOREBOARD_SETTINGS.dmd.source.size
  const vw = typeof window === 'undefined' ? fallback : window.innerWidth
  const vh = typeof window === 'undefined' ? fallback : window.innerHeight
  const safeWidth = vw - margins.left - margins.right
  const safeHeight = vh - margins.top - margins.bottom
  return {
    size: Math.max(1, Math.max(safeWidth, safeHeight)),
    offsetX: (margins.left - margins.right) / 2,
    offsetY: (margins.top - margins.bottom) / 2,
  }
}

function formatLogTime(timestampMs: number): string {
  const date = new Date(timestampMs)
  const time = date.toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${time}.${date.getMilliseconds().toString().padStart(3, '0')}`
}

function truncateLogText(value: string, maxLength = 150): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

function describeScoreboardEvent(event: ScoreboardEvent): string {
  if (event.type === 'game_event_triggered') return `${event.type}:${event.eventId}`
  if (event.type === 'combo_triggered') return `${event.type}:x${event.multiplier}`
  if (event.type === 'points_received') return `${event.type}:${event.generatedBy}`
  return event.type
}

function describeRiveApplication(application: ScoreboardRiveEventApplication): Pick<RiveDebugLogEntry, 'trigger' | 'label' | 'details'> {
  const data = application.data
  const detailParts: string[] = []

  if (typeof data.gameEventId === 'string' && data.gameEventId.length > 0) {
    detailParts.push(`gameEventId=${data.gameEventId}`)
  }
  if (typeof data.eventBalloonType === 'string' && data.eventBalloonType.length > 0) {
    detailParts.push(`eventBalloonType=${data.eventBalloonType}`)
  }
  if (typeof data.comboMultiplier === 'number') {
    detailParts.push(`comboMultiplier=${data.comboMultiplier}`)
  }
  if (typeof data.scoreDelta === 'number') {
    detailParts.push(`scoreDelta=${data.scoreDelta}`)
  }
  if (typeof data.gameEventPayloadJson === 'string' && data.gameEventPayloadJson.length > 0) {
    detailParts.push(`payload=${truncateLogText(data.gameEventPayloadJson, 90)}`)
  }

  return {
    trigger: application.trigger ?? '-',
    label: typeof data.eventLabel === 'string' ? data.eventLabel : '-',
    details: detailParts.join(' | ') || '-',
  }
}

function createInitialScoreboardEvent(): ScoreboardEvent {
  return {
    type: 'idle_started',
    timestamp: Date.now(),
    runId: 'scoreboard-initial',
  }
}

export function ScoreboardPage() {
  const globalSettingsVersion = useSettingsVersion()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dmdRendererRef = useRef<ScoreboardDmdRenderer | null>(null)
  const riveDriverRef = useRef<ScoreboardRiveDriver | null>(null)
  const overlayVisibleRef = useRef(SCOREBOARD_SETTINGS.debug.showOverlayByDefault === true)
  const [overlayVisible, setOverlayVisible] = useState(
    SCOREBOARD_SETTINGS.debug.showOverlayByDefault === true,
  )
  const [debugPanelVisible, setDebugPanelVisible] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [scoreboardSettingsVersion, setScoreboardSettingsVersion] = useState(0)
  const [sourceConfigVersion, setSourceConfigVersion] = useState(0)
  const [appliedSource, setAppliedSource] = useState<ResolvedScoreboardSource>(() => resolveCurrentSource())
  const appliedSourceRef = useRef(appliedSource)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uiState, setUiState] = useState<ScoreboardUiState>(INITIAL_UI_STATE)
  const [latestScoreboardEvent, setLatestScoreboardEvent] = useState<ScoreboardEvent | null>(null)
  const [riveDebugLog, setRiveDebugLog] = useState<RiveDebugLogEntry[]>([])
  const riveDebugLogIdRef = useRef(0)

  useScoreboardInstallationWatchdog(uiState.receiverStatus, latestScoreboardEvent)
  useWebglContextLossReload()

  const appendRiveDebugLog = useCallback((
    event: ScoreboardEvent,
    application: ScoreboardRiveEventApplication | null,
  ) => {
    if (application && SCOREBOARD_SETTINGS.debug.logRiveEvents === true) {
      const nowMs = Date.now()
      const description = describeRiveApplication(application)
      riveDebugLogIdRef.current += 1
      const nextEntry = {
        id: riveDebugLogIdRef.current,
        time: formatLogTime(nowMs),
        eventName: describeScoreboardEvent(event),
        ...description,
      }
      setRiveDebugLog((prev) => [...prev, nextEntry].slice(-RIVE_DEBUG_LOG_MAX_ENTRIES))
    }
  }, [])

  const handleDebugTriggerEvent = useCallback((event: ScoreboardEvent) => {
    const application = riveDriverRef.current
      ? applyScoreboardEventToRive(riveDriverRef.current, event)
      : null
    appendRiveDebugLog(event, application)
    setLatestScoreboardEvent(event)
  }, [appendRiveDebugLog])

  useEffect(() => {
    overlayVisibleRef.current = overlayVisible
  }, [overlayVisible])

  useEffect(() => {
    appliedSourceRef.current = appliedSource
  }, [appliedSource])

  useEffect(() => {
    initScoreboardAudio()
  }, [])

  useEffect(() => {
    document.documentElement.style.cursor = 'none'
    return () => {
      document.documentElement.style.cursor = ''
    }
  }, [])

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
      if (isInstallationStopShortcut(event)) {
        event.preventDefault()
        requestInstallationStop()
        return
      }
      if (event.metaKey && event.code === 'Period') {
        event.preventDefault()
        setDebugPanelVisible((prev) => !prev)
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
    const canvas = canvasRef.current
    if (!canvas) return

    const applyCanvasLayout = () => {
      const { size, offsetX, offsetY } = getCanvasLayout()
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      canvas.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`
    }

    applyCanvasLayout()
    window.addEventListener('resize', applyCanvasLayout)
    return () => {
      window.removeEventListener('resize', applyCanvasLayout)
    }
  }, [sourceConfigVersion, globalSettingsVersion, scoreboardSettingsVersion])

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
    let unsubscribeHighScoreSnapshot: (() => void) | null = null
    let sourceCtx: CanvasRenderingContext2D | null = null
    let initialRiveDataApplied = false
    let riveReady = false
    let receivedRuntimeScoreboardEvent = false

    const setError = (message: string) => {
      setUiState((prev) => ({ ...prev, error: message }))
    }

    const applyInitialScoreboardData = (driver: ScoreboardRiveDriver) => {
      applyScoreboardEventToRive(driver, createHighScoresUpdatedEvent(), { fireTrigger: false })
      applyScoreboardEventToRive(driver, createLiveRankUpdatedEvent(), { fireTrigger: false })
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
        riveReady = status.state === 'ready'
        if (status.state === 'ready' && !initialRiveDataApplied) {
          initialRiveDataApplied = true
          const initialEvent = createInitialScoreboardEvent()
          const activeRiveDriver = riveDriverRef.current ?? riveDriver
          if (activeRiveDriver) {
            applyInitialScoreboardData(activeRiveDriver)
            applyScoreboardEventToRive(activeRiveDriver, initialEvent)
          }
          setLatestScoreboardEvent(initialEvent)
        }
        setUiState((prev) => ({
          ...prev,
          riveState: status.state,
          artboardName: status.artboardName ?? '-',
          animationName: status.animationName ?? '-',
          stateMachineName: status.stateMachineName ?? '-',
          riveBindingWarnings: status.bindingWarnings,
          error: status.error ?? prev.error,
        }))
      },
    })
    riveDriverRef.current = riveDriver

    unsubscribeHighScoreSnapshot = subscribeHighScoreSubmissionSnapshot(() => {
      if (disposed || !riveReady || receivedRuntimeScoreboardEvent) return
      const activeRiveDriver = riveDriverRef.current ?? riveDriver
      if (!activeRiveDriver) return
      applyInitialScoreboardData(activeRiveDriver)
    })

    const orchestrator = createScoreboardEventOrchestrator({
      onSoundCue: playScoreboardSoundCue,
    })

    unsubscribeReceiver = subscribeScoreboardEvents(
      (event) => {
        receivedRuntimeScoreboardEvent = true
        orchestrator.handleEvent(event)
        const application = riveDriver ? applyScoreboardEventToRive(riveDriver, event) : null
        appendRiveDebugLog(event, application)
        setLatestScoreboardEvent(event)
      },
      (receiverStatus) => {
        setUiState((prev) => ({ ...prev, receiverStatus }))
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
      unsubscribeHighScoreSnapshot?.()
      orchestrator.dispose()
      if (riveDriverRef.current === riveDriver) {
        riveDriverRef.current = null
      }
      riveDriver?.dispose()
      dmdRenderer?.dispose()
      dmdRendererRef.current = null
    }
  }, [
    appendRiveDebugLog,
    globalSettingsVersion,
    sourceConfigVersion,
    appliedSource.fit,
    appliedSource.height,
    appliedSource.width,
  ])

  return (
    <div style={styles.page}>
      <canvas ref={canvasRef} style={styles.canvas} />

      {overlayVisible && (
        <div style={styles.status}>
          <div style={styles.statusLine}>
            <span style={styles.label}>rive</span>
            <span style={styles.value}>{uiState.riveState}</span>
            <span style={styles.muted}>
              artboard: {uiState.artboardName} | animation: {uiState.animationName} | sm: {uiState.stateMachineName}
            </span>
          </div>
          {uiState.riveBindingWarnings.length > 0 && (
            <div style={styles.statusLine}>
              <span style={styles.label}>binding</span>
              <span style={styles.value}>{uiState.riveBindingWarnings.length} warn</span>
              <span style={styles.muted}>
                {uiState.riveBindingWarnings[uiState.riveBindingWarnings.length - 1]}
              </span>
            </div>
          )}
          <div style={styles.statusLine}>
            <span style={styles.label}>dmd fps</span>
            <span style={styles.value}>{uiState.fps}</span>
          </div>
          {uiState.receiverStatus && (
            <div style={styles.statusLine}>
              <span style={styles.label}>receiver</span>
              <span style={styles.value}>
                {uiState.receiverStatus.wsEnabled ? uiState.receiverStatus.wsState : 'broadcast'}
              </span>
              <span style={styles.muted}>{uiState.receiverStatus.wsUrl}</span>
            </div>
          )}
          <div style={styles.statusLine}>
            <span style={styles.label}>source</span>
            <span style={styles.value}>luma {uiState.sourceLuma}</span>
            <span style={styles.muted}>alpha {uiState.sourceAlpha}</span>
          </div>
          <div style={styles.statusLine}>
            <span style={styles.label}>source cfg</span>
            <span style={styles.value}>fixed square</span>
            <span style={styles.muted}>
              {appliedSource.width}x{appliedSource.height}
              {' | fit '}
              {appliedSource.fit}
              {' | dots '}
              {SCOREBOARD_SETTINGS.dmd.grid.dotsPerSide}
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

      {SCOREBOARD_SETTINGS.debug.logRiveEvents === true && (
        <div style={styles.riveLogPanel}>
          <div style={styles.riveLogHeader}>Rive event log · oldest top, newest bottom</div>
          {riveDebugLog.length === 0 ? (
            <div style={styles.riveLogEmpty}>Waiting for scoreboard events…</div>
          ) : (
            riveDebugLog.map((entry) => (
              <div key={`${entry.id}-${entry.eventName}`} style={styles.riveLogEntry}>
                <div style={styles.riveLogLine}>
                  <span style={styles.riveLogTime}>{entry.time}</span>
                  <span style={styles.riveLogEvent}>{entry.eventName}</span>
                  <span style={styles.riveLogTrigger}>{entry.trigger}</span>
                </div>
                <div style={styles.riveLogLabel}>{entry.label}</div>
                <div style={styles.riveLogDetails}>{entry.details}</div>
              </div>
            ))
          )}
        </div>
      )}

      {import.meta.env.DEV && (
        <ScoreboardRiveDebugPanel
          open={debugPanelVisible}
          latestEvent={latestScoreboardEvent}
          onTriggerEvent={handleDebugTriggerEvent}
        />
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
    top: '50%',
    left: '50%',
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
    pointerEvents: 'auto' as const,
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
  riveLogPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    maxHeight: '42vh',
    overflow: 'hidden',
    padding: '10px 12px',
    borderRadius: 8,
    background: 'rgba(0, 0, 0, 0.72)',
    color: '#d1fae5',
    pointerEvents: 'none' as const,
    zIndex: 30,
  },
  riveLogHeader: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  riveLogEmpty: {
    color: '#a7f3d0',
    fontSize: 12,
    opacity: 0.75,
  },
  riveLogEntry: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    paddingTop: 5,
    borderTop: '1px solid rgba(134, 239, 172, 0.18)',
    fontSize: 11,
    lineHeight: 1.25,
  },
  riveLogLine: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: 8,
    minWidth: 0,
  },
  riveLogTime: {
    color: '#bbf7d0',
    minWidth: 82,
    opacity: 0.75,
  },
  riveLogEvent: {
    color: '#ecfccb',
    fontWeight: 700,
    minWidth: 210,
  },
  riveLogTrigger: {
    color: '#fde68a',
    fontWeight: 700,
  },
  riveLogLabel: {
    color: '#bfdbfe',
    fontWeight: 700,
  },
  riveLogDetails: {
    color: '#a7f3d0',
    opacity: 0.82,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
