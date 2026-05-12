import { useGameplayStore } from '@/gameplay/gameplayStore'
import { getRunId } from '@/scoreboard/runId'
import { logDiagnosticsEvent } from '@/diagnostics/diagnosticsLogger'

let unsubscribe: (() => void) | null = null

export function initGameplayDiagnostics(): void {
  if (unsubscribe) return

  unsubscribe = useGameplayStore.subscribe((state, previousState) => {
    if (state.flowState !== previousState.flowState) {
      logDiagnosticsEvent('game_flow_state_changed', {
        gameRunId: getRunId(),
        previousFlowState: previousState.flowState,
        flowState: state.flowState,
        score: state.score,
        lastRunScore: state.lastRunScore,
        sessionHighScore: state.sessionHighScore,
        lives: state.lives,
        runMode: state.runMode,
        paused: state.paused,
      }, 'info')
    }

    if (state.paused !== previousState.paused) {
      logDiagnosticsEvent('game_pause_changed', {
        gameRunId: getRunId(),
        paused: state.paused,
        flowState: state.flowState,
        score: state.score,
        lives: state.lives,
      }, 'info')
    }
  })
}

