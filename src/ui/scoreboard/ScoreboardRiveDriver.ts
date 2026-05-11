import { Fit, Layout, Rive } from '@rive-app/canvas'
import type {
  ViewModelInstanceEnum,
  ViewModelInstanceNumber,
  ViewModelInstanceString,
  ViewModelInstanceTrigger,
} from '@rive-app/canvas'
import type { ScoreboardRiveFit } from '@/scoreboard/scoreBoardSettings.types'

const RIVE_SOURCE_PATH = '/rive/scoreboard.riv'
const RIVE_LOAD_TIMEOUT_MS = 8000
const RIVE_ARTBOARD_NAME = 'MAIN'
const RIVE_STATE_MACHINE_NAME = 'Main state machine'
const RIVE_VIEW_MODEL_NAME = 'Scoreboard'

const NUMBER_PROPERTY_NAMES = [
  'score',
  'scoreDelta',
  'comboMultiplier',
  'lives',
  'rank',
  'eventTimestamp',
  'timeLimitMs',
  'livesLostAmount',
  'livesRemaining',
  'comboStrikeSize',
  'comboChainBonus',
  'comboPerPopPoints',
  'comboTotalPoints',
  'initialsDurationMs',
  'submittedAtMs',
  'totalEntries',
  'highScoreTopRank1',
  'highScoreTopScore1',
  'highScoreTopOpacity1',
  'highScoreTopRank2',
  'highScoreTopScore2',
  'highScoreTopOpacity2',
  'highScoreTopRank3',
  'highScoreTopScore3',
  'highScoreTopOpacity3',
  'highScoreTopRank4',
  'highScoreTopScore4',
  'highScoreTopOpacity4',
  'highScoreTopRank5',
  'highScoreTopScore5',
  'highScoreTopOpacity5',
  'listSlotRank1',
  'listSlotScore1',
  'listSlotOpacity1',
  'listSlotRank2',
  'listSlotScore2',
  'listSlotOpacity2',
  'listSlotRank3',
  'listSlotScore3',
  'listSlotOpacity3',
  'listSlotRank4',
  'listSlotScore4',
  'listSlotOpacity4',
  'listSlotRank5',
  'listSlotScore5',
  'listSlotOpacity5',
  'timebonusCurrentSeconds',
  'timebonusAwardedSeconds',
  'currentMinutes',
  'currentSeconds',
] as const

const STRING_PROPERTY_NAMES = [
  'eventLabel',
  'playerInitials',
  'runMode',
  'eventType',
  'runId',
  'generatedBy',
  'lifeLossReason',
  'gameOverReason',
  'gameEventId',
  'gameEventPayloadJson',
  'initialsFinishReason',
  'storageMode',
  'highScoreStorageMode',
  'highScoreTopInitials1',
  'highScoreTopInitials2',
  'highScoreTopInitials3',
  'highScoreTopInitials4',
  'highScoreTopInitials5',
  'listSlotInitials1',
  'listSlotInitials2',
  'listSlotInitials3',
  'listSlotInitials4',
  'listSlotInitials5',
] as const

const TRIGGER_PROPERTY_NAMES = [
  'triggerIdleStarted',
  'triggerGameStarted',
  'triggerPointsReceived',
  'triggerComboTriggered',
  'triggerSpecialEvent',
  'triggerLivesLost',
  'triggerGameOver',
  'triggerInitialsStepStarted',
  'triggerInitialsSubmitted',
  'triggerHighScoresUpdated',
  'triggerLiveRankChanged',
  'eventBalloonTrigger',
  'timebonusTrigger',
] as const

const ENUM_PROPERTY_NAMES = [
  'gameState',
  'eventBalloonType',
] as const

export type GameStateEnumValue = 'idle' | 'run' | 'gameover' | 'entry'
export type EventBalloonTypeEnumValue =
  | 'none'
  | 'ground_ball_wave_reward'
  | 'slowmo_reward'
  | 'track_sweeper_reward'
  | 'gravity_loss_reward'
  | 'combo_cluster_reward'

type NumberPropertyName = typeof NUMBER_PROPERTY_NAMES[number]
type StringPropertyName = typeof STRING_PROPERTY_NAMES[number]
type EnumPropertyName = typeof ENUM_PROPERTY_NAMES[number]
export type ScoreboardRiveTrigger = typeof TRIGGER_PROPERTY_NAMES[number]

type EnumValueByName = {
  gameState: GameStateEnumValue
  eventBalloonType: EventBalloonTypeEnumValue
}

export type ScoreboardRiveDataPatch = Partial<Record<NumberPropertyName, number>>
  & Partial<Record<StringPropertyName, string>>
  & Partial<{ [K in EnumPropertyName]: EnumValueByName[K] }>

