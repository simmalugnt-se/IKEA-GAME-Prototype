import { flushSync } from 'react-dom'
import type { GameFlowState } from '@/gameplay/gameplayStore'

type OverlayFlowTransitionKind = 'pair' | 'swap'
type OverlayFlowTransitionScope = 'flow' | 'step'

type OverlayFlowTransitionFlowOptions = {
  scope: 'flow'
  from: GameFlowState
  to: GameFlowState
  scenarioOverride?: string
}

type OverlayFlowTransitionStepOptions = {
  scope: 'step'
  from: number
  to: number
  kind?: OverlayFlowTransitionKind
}

type OverlayFlowTransitionOptions = (
  | OverlayFlowTransitionFlowOptions
  | OverlayFlowTransitionStepOptions
) & {
  seq: number
  commit: () => void
}

type ViewTransitionLike = {
  finished: Promise<unknown>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionLike
}

const ROOT_DATA_SCOPE_KEY = 'gfoVtScope'
const ROOT_DATA_SCENARIO_KEY = 'gfoVtScenario'
const ROOT_DATA_KIND_KEY = 'gfoVtKind'
const ROOT_DATA_SEQ_KEY = 'gfoVtSeq'

function resolveTransitionKind(from: GameFlowState, to: GameFlowState): OverlayFlowTransitionKind {
  const fromTravelToInput = from === 'game_over_travel' && to === 'game_over_input'
  const fromInputToTravel = from === 'game_over_input' && to === 'game_over_travel'
  return fromTravelToInput || fromInputToTravel ? 'pair' : 'swap'
}

function resolveTransitionMetadata(
  options: OverlayFlowTransitionOptions,
): {
  scope: OverlayFlowTransitionScope
  scenario: string
  kind: OverlayFlowTransitionKind
} {
  if (options.scope === 'step') {
    return {
      scope: 'step',
      scenario: `step:${options.from}>${options.to}`,
      kind: options.kind ?? 'pair',
    }
  }

  const scenarioOverride = typeof options.scenarioOverride === 'string'
    ? options.scenarioOverride.trim()
    : ''
  return {
    scope: 'flow',
    scenario: scenarioOverride.length > 0
      ? scenarioOverride
      : `flow:${options.from}>${options.to}`,
    kind: resolveTransitionKind(options.from, options.to),
  }
}

function applyTransitionDataset(
  root: HTMLElement,
  seq: number,
  scope: OverlayFlowTransitionScope,
  scenario: string,
  kind: OverlayFlowTransitionKind,
): void {
  root.dataset[ROOT_DATA_SCOPE_KEY] = scope
  root.dataset[ROOT_DATA_SCENARIO_KEY] = scenario
  root.dataset[ROOT_DATA_KIND_KEY] = kind
  root.dataset[ROOT_DATA_SEQ_KEY] = String(seq)
}

function clearTransitionDatasetIfOwned(root: HTMLElement, seq: number): void {
  if (root.dataset[ROOT_DATA_SEQ_KEY] !== String(seq)) return
  delete root.dataset[ROOT_DATA_SCOPE_KEY]
  delete root.dataset[ROOT_DATA_SCENARIO_KEY]
  delete root.dataset[ROOT_DATA_KIND_KEY]
  delete root.dataset[ROOT_DATA_SEQ_KEY]
}

export function runOverlayFlowTransition(options: OverlayFlowTransitionOptions): void {
  const { from, to, seq, commit } = options
  if (from === to) {
    commit()
    return
  }

  if (typeof document === 'undefined') {
    commit()
    return
  }

  const doc = document as DocumentWithViewTransition
  const root = doc.documentElement
  const metadata = resolveTransitionMetadata(options)
  applyTransitionDataset(root, seq, metadata.scope, metadata.scenario, metadata.kind)

  const startViewTransition = doc.startViewTransition
  if (typeof startViewTransition !== 'function') {
    commit()
    clearTransitionDatasetIfOwned(root, seq)
    return
  }

  try {
    const transition = startViewTransition.call(doc, () => {
      flushSync(() => {
        commit()
      })
    })

    void transition.finished
      .catch(() => {
        // Transition rejection should not break flow-state updates.
      })
      .finally(() => {
        clearTransitionDatasetIfOwned(root, seq)
      })
  } catch {
    commit()
    clearTransitionDatasetIfOwned(root, seq)
  }
}
