import { parseScoreboardEvent, type ScoreboardEvent } from '@/scoreboard/scoreboardEvents'
import { CHANNEL_NAME } from '@/scoreboard/scoreboardSender'
import { SETTINGS } from '@/settings/GameSettings'

const DEDUPE_WINDOW_SIZE = 512

type WsReceiverState = 'disabled' | 'connecting' | 'open' | 'closed' | 'error'

type ScoreboardEventListener = (event: ScoreboardEvent) => void
type ScoreboardStatusListener = (status: ScoreboardReceiverStatus) => void

export type ScoreboardReceiverStatus = {
  wsEnabled: boolean
  wsState: WsReceiverState
  wsUrl: string
}

function createEventFingerprint(event: ScoreboardEvent): string {
  return `${event.type}|${event.runId}|${event.timestamp}`
}

function createDedupeWindow(size: number) {
  const ring = new Array<string>(size)
  const counts = new Map<string, number>()
  let writeIndex = 0
  let filled = 0

  return {
    isDuplicateOrRecord(key: string): boolean {
      const existingCount = counts.get(key)
      if (existingCount !== undefined && existingCount > 0) {
        return true
      }

      if (filled === size) {
        const evicted = ring[writeIndex]
        if (evicted) {
          const evictedCount = counts.get(evicted)
          if (evictedCount !== undefined) {
            if (evictedCount <= 1) counts.delete(evicted)
            else counts.set(evicted, evictedCount - 1)
          }
        }
      } else {
        filled += 1
      }

      ring[writeIndex] = key
      writeIndex = (writeIndex + 1) % size
      counts.set(key, 1)
      return false
    },
  }
}

function parseIncomingScoreboardData(data: unknown): ScoreboardEvent | null {
  const text = typeof data === 'string' ? data : null
  if (!text) return null
  return parseScoreboardEvent(text)
}

export function subscribeScoreboardEvents(
  onEvent: ScoreboardEventListener,
  onStatus?: ScoreboardStatusListener,
): () => void {
  const dedupe = createDedupeWindow(DEDUPE_WINDOW_SIZE)
  const wsEnabled = SETTINGS.scoreboard.websocket.enabled === true
  const wsUrl = SETTINGS.scoreboard.websocket.url
  let wsState: WsReceiverState = wsEnabled ? 'connecting' : 'disabled'

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const emitStatus = () => {
    if (!onStatus) return
    onStatus({ wsEnabled, wsState, wsUrl })
  }

  const pushIfUnique = (event: ScoreboardEvent) => {
    const key = createEventFingerprint(event)
    if (dedupe.isDuplicateOrRecord(key)) return
    onEvent(event)
  }

  const handleIncomingData = (data: unknown) => {
    const parsed = parseIncomingScoreboardData(data)
    if (!parsed) return
    pushIfUnique(parsed)
  }

  const bc = new BroadcastChannel(CHANNEL_NAME)
  bc.onmessage = (event) => {
    handleIncomingData(event.data)
  }

  const scheduleReconnect = () => {
    if (disposed || reconnectTimer) return
    const reconnectMs = Math.max(100, SETTINGS.scoreboard.websocket.reconnectMs)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectWs()
    }, reconnectMs)
  }

  const connectWs = () => {
    if (disposed || !wsEnabled) return
    if (!wsUrl) {
      wsState = 'error'
      emitStatus()
      return
    }

    wsState = 'connecting'
    emitStatus()

    try {
      ws = new WebSocket(wsUrl)
    } catch {
      ws = null
      wsState = 'error'
      emitStatus()
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      if (disposed) return
      wsState = 'open'
      emitStatus()
    }

    ws.onmessage = (event) => {
      handleIncomingData(event.data)
    }

    ws.onerror = () => {
      if (disposed) return
      wsState = 'error'
      emitStatus()
    }

    ws.onclose = () => {
      ws = null
      if (disposed) return
      wsState = 'closed'
      emitStatus()
      scheduleReconnect()
    }
  }

  emitStatus()
  if (wsEnabled) connectWs()

  return () => {
    disposed = true
    bc.close()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    ws?.close()
    ws = null
  }
}