type ScoreboardRiveBindings = {
  numbers: Partial<Record<NumberPropertyName, ViewModelInstanceNumber>>
  strings: Partial<Record<StringPropertyName, ViewModelInstanceString>>
  triggers: Partial<Record<ScoreboardRiveTrigger, ViewModelInstanceTrigger>>
  enums: Partial<Record<EnumPropertyName, ViewModelInstanceEnum>>
}

export type ScoreboardRiveStatus = {
  state: 'idle' | 'loading' | 'ready' | 'error'
  artboardName: string | null
  animationName: string | null
  stateMachineName: string | null
  bindingWarnings: readonly string[]
  error: string | null
}

type ScoreboardRiveStatusListener = (status: ScoreboardRiveStatus) => void

export type ScoreboardRiveDriverOptions = {
  sourceWidth: number
  sourceHeight: number
  riveFit: ScoreboardRiveFit
  onStatus?: ScoreboardRiveStatusListener
}

function resolveRiveFit(fit: ScoreboardRiveFit): Fit {
  if (fit === 'cover') return Fit.Cover
  if (fit === 'fill') return Fit.Fill
  return Fit.Contain
}

export class ScoreboardRiveDriver {
  private readonly sourceCanvas: HTMLCanvasElement
  private readonly sourceMountEl: HTMLDivElement
  private readonly sourceWidth: number
  private readonly sourceHeight: number
  private readonly riveFit: ScoreboardRiveFit
  private readonly status: ScoreboardRiveStatus = {
    state: 'idle',
    artboardName: null,
    animationName: null,
    stateMachineName: null,
    bindingWarnings: [],
    error: null,
  }
  private readonly onStatus?: ScoreboardRiveStatusListener
  private rive: Rive | null = null
  private bindings: ScoreboardRiveBindings | null = null
  private readonly bindingWarningSet = new Set<string>()
  private disposed = false
  private loadTimeoutId: ReturnType<typeof setTimeout> | null = null

  constructor(options: ScoreboardRiveDriverOptions) {
    this.onStatus = options.onStatus
    this.sourceWidth = Math.max(1, Math.floor(options.sourceWidth))
    this.sourceHeight = Math.max(1, Math.floor(options.sourceHeight))
    this.riveFit = options.riveFit
    this.sourceMountEl = document.createElement('div')
    this.sourceCanvas = document.createElement('canvas')
    this.sourceCanvas.width = this.sourceWidth
    this.sourceCanvas.height = this.sourceHeight
    this.sourceCanvas.style.width = `${this.sourceWidth}px`
    this.sourceCanvas.style.height = `${this.sourceHeight}px`
    this.sourceMountEl.style.position = 'fixed'
    this.sourceMountEl.style.left = '-10000px'
    this.sourceMountEl.style.top = '-10000px'
    this.sourceMountEl.style.width = `${this.sourceWidth}px`
    this.sourceMountEl.style.height = `${this.sourceHeight}px`
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
    return { ...this.status, bindingWarnings: [...this.status.bindingWarnings] }
  }

  applyScoreboardData(data: ScoreboardRiveDataPatch): void {
    if (this.disposed) return

    for (const name of NUMBER_PROPERTY_NAMES) {
      const value = data[name]
      if (value === undefined) continue
      if (!Number.isFinite(value)) {
        this.addBindingWarning(`Ignored non-finite Rive number "${name}".`)
        continue
      }
      const property = this.bindings?.numbers[name]
      if (!property) {
        this.addMissingPropertyWarning('number', name)
        continue
      }
      property.value = value
    }

    for (const name of STRING_PROPERTY_NAMES) {
      const value = data[name]
      if (value === undefined) continue
      const property = this.bindings?.strings[name]
      if (!property) {
        this.addMissingPropertyWarning('string', name)
        continue
      }
      property.value = value
    }

    for (const name of ENUM_PROPERTY_NAMES) {
      const value = data[name]
      if (value === undefined) continue
      const property = this.bindings?.enums[name]
      if (!property) {
        this.addMissingPropertyWarning('enum', name)
        continue
      }
      if (!property.values.includes(value)) {
        this.addBindingWarning(`Ignored unknown Rive enum value "${value}" for "${name}". Allowed: ${property.values.join(', ')}`)
        continue
      }
      const previousValue = property.value
      property.value = value
      if (name === 'eventBalloonType' && previousValue !== value) {
        this.fireScoreboardTrigger('eventBalloonTrigger')
      }
    }
  }

  fireScoreboardTrigger(triggerName: ScoreboardRiveTrigger): void {
    if (this.disposed) return
    const property = this.bindings?.triggers[triggerName]
    if (!property) {
      this.addMissingPropertyWarning('trigger', triggerName)
      return
    }
    property.trigger()
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
    this.onStatus?.({ ...this.status, bindingWarnings: [...this.status.bindingWarnings] })
  }

