import { Fit, Layout, Rive } from '@rive-app/canvas'

const SOURCE_WIDTH = 240
const SOURCE_HEIGHT = 135
const RIVE_SOURCE_PATH = '/rive/scoreboard.riv'
const RIVE_LOAD_TIMEOUT_MS = 8000

export type ScoreboardRiveStatus = {
  state: 'idle' | 'loading' | 'ready' | 'error'
  artboardName: string | null
  animationName: string | null
  stateMachineName: string | null
  error: string | null
}

type ScoreboardRiveStatusListener = (status: ScoreboardRiveStatus) => void

export class ScoreboardRiveDriver {
  private readonly sourceCanvas: HTMLCanvasElement
  private readonly sourceMountEl: HTMLDivElement
  private readonly status: ScoreboardRiveStatus = {
    state: 'idle',
    artboardName: null,
    animationName: null,
    stateMachineName: null,
    error: null,
  }
  private readonly onStatus?: ScoreboardRiveStatusListener
  private rive: Rive | null = null
  private disposed = false
  private loadTimeoutId: ReturnType<typeof setTimeout> | null = null

  constructor(onStatus?: ScoreboardRiveStatusListener) {
    this.onStatus = onStatus
    this.sourceMountEl = document.createElement('div')
    this.sourceCanvas = document.createElement('canvas')
    this.sourceCanvas.width = SOURCE_WIDTH
    this.sourceCanvas.height = SOURCE_HEIGHT
    this.sourceCanvas.style.width = `${SOURCE_WIDTH}px`
    this.sourceCanvas.style.height = `${SOURCE_HEIGHT}px`
    this.sourceMountEl.style.position = 'fixed'
    this.sourceMountEl.style.left = '-10000px'
    this.sourceMountEl.style.top = '-10000px'
    this.sourceMountEl.style.width = `${SOURCE_WIDTH}px`
    this.sourceMountEl.style.height = `${SOURCE_HEIGHT}px`
    this.sourceMountEl.style.opacity = '0'
    this.sourceMountEl.style.pointerEvents = 'none'
    this.sourceMountEl.style.overflow = 'hidden'
    this.sourceMountEl.style.zIndex = '-1'
    this.sourceMountEl.appendChild(this.sourceCanvas)
    document.body.appendChild(this.sourceMountEl)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.load()
  }

  getCanvas(): HTMLCanvasElement {
    return this.sourceCanvas
  }

  getStatus(): ScoreboardRiveStatus {
    return this.status
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearLoadTimeout()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.rive?.cleanup()
    this.rive = null
    this.sourceMountEl.remove()
  }

  private emitStatus(): void {
    this.onStatus?.({ ...this.status })
  }

  private setStatusPartial(partial: Partial<ScoreboardRiveStatus>): void {
    if (partial.state !== undefined) this.status.state = partial.state
    if (partial.artboardName !== undefined) this.status.artboardName = partial.artboardName
    if (partial.animationName !== undefined) this.status.animationName = partial.animationName
    if (partial.stateMachineName !== undefined) this.status.stateMachineName = partial.stateMachineName
    if (partial.error !== undefined) this.status.error = partial.error
    this.emitStatus()
  }

  private fail(message: string): void {
    this.clearLoadTimeout()
    this.rive?.cleanup()
    this.rive = null
    this.setStatusPartial({
      state: 'error',
      error: message,
      artboardName: null,
      animationName: null,
      stateMachineName: null,
    })
  }

  private load(): void {
    this.setStatusPartial({
      state: 'loading',
      error: null,
      artboardName: null,
      animationName: null,
      stateMachineName: null,
    })

    let loadSignaled = false
    let errorSignaled = false
    let handled = false

    const tryHandleSignals = () => {
      if (handled || this.disposed) return
      const rive = this.rive
      if (!rive) return

      if (errorSignaled) {
        handled = true
        this.fail('Rive load failed: unable to load /rive/scoreboard.riv')
        return
      }

      if (!loadSignaled) return

      try {
        const contents = rive.contents
        const firstArtboard = contents.artboards?.[0]
        const firstAnimation = firstArtboard?.animations?.[0]
        const firstStateMachine = firstArtboard?.stateMachines?.[0]?.name

        if (!firstArtboard) {
          handled = true
          this.fail('Rive load failed: no artboard found in /rive/scoreboard.riv')
          return
        }

        this.sourceCanvas.width = SOURCE_WIDTH
        this.sourceCanvas.height = SOURCE_HEIGHT

        if (firstAnimation) {
          rive.reset({
            artboard: firstArtboard.name,
            animations: [firstAnimation],
            autoplay: false,
          })
          rive.play(firstAnimation, true)
        } else if (firstStateMachine) {
          rive.reset({
            artboard: firstArtboard.name,
            stateMachines: [firstStateMachine],
            autoplay: true,
          })
        } else {
          handled = true
          this.fail('Rive load failed: no animation or state machine found in first artboard')
          return
        }

        if (!document.hidden) rive.startRendering()
        else rive.stopRendering()

        handled = true
        this.clearLoadTimeout()
        this.setStatusPartial({
          state: 'ready',
          artboardName: firstArtboard.name,
          animationName: firstAnimation ?? null,
          stateMachineName: firstAnimation ? null : firstStateMachine ?? null,
          error: null,
        })
      } catch (error) {
        handled = true
        const message = error instanceof Error ? error.message : 'Rive load failed during initialization'
        this.fail(`Rive load failed: ${message}`)
      }
    }

    this.loadTimeoutId = setTimeout(() => {
      if (this.disposed || handled) return
      this.fail(`Rive load timeout after ${RIVE_LOAD_TIMEOUT_MS}ms (${RIVE_SOURCE_PATH})`)
    }, RIVE_LOAD_TIMEOUT_MS)

    const rive = new Rive({
      canvas: this.sourceCanvas,
      src: RIVE_SOURCE_PATH,
      layout: new Layout({ fit: Fit.Fill }),
      autoplay: false,
      onLoad: () => {
        if (this.disposed || handled) return
        loadSignaled = true
        queueMicrotask(tryHandleSignals)
      },
      onLoadError: () => {
        if (this.disposed || handled) return
        errorSignaled = true
        queueMicrotask(tryHandleSignals)
      },
    })
    this.rive = rive
    tryHandleSignals()
  }

  private readonly onVisibilityChange = () => {
    if (!this.rive || this.status.state !== 'ready') return
    if (document.hidden) {
      this.rive.stopRendering()
      return
    }
    this.rive.startRendering()
  }

  private clearLoadTimeout(): void {
    if (!this.loadTimeoutId) return
    clearTimeout(this.loadTimeoutId)
    this.loadTimeoutId = null
  }
}
