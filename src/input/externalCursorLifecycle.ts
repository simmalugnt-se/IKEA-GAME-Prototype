export type ExternalCursorLifecycleEventName = 'idle_started' | 'run_started'

export type ExternalCursorLifecyclePayload = {
  type: 'game_lifecycle'
  event: ExternalCursorLifecycleEventName
  sentEpochMs: number
  runId?: string
  reason?: string
}

type LifecycleSender = (payload: ExternalCursorLifecyclePayload) => void

let activeSender: LifecycleSender | null = null
let latestPayload: ExternalCursorLifecyclePayload | null = null

export function registerExternalCursorLifecycleSender(sender: LifecycleSender): () => void {
  activeSender = sender
  if (latestPayload) {
    sender(latestPayload)
  }
  return () => {
    if (activeSender === sender) {
      activeSender = null
    }
  }
}

export function sendExternalCursorLifecycleEvent(
  event: ExternalCursorLifecycleEventName,
  options: {
    runId?: string
    reason?: string
  } = {},
): void {
  latestPayload = {
    type: 'game_lifecycle',
    event,
    sentEpochMs: Date.now(),
    ...options,
  }
  activeSender?.(latestPayload)
}