  private setStatusPartial(partial: Partial<ScoreboardRiveStatus>): void {
    if (partial.state !== undefined) this.status.state = partial.state
    if (partial.artboardName !== undefined) this.status.artboardName = partial.artboardName
    if (partial.animationName !== undefined) this.status.animationName = partial.animationName
    if (partial.stateMachineName !== undefined) this.status.stateMachineName = partial.stateMachineName
    if (partial.bindingWarnings !== undefined) this.status.bindingWarnings = [...partial.bindingWarnings]
    if (partial.error !== undefined) this.status.error = partial.error
    this.emitStatus()
  }

  private addBindingWarning(message: string): void {
    if (this.bindingWarningSet.has(message)) return
    this.bindingWarningSet.add(message)
    console.warn(`[ScoreboardRiveDriver] ${message}`)
    this.setStatusPartial({ bindingWarnings: [...this.bindingWarningSet] })
  }

  private addMissingPropertyWarning(kind: string, name: string): void {
    this.addBindingWarning(`Missing Rive ViewModel ${kind} property "${name}".`)
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
      bindingWarnings: [],
    })
    this.bindings = null
    this.bindingWarningSet.clear()

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
        const artboard = contents.artboards?.find((candidate) => candidate.name === RIVE_ARTBOARD_NAME)

        if (!artboard) {
          handled = true
          this.fail(`Rive load failed: artboard "${RIVE_ARTBOARD_NAME}" not found in ${RIVE_SOURCE_PATH}`)
          return
        }

        const stateMachine = artboard.stateMachines?.find(
          (candidate) => candidate.name === RIVE_STATE_MACHINE_NAME,
        )
        if (!stateMachine) {
          handled = true
          this.fail(
            `Rive load failed: state machine "${RIVE_STATE_MACHINE_NAME}" not found in artboard "${RIVE_ARTBOARD_NAME}"`,
          )
          return
        }

        this.sourceCanvas.width = this.sourceWidth
        this.sourceCanvas.height = this.sourceHeight

        rive.reset({
          artboard: RIVE_ARTBOARD_NAME,
          stateMachines: [RIVE_STATE_MACHINE_NAME],
          autoplay: true,
        })
        this.bindScoreboardViewModel(rive)

        if (!document.hidden) rive.startRendering()
        else rive.stopRendering()

        handled = true
        this.clearLoadTimeout()
        this.setStatusPartial({
          state: 'ready',
          artboardName: RIVE_ARTBOARD_NAME,
          animationName: null,
          stateMachineName: RIVE_STATE_MACHINE_NAME,
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
      layout: new Layout({ fit: resolveRiveFit(this.riveFit) }),
      autoplay: false,
      autoBind: false,
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

  private bindScoreboardViewModel(rive: Rive): void {
    const namedViewModel = rive.viewModelByName(RIVE_VIEW_MODEL_NAME)
    const defaultViewModel = rive.defaultViewModel()
    const viewModel = namedViewModel ?? defaultViewModel

    if (!namedViewModel) {
      this.addBindingWarning(`Missing Rive ViewModel "${RIVE_VIEW_MODEL_NAME}".`)
    }
    if (!viewModel) {
      this.bindings = null
      this.addBindingWarning('No Rive ViewModel available for scoreboard data binding.')
      return
    }
    if (viewModel.name !== RIVE_VIEW_MODEL_NAME) {
      this.addBindingWarning(
        `Using default Rive ViewModel "${viewModel.name}" because "${RIVE_VIEW_MODEL_NAME}" was not found.`,
      )
    }

    const instance = viewModel.defaultInstance() ?? viewModel.instance()
    if (!instance) {
      this.bindings = null
      this.addBindingWarning(`Rive ViewModel "${viewModel.name}" has no usable instance.`)
      return
    }

    rive.bindViewModelInstance(instance)

    const bindings: ScoreboardRiveBindings = {
      numbers: {},
      strings: {},
      triggers: {},
      enums: {},
    }

    for (const name of NUMBER_PROPERTY_NAMES) {
      const property = instance.number(name)
      if (property) bindings.numbers[name] = property
      else this.addMissingPropertyWarning('number', name)
    }

    for (const name of STRING_PROPERTY_NAMES) {
      const property = instance.string(name)
      if (property) bindings.strings[name] = property
      else this.addMissingPropertyWarning('string', name)
    }

    for (const name of TRIGGER_PROPERTY_NAMES) {
      const property = instance.trigger(name)
      if (property) bindings.triggers[name] = property
      else this.addMissingPropertyWarning('trigger', name)
    }

    for (const name of ENUM_PROPERTY_NAMES) {
      const property = instance.enum(name)
      if (property) bindings.enums[name] = property
      else this.addMissingPropertyWarning('enum', name)
    }

    this.bindings = bindings
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
