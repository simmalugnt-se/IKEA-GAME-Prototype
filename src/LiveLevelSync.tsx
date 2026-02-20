import { useEffect } from 'react'
import { SETTINGS } from '@/settings/GameSettings'
import { useSettingsVersion } from '@/settings/settingsStore'
import { useLevelStore } from './levelStore'
import type { LevelData } from './levelStore'

function parseLevelMessage(data: string): LevelData | null {
  try {
    const parsed = JSON.parse(data) as unknown
    if (parsed === null || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.version !== 'number' || !Array.isArray(obj.objects)) return null
    return { version: obj.version, objects: obj.objects }
  } catch {
    return null
  }
}

export function LiveLevelSync() {
  const settingsVersion = useSettingsVersion()
  const setLevelData = useLevelStore((state) => state.setLevelData)

  useEffect(() => {
    const { enabled, url, reconnectMs } = SETTINGS.level.liveSync
    if (!enabled || !url) return

    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isDisposed = false

    const connect = () => {
      if (isDisposed) return
      ws = new WebSocket(url)

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return
        const data = parseLevelMessage(event.data)
        if (data) setLevelData(data)
      }

      ws.onclose = () => {
        if (isDisposed) return
        reconnectTimer = setTimeout(connect, reconnectMs)
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
  }, [settingsVersion, setLevelData])

  return null
}
