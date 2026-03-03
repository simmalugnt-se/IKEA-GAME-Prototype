import type { ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import { SETTINGS } from '@/settings/GameSettings'

const CHANNEL_NAME = 'ikea-game-scoreboard'
const MAX_QUEUE_SIZE = 200

let broadcastChannel: BroadcastChannel | null = null

function ensureBroadcastChannel(): BroadcastChannel {
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME)
  }
  return broadcastChannel
}

// --- WebSocket transport (optional, for cross-device/external display) ---

type WsBridgeState = {
  ws: WebSocket | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  isDisposed: boolean
  queue: string[]
  reconnectAttempt: number
}

const wsState: WsBridgeState = {
  ws: null,
  reconnectTimer: null,
  isDisposed: false,
  queue: [],
  reconnectAttempt: 0,
}

function flushWsQueue(): void {
  if (!wsState.ws || wsState.ws.readyState !== WebSocket.OPEN) return
  while (wsState.queue.length > 0) {
    const msg = wsState.queue.shift()
    if (msg !== undefined) {
      try {
        wsState.ws.send(msg)
      } catch {
        wsState.queue.unshift(msg)
        break
      }
    }
  }
}

function getReconnectDelayMs(baseDelayMs: number, attempt: number): number {
  const clampedBase = Math.max(100, baseDelayMs)
  const exponential = Math.min(15_000, clampedBase * 2 ** Math.min(attempt, 6))
  const jitter = Math.floor(exponential * 0.2 * Math.random())
  return exponential + jitter
}

function scheduleWsReconnect(): void {
  if (wsState.isDisposed || wsState.reconnectTimer) return
  const { reconnectMs } = SETTINGS.scoreboard.websocket
  const delayMs = getReconnectDelayMs(reconnectMs, wsState.reconnectAttempt)
  wsState.reconnectAttempt += 1
  wsState.reconnectTimer = setTimeout(() => {
    wsState.reconnectTimer = null
    connectWs()
  }, delayMs)
}

function connectWs(): void {
  if (wsState.isDisposed) return
  const { enabled, url } = SETTINGS.scoreboard.websocket
  if (!enabled || !url || wsState.ws) return

  try {
    wsState.ws = new WebSocket(url)
  } catch {
    wsState.ws = null
    scheduleWsReconnect()
    return
  }

  wsState.ws.onopen = () => {
    wsState.reconnectAttempt = 0
    flushWsQueue()
  }

  wsState.ws.onclose = () => {
    wsState.ws = null
    if (wsState.isDisposed) return
    scheduleWsReconnect()
  }

  wsState.ws.onerror = () => {
    // Let onclose drive reconnect.
  }
}

function disposeWs(): void {
  wsState.isDisposed = true
  if (wsState.reconnectTimer) {
    clearTimeout(wsState.reconnectTimer)
    wsState.reconnectTimer = null
  }
  wsState.reconnectAttempt = 0
  wsState.ws?.close()
  wsState.ws = null
  wsState.queue.length = 0
}

// --- Public API ---

export function initScoreboardBridge(): () => void {
  ensureBroadcastChannel()

  wsState.isDisposed = false
  connectWs()

  return () => {
    disposeWs()
  }
}

export function sendScoreboardEvent(event: ScoreboardEvent): void {
  const bc = ensureBroadcastChannel()
  const msg = JSON.stringify(event)

  bc.postMessage(msg)

  const { enabled } = SETTINGS.scoreboard.websocket
  if (enabled) {
    if (wsState.ws && wsState.ws.readyState === WebSocket.OPEN) {
      wsState.ws.send(msg)
    } else if (wsState.queue.length < MAX_QUEUE_SIZE) {
      wsState.queue.push(msg)
    }
  }
}

export { CHANNEL_NAME }
