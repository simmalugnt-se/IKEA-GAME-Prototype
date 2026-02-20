import { useEffect } from 'react'
import { SETTINGS } from '@/settings/GameSettings'
import {
  applyExternalControlPacket,
  clearExternalControlState,
  parseExternalControlPacket,
  type ExternalControlPacket,
} from '@/input/control/ExternalControlStore'

const CONTROL_EVENT_NAME = 'ikea-game-control'

type ExternalControlWindowApi = {
  send: (packet: ExternalControlPacket) => void
  clear: () => void
}

declare global {
  interface Window {
    __IKEA_GAME_CONTROL__?: ExternalControlWindowApi
  }
}

function handleUnknownPacket(input: unknown) {
  const packet = parseExternalControlPacket(input)
  if (!packet) return
  applyExternalControlPacket(packet)
}

export function ExternalControlBridge() {
  useEffect(() => {
    const onControlEvent = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>
      handleUnknownPacket(customEvent.detail)
    }

    window.addEventListener(CONTROL_EVENT_NAME, onControlEvent as EventListener)
    const previousApi = window.__IKEA_GAME_CONTROL__
    window.__IKEA_GAME_CONTROL__ = {
      send: (packet) => applyExternalControlPacket(packet),
      clear: () => clearExternalControlState(),
    }

    return () => {
      window.removeEventListener(CONTROL_EVENT_NAME, onControlEvent as EventListener)
      if (previousApi === undefined) {
        delete window.__IKEA_GAME_CONTROL__
      } else {
        window.__IKEA_GAME_CONTROL__ = previousApi
      }
    }
  }, [])

  useEffect(() => {
    const websocketSettings = SETTINGS.controls.external.websocket
    if (!websocketSettings.enabled || !websocketSettings.url) return

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isDisposed = false

    const connect = () => {
      if (isDisposed) return
      ws = new WebSocket(websocketSettings.url)

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return

        try {
          const parsed = JSON.parse(event.data) as unknown
          handleUnknownPacket(parsed)
        } catch {
          // Ignorera icke-JSON payloads
        }
      }

      ws.onclose = () => {
        if (isDisposed) return
        reconnectTimer = setTimeout(connect, websocketSettings.reconnectMs)
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()

    return () => {
      isDisposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  return null
}
